import { sql } from './pg';
import { logger } from './logger';
import { parseJsonbField } from './json-safe';
import {
  listAsaasChargesForClient,
  getAsaasPayment,
  listAsaasInstallmentPayments,
  AsaasCharge,
} from './asaas-charges';
import { ensureSaleForPaidQuote } from './insurance-ops';
import { dispatchDomainEvent } from './triggers/dispatcher';

const PAID_ASAAS_STATUSES = [
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
  'received',
  'confirmed',
  'received_in_cash',
];

export interface AsaasReconcileQuoteResult {
  ok: boolean;
  cotacaoId: string;
  clientName?: string;
  statusBefore: string;
  statusAfter: string;
  updated: boolean;
  paid: boolean;
  chargesFound: number;
  paidChargeId?: string | null;
  saleId?: string | null;
  anachronicPurged?: boolean;
  message?: string;
  error?: string;
}

export interface AsaasBatchReconcileOptions {
  limit?: number;
  onlyPending?: boolean;
  partnerId?: string;
}

export interface AsaasBatchReconcileResult {
  totalProcessed: number;
  updatedToPaid: number;
  alreadyPaid: number;
  stillPending: number;
  errors: number;
  durationMs: number;
  details: AsaasReconcileQuoteResult[];
}

export interface AsaasSyncSummary {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
}

/**
 * Retorna contadores agregados de ordens de pagamento no sistema.
 */
export async function getAsaasSyncStatus(): Promise<AsaasSyncSummary> {
  const [row] = await sql<Array<{ total_orders: number; paid_orders: number; pending_orders: number }>>`
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE status IN ('paid', 'confirmed', 'received'))::int AS paid_orders,
      COUNT(*) FILTER (WHERE status NOT IN ('paid', 'confirmed', 'received', 'refunded', 'cancelled'))::int AS pending_orders
    FROM payment_orders
  `;

  return {
    totalOrders: row?.total_orders || 0,
    paidOrders: row?.paid_orders || 0,
    pendingOrders: row?.pending_orders || 0,
  };
}

/**
 * Reconcilia uma cotação individual consultando a API do Asaas em tempo real.
 * Se o pagamento constar como CONFIRMED (Cartão de Crédito ou Boleto/Pix compensado)
 * ou RECEIVED, atualiza payment_orders, payment_installments, emite a venda e
 * promove o status da cotação para 'aprovada'.
 */
function isChargeAnachronic(
  charge: { dateCreated?: string | null; paymentDate?: string | null; dueDate?: string | null; externalReference?: string | null },
  minTimestampMs: number,
  cotacaoId: string
): boolean {
  // Se a cobrança contiver externalReference explicitamente igual a esta cotação, foi emitida para ela
  if (charge.externalReference === cotacaoId) return false;

  // Se tiver dateCreated, valida a data de criação
  if (charge.dateCreated) {
    const t = new Date(charge.dateCreated).getTime();
    if (!isNaN(t) && t < minTimestampMs) return true;
  }

  // Se tiver paymentDate, valida pagamento
  if (charge.paymentDate) {
    const t = new Date(charge.paymentDate).getTime();
    if (!isNaN(t) && t < minTimestampMs) return true;
  }

  // Se tiver dueDate, valida vencimento
  if (charge.dueDate) {
    const t = new Date(charge.dueDate).getTime();
    if (!isNaN(t) && t < minTimestampMs) return true;
  }

  return false;
}

/**
 * Reconcilia uma cotação individual consultando a API do Asaas em tempo real.
 * Se o pagamento constar como CONFIRMED (Cartão de Crédito ou Boleto/Pix compensado)
 * ou RECEIVED, atualiza payment_orders, payment_installments, emite a venda e
 * promove o status da cotação para 'aprovada'.
 */
export async function reconcileAsaasForQuote(cotacaoId: string): Promise<AsaasReconcileQuoteResult> {
  const startTime = Date.now();

  try {
    const [cotacao] = await sql<Array<{
      id: string;
      client_id: string | null;
      partner_id: string;
      product_id: string;
      client_name: string | null;
      client_cpf_cnpj: string | null;
      importancia_segurada: number | null;
      premio_final: number | null;
      premio_calculado: number | null;
      status: string;
      client_data: unknown;
      created_at: string | Date;
    }>>`
      SELECT
        id, client_id, partner_id, product_id,
        client_name, client_cpf_cnpj, importancia_segurada,
        premio_final, premio_calculado, status, client_data,
        created_at
      FROM cotacoes
      WHERE id = ${cotacaoId}
      LIMIT 1
    `;

    if (!cotacao) {
      return {
        ok: false,
        cotacaoId,
        statusBefore: 'not_found',
        statusAfter: 'not_found',
        updated: false,
        paid: false,
        chargesFound: 0,
        error: 'Cotação não encontrada',
      };
    }

    const cotacaoCreatedAtMs = new Date(cotacao.created_at).getTime();
    // Tolerância de segurança de 24h para variações de fuso horário / relógio
    const minValidChargeMs = cotacaoCreatedAtMs - (24 * 60 * 60 * 1000);

    const clientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);

    // Ordem de pagamento atual no banco local
    let [order] = await sql<Array<{
      id: string;
      status: string;
      provider_customer_id: string | null;
      external_payment_id: string | null;
      external_installment_id: string | null;
      billing_type: string | null;
      amount_total: number;
      installment_count: number;
      paid_installments: number;
      due_date: string | null;
    }>>`
      SELECT
        id, status, provider_customer_id, external_payment_id,
        external_installment_id, billing_type,
        amount_total, installment_count, paid_installments,
        due_date::text AS due_date
      FROM payment_orders
      WHERE cotacao_id = ${cotacaoId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    // Buscar parcelas já gravadas no banco para esta cotação
    const existingInstallments = await sql<Array<{
      id: string;
      external_payment_id: string;
      external_installment_id: string | null;
      status: string;
      installment_number: number;
      due_date: string | null;
      paid_at: string | null;
    }>>`
      SELECT id, external_payment_id, external_installment_id, status, installment_number,
             due_date::text AS due_date, paid_at::text AS paid_at
      FROM payment_installments
      WHERE cotacao_id = ${cotacaoId}
      ORDER BY installment_number ASC
    `;

    // CustomerId em metadata do cliente
    let clientMetaCustomerId: string | null = null;
    let clientDoc = cotacao.client_cpf_cnpj;
    if (cotacao.client_id) {
      const [client] = await sql<Array<{ document_number: string; metadata: unknown }>>`
        SELECT document_number, metadata FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
      `;
      if (client) {
        if (!clientDoc) clientDoc = client.document_number;
        const meta = parseJsonbField<Record<string, unknown>>(client.metadata);
        clientMetaCustomerId = typeof meta.asaasCustomerId === 'string' ? meta.asaasCustomerId : null;
      }
    }

    // Identificação de IDs diretos para consulta
    const directPaymentIds = new Set<string>();
    if (typeof clientData.checkoutId === 'string' && clientData.checkoutId.trim()) {
      directPaymentIds.add(clientData.checkoutId.trim());
    }
    if (order?.external_payment_id && order.external_payment_id.trim()) {
      directPaymentIds.add(order.external_payment_id.trim());
    }
    for (const inst of existingInstallments) {
      if (inst.external_payment_id && inst.external_payment_id.trim()) {
        directPaymentIds.add(inst.external_payment_id.trim());
      }
    }

    let directInstallmentId: string | null = null;
    if (typeof clientData.externalInstallmentId === 'string' && clientData.externalInstallmentId.trim()) {
      directInstallmentId = clientData.externalInstallmentId.trim();
    } else if (order?.external_installment_id && order.external_installment_id.trim()) {
      directInstallmentId = order.external_installment_id.trim();
    } else {
      for (const inst of existingInstallments) {
        if (inst.external_installment_id && inst.external_installment_id.trim()) {
          directInstallmentId = inst.external_installment_id.trim();
          break;
        }
      }
    }

    let resolvedCharges: AsaasCharge[] = [];

    // 1. Tenta consulta direta por installmentId se já conhecido
    if (directInstallmentId) {
      const instResult = await listAsaasInstallmentPayments(directInstallmentId);
      if (instResult.ok && instResult.charges.length > 0) {
        const first = instResult.charges[0];
        if (first && isChargeAnachronic(first, minValidChargeMs, cotacao.id)) {
          logger.warn(
            { cotacaoId: cotacao.id, installmentId: directInstallmentId, dateCreated: first.dateCreated },
            'asaas.sync.anachronic_installment_discarded'
          );
        } else {
          resolvedCharges = instResult.charges;
        }
      }
    }

    // 2. Tenta consulta direta pelos IDs de pagamento
    if (resolvedCharges.length === 0 && directPaymentIds.size > 0) {
      for (const payId of directPaymentIds) {
        const payRes = await getAsaasPayment(payId);
        if (payRes.ok && payRes.charge) {
          const ch = payRes.charge;

          // Se a cobrança for anacrônica (data anterior à cotação), descarta sumariamente!
          if (isChargeAnachronic(ch, minValidChargeMs, cotacao.id)) {
            logger.warn(
              { cotacaoId: cotacao.id, payId: ch.id, dateCreated: ch.dateCreated, paymentDate: ch.paymentDate },
              'asaas.sync.anachronic_direct_charge_discarded'
            );
            continue;
          }

          // Se a cobrança for parcelada, busca todas as parcelas do carnê
          if (ch.installment) {
            const instResult = await listAsaasInstallmentPayments(ch.installment);
            if (instResult.ok && instResult.charges.length > 0) {
              const firstInst = instResult.charges[0];
              if (firstInst && !isChargeAnachronic(firstInst, minValidChargeMs, cotacao.id)) {
                resolvedCharges = instResult.charges;
                break;
              }
            }
          }
          resolvedCharges = [ch];
          break;
        }
      }
    }

    // Auto-correção e expurgo se a ordem existente no banco local era anacrônica
    let anachronicPurged = false;
    const existingOrderIsAnachronic = Boolean(
      order && (
        (order.due_date && new Date(order.due_date).getTime() < minValidChargeMs) ||
        (existingInstallments.some((inst) => inst.due_date && new Date(inst.due_date).getTime() < minValidChargeMs)) ||
        (existingInstallments.some((inst) => inst.paid_at && new Date(inst.paid_at).getTime() < minValidChargeMs)) ||
        (order.external_payment_id && directPaymentIds.has(order.external_payment_id) && resolvedCharges.length === 0)
      )
    );

    if (existingOrderIsAnachronic && order) {
      logger.warn(
        { cotacaoId: cotacao.id, orderId: order.id, externalId: order.external_payment_id },
        'asaas.sync.purging_anachronic_database_linkage'
      );

      await sql.begin(async (tx) => {
        await tx`DELETE FROM delinquency_notifications WHERE payment_order_id = ${order!.id}`;
        await tx`DELETE FROM payment_installments WHERE cotacao_id = ${cotacao.id}`;
        await tx`DELETE FROM payment_orders WHERE id = ${order!.id}`;
        await tx`DELETE FROM sales WHERE cotacao_id = ${cotacao.id} AND (policy_number IS NULL OR policy_number LIKE 'PRE-%')`;

        delete clientData.checkoutId;
        delete clientData.linkBoleto;
        delete clientData.dataVencimento;
        delete clientData.faturaId;
        delete clientData.externalInstallmentId;
        delete clientData.paidAt;
        delete clientData.pagoEm;

        const [sigDoc] = await tx<Array<{ status: string }>>`
          SELECT status FROM signature_documents WHERE cotacao_id = ${cotacao.id} AND status = 'signed' LIMIT 1
        `;
        const restoredStatus = sigDoc ? 'assinado' : (cotacao.status === 'aprovada' ? 'contrato_gerado' : cotacao.status);

        await tx`
          UPDATE cotacoes
          SET status = ${restoredStatus},
              client_data = ${JSON.stringify(clientData)}::jsonb,
              updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
        cotacao.status = restoredStatus;
      });

      order = undefined as any;
      anachronicPurged = true;
    }

    // 3. Fallback: consulta cobranças no Asaas por customerId e CPF/CNPJ
    if (resolvedCharges.length === 0) {
      const lookup = await listAsaasChargesForClient({
        customerIds: [
          typeof clientData.clienteId === 'string' ? clientData.clienteId : null,
          typeof clientData.asaasCustomerId === 'string' ? clientData.asaasCustomerId : null,
          order?.provider_customer_id ?? null,
          clientMetaCustomerId,
        ],
        cpfCnpj: clientDoc,
      });

      // Filtra estritamente cobranças candidatas:
      // - Não deletadas
      // - Sem externalReference divergente
      // - Não anacrônicas (criadas na data da cotação vigente ou após)
      const eligibleCharges = (lookup.charges || []).filter((c) => {
        if (c.deleted) return false;
        if (c.externalReference && c.externalReference !== cotacao.id) return false;
        if (isChargeAnachronic(c, minValidChargeMs, cotacao.id)) return false;
        return true;
      });

      if (eligibleCharges.length > 0) {
        const targetValue = Number(cotacao.premio_final || cotacao.premio_calculado || order?.amount_total || 0);
        const qtdParcelas = Number(order?.installment_count) || 1;
        const targetParcelaValue = qtdParcelas > 0 ? targetValue / qtdParcelas : targetValue;

        // Prioridade 1: externalReference idêntica a esta cotação
        let matchedCharge = eligibleCharges.find((c) => c.externalReference === cotacao.id);

        // Prioridade 2: ID exato válido
        if (!matchedCharge) {
          matchedCharge = eligibleCharges.find((c) => directPaymentIds.has(c.id));
        }

        // Prioridade 3: Cobrança paga com mesmo valor ou valor de parcela
        if (!matchedCharge && targetValue > 0) {
          matchedCharge = eligibleCharges.find(
            (c) =>
              PAID_ASAAS_STATUSES.includes(c.status) &&
              (Math.abs(c.value - targetValue) < 0.15 || (qtdParcelas > 1 && Math.abs(c.value - targetParcelaValue) < 0.15))
          );
        }

        // Prioridade 4: Cobrança pendente com mesmo valor ou valor de parcela
        if (!matchedCharge && targetValue > 0) {
          matchedCharge = eligibleCharges.find(
            (c) =>
              (Math.abs(c.value - targetValue) < 0.15 || (qtdParcelas > 1 && Math.abs(c.value - targetParcelaValue) < 0.15))
          );
        }

        if (matchedCharge) {
          if (matchedCharge.installment) {
            const instResult = await listAsaasInstallmentPayments(matchedCharge.installment);
            if (instResult.ok && instResult.charges.length > 0) {
              resolvedCharges = instResult.charges;
            } else {
              resolvedCharges = [matchedCharge];
            }
          } else {
            resolvedCharges = [matchedCharge];
          }
        }
      }
    }

    if (resolvedCharges.length === 0) {
      return {
        ok: true,
        cotacaoId,
        clientName: cotacao.client_name || undefined,
        statusBefore: cotacao.status,
        statusAfter: cotacao.status,
        updated: anachronicPurged,
        paid: false,
        chargesFound: 0,
        anachronicPurged,
        message: anachronicPurged
          ? 'Cobrança antiga histórica do cliente foi desvinculada com sucesso. Nenhuma cobrança referente a esta cotação foi localizada.'
          : undefined,
      };
    }

    const totalApolice = Number(
      order?.amount_total || cotacao.premio_final || cotacao.premio_calculado ||
      resolvedCharges.reduce((acc, c) => acc + (c.value || 0), 0)
    );
    const resolvedInstallmentCount = resolvedCharges.length > 1
      ? resolvedCharges.length
      : (order?.installment_count || 1);

    const primaryCharge = resolvedCharges[0];
    let paymentOrderId = order?.id;

    if (!paymentOrderId) {
      const [newOrder] = await sql<Array<{ id: string }>>`
        INSERT INTO payment_orders (
          cotacao_id,
          client_id,
          partner_id,
          product_id,
          provider,
          provider_customer_id,
          external_payment_id,
          external_installment_id,
          billing_type,
          status,
          amount_total,
          installment_count,
          paid_installments,
          paid_amount,
          due_date,
          invoice_url,
          bank_slip_url,
          raw_payload,
          updated_at
        )
        VALUES (
          ${cotacao.id},
          ${cotacao.client_id},
          ${cotacao.partner_id},
          ${cotacao.product_id},
          'asaas',
          ${primaryCharge.customer || null},
          ${primaryCharge.id},
          ${primaryCharge.installment || null},
          ${primaryCharge.billingType || 'UNDEFINED'},
          'pending',
          ${totalApolice},
          ${resolvedInstallmentCount},
          0,
          0,
          ${primaryCharge.dueDate ? primaryCharge.dueDate : null}::date,
          ${primaryCharge.invoiceUrl || null},
          ${primaryCharge.bankSlipUrl || null},
          ${JSON.stringify(primaryCharge)}::jsonb,
          NOW()
        )
        ON CONFLICT (cotacao_id)
        DO UPDATE SET
          provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, payment_orders.provider_customer_id),
          external_payment_id = COALESCE(EXCLUDED.external_payment_id, payment_orders.external_payment_id),
          external_installment_id = COALESCE(EXCLUDED.external_installment_id, payment_orders.external_installment_id),
          updated_at = NOW()
        RETURNING id
      `;
      paymentOrderId = newOrder.id;
    }

    let paidCount = 0;
    let paidAmount = 0;
    let firstPaidCharge: AsaasCharge | undefined;

    // Sincronizar/atualizar cada registro correspondente na tabela payment_installments
    for (const charge of resolvedCharges) {
      const isPaid = PAID_ASAAS_STATUSES.includes(charge.status) && !charge.deleted;
      const normalizedStatus = (charge.status || 'PENDING').toLowerCase();
      const paidAtVal = isPaid
        ? (charge.paymentDate ? charge.paymentDate : new Date().toISOString())
        : null;

      if (isPaid) {
        paidCount++;
        paidAmount += charge.value;
        if (!firstPaidCharge) firstPaidCharge = charge;
      }

      await sql`
        INSERT INTO payment_installments (
          payment_order_id,
          cotacao_id,
          client_id,
          provider,
          external_payment_id,
          external_installment_id,
          installment_number,
          status,
          billing_type,
          amount,
          net_amount,
          due_date,
          paid_at,
          invoice_url,
          bank_slip_url,
          raw_payload,
          updated_at
        )
        VALUES (
          ${paymentOrderId},
          ${cotacao.id},
          ${cotacao.client_id},
          'asaas',
          ${charge.id},
          ${charge.installment || null},
          ${charge.installmentNumber || 1},
          ${normalizedStatus},
          ${charge.billingType || 'UNDEFINED'},
          ${charge.value},
          ${charge.netValue != null ? charge.netValue : null},
          ${charge.dueDate ? charge.dueDate : null}::date,
          ${paidAtVal ? paidAtVal : null}::timestamptz,
          ${charge.invoiceUrl || null},
          ${charge.bankSlipUrl || null},
          ${JSON.stringify(charge)}::jsonb,
          NOW()
        )
        ON CONFLICT (provider, external_payment_id)
        DO UPDATE SET
          payment_order_id = EXCLUDED.payment_order_id,
          status = EXCLUDED.status,
          net_amount = EXCLUDED.net_amount,
          due_date = EXCLUDED.due_date,
          paid_at = COALESCE(EXCLUDED.paid_at, payment_installments.paid_at),
          invoice_url = COALESCE(EXCLUDED.invoice_url, payment_installments.invoice_url),
          bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_installments.bank_slip_url),
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `;
    }

    const hasAtLeastOnePaid = paidCount > 0;
    const isInstallmentCarnet = resolvedInstallmentCount > 1;
    const isFullyPaid = !isInstallmentCarnet || paidCount >= resolvedInstallmentCount;
    const orderStatus = hasAtLeastOnePaid
      ? (isFullyPaid ? 'paid' : 'partially_paid')
      : 'pending';

    const activeCharge = firstPaidCharge || primaryCharge;

    // Atualiza a ordem de pagamento
    await sql`
      UPDATE payment_orders
      SET
        status = ${orderStatus},
        paid_installments = ${paidCount},
        paid_amount = ${paidAmount},
        amount_total = COALESCE(amount_total, ${totalApolice}),
        installment_count = ${resolvedInstallmentCount},
        external_payment_id = COALESCE(external_payment_id, ${activeCharge.id}),
        external_installment_id = COALESCE(external_installment_id, ${activeCharge.installment || null}),
        billing_type = COALESCE(${activeCharge.billingType || null}, billing_type),
        invoice_url = COALESCE(${activeCharge.invoiceUrl || null}, invoice_url),
        bank_slip_url = COALESCE(${activeCharge.bankSlipUrl || null}, bank_slip_url),
        raw_payload = ${JSON.stringify(activeCharge)}::jsonb,
        updated_at = NOW()
      WHERE id = ${paymentOrderId}
    `;

    // Atualiza client_data na cotação
    clientData.checkoutId = activeCharge.id;
    if (activeCharge.installment) clientData.externalInstallmentId = activeCharge.installment;
    if (activeCharge.invoiceUrl) clientData.linkBoleto = activeCharge.invoiceUrl;
    if (activeCharge.dueDate) clientData.dataVencimento = activeCharge.dueDate;

    if (!hasAtLeastOnePaid) {
      await sql`
        UPDATE cotacoes
        SET
          client_data = ${JSON.stringify(clientData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${cotacao.id}
      `;

      return {
        ok: true,
        cotacaoId,
        clientName: cotacao.client_name || undefined,
        statusBefore: cotacao.status,
        statusAfter: cotacao.status,
        updated: false,
        paid: false,
        chargesFound: resolvedCharges.length,
      };
    }

    // Se está paga, atualiza cotação para 'aprovada' e premio_final
    await sql`
      UPDATE cotacoes
      SET
        status = 'aprovada',
        premio_final = ${totalApolice},
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // Emite a venda e comissões se aplicável
    const saleResult = await ensureSaleForPaidQuote({
      cotacaoId: cotacao.id,
      clientId: cotacao.client_id,
      partnerId: cotacao.partner_id,
      productId: cotacao.product_id,
      importanciaSegurada: Number(cotacao.importancia_segurada) || 0,
      premioFinal: totalApolice,
    });

    // Se a venda foi criada pela primeira vez, despacha evento PAGAMENTO_CONFIRMADO
    if (saleResult.created) {
      try {
        const [clientRow] = cotacao.client_id
          ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
              SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
            `
          : [];

        const [partnerRow] = await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
          SELECT
            COALESCE(p.nome_fantasia, p.razao_social) AS nome,
            COALESCE(NULLIF(p.email, ''), pu.email) AS email,
            p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
          FROM partners p
          LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
          WHERE p.id = ${cotacao.partner_id}
          ORDER BY pu.created_at ASC
          LIMIT 1
        `;

        await dispatchDomainEvent('PAGAMENTO_CONFIRMADO', {
          eventType: 'PAGAMENTO_CONFIRMADO',
          contextId: cotacao.id,
          cliente: {
            nome: clientRow?.full_name,
            email: clientRow?.email,
            documento: clientRow?.document_number,
            telefone: clientRow?.phone,
          },
          parceiro: partnerRow
            ? {
                id: cotacao.partner_id,
                nome: partnerRow.nome,
                email: partnerRow.email,
                codigoVenda: partnerRow.codigo_venda,
              }
            : undefined,
          dados: {
            cotacaoId: cotacao.id,
            valor: totalApolice,
            formaPagamento: activeCharge.billingType,
            statusPagamento: activeCharge.status,
            chargeId: activeCharge.id,
          },
        });
      } catch (eventErr) {
        logger.warn({ eventErr, cotacaoId: cotacao.id }, 'asaas.reconcile.dispatch_event_failed');
      }
    }

    logger.info(
      { cotacaoId: cotacao.id, chargeId: activeCharge.id, durationMs: Date.now() - startTime },
      'Asaas reconcile success: quote approved and payment orders updated'
    );

    return {
      ok: true,
      cotacaoId,
      clientName: cotacao.client_name || undefined,
      statusBefore: cotacao.status,
      statusAfter: 'aprovada',
      updated: true,
      paid: true,
      chargesFound: resolvedCharges.length,
      paidChargeId: activeCharge.id,
      saleId: saleResult.saleId,
    };
  } catch (err) {
    logger.error({ err, cotacaoId }, 'asaas.reconcile.failed');
    return {
      ok: false,
      cotacaoId,
      statusBefore: 'unknown',
      statusAfter: 'unknown',
      updated: false,
      paid: false,
      chargesFound: 0,
      error: err instanceof Error ? err.message : 'Erro ao reconciliar cobrança com o Asaas',
    };
  }
}

/**
 * Reconcilia em lote todas as cotações pendentes com o Asaas.
 */
export async function reconcileAsaasBatch(
  options: AsaasBatchReconcileOptions = {}
): Promise<AsaasBatchReconcileResult> {
  const startTime = Date.now();
  const limit = Math.max(1, Math.min(options.limit || 50, 100));

  // Seleciona cotações pendentes que possuem checkoutId ou que estejam em status elegíveis,
  // mesmo se o registro payment_orders ainda não tiver sido gravado
  const quotes = await sql<Array<{ id: string }>>`
    SELECT c.id
    FROM cotacoes c
    WHERE (
      c.status IN ('enviada', 'rascunho', 'pagamento_gerado', 'contrato_gerado', 'assinado')
      OR (c.client_data->>'checkoutId' IS NOT NULL AND c.status != 'aprovada')
    )
      ${options.partnerId ? sql`AND c.partner_id = ${options.partnerId}` : sql``}
      ${options.onlyPending !== false ? sql`
        AND (
          EXISTS (
            SELECT 1 FROM payment_orders po
            WHERE po.cotacao_id = c.id
              AND po.status NOT IN ('paid', 'confirmed', 'received')
          )
          OR NOT EXISTS (
            SELECT 1 FROM payment_orders po
            WHERE po.cotacao_id = c.id
          )
          OR (c.client_data->>'checkoutId' IS NOT NULL)
        )
      ` : sql``}
    ORDER BY c.updated_at DESC
    LIMIT ${limit}
  `;

  let updatedToPaid = 0;
  let alreadyPaid = 0;
  let stillPending = 0;
  let errors = 0;
  const details: AsaasReconcileQuoteResult[] = [];

  for (const q of quotes) {
    const res = await reconcileAsaasForQuote(q.id);
    details.push(res);

    if (res.updated && res.paid) {
      updatedToPaid++;
    } else if (res.paid) {
      alreadyPaid++;
    } else if (res.error) {
      errors++;
    } else {
      stillPending++;
    }

    // Pequeno throttle de 150ms para respeitar limites de taxa da API Asaas
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    totalProcessed: quotes.length,
    updatedToPaid,
    alreadyPaid,
    stillPending,
    errors,
    durationMs: Date.now() - startTime,
    details,
  };
}
