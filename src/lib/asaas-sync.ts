import { sql } from './pg';
import { logger } from './logger';
import { parseJsonbField } from './json-safe';
import { listAsaasChargesForClient, AsaasCharge } from './asaas-charges';
import { ensureSaleForPaidQuote } from './insurance-ops';
import { dispatchDomainEvent } from './triggers/dispatcher';

const PAID_ASAAS_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

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
    }>>`
      SELECT
        id, client_id, partner_id, product_id,
        client_name, client_cpf_cnpj, importancia_segurada,
        premio_final, premio_calculado, status, client_data
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

    const clientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);

    // Ordem de pagamento atual no banco local
    const [order] = await sql<Array<{
      id: string;
      status: string;
      provider_customer_id: string | null;
      external_payment_id: string | null;
      amount_total: number;
      installment_count: number;
      paid_installments: number;
    }>>`
      SELECT
        id, status, provider_customer_id, external_payment_id,
        amount_total, installment_count, paid_installments
      FROM payment_orders
      WHERE cotacao_id = ${cotacaoId}
      ORDER BY created_at DESC
      LIMIT 1
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

    // Consulta cobranças no Asaas por customerId e CPF/CNPJ
    const lookup = await listAsaasChargesForClient({
      customerIds: [
        typeof clientData.clienteId === 'string' ? clientData.clienteId : null,
        typeof clientData.asaasCustomerId === 'string' ? clientData.asaasCustomerId : null,
        order?.provider_customer_id ?? null,
        clientMetaCustomerId,
      ],
      cpfCnpj: clientDoc,
    });

    const charges = lookup.charges || [];
    if (charges.length === 0) {
      return {
        ok: true,
        cotacaoId,
        clientName: cotacao.client_name || undefined,
        statusBefore: cotacao.status,
        statusAfter: cotacao.status,
        updated: false,
        paid: false,
        chargesFound: 0,
      };
    }

    // Identifica a cobrança correspondente
    const targetChargeIds = new Set<string>();
    if (typeof clientData.checkoutId === 'string') targetChargeIds.add(clientData.checkoutId);
    if (order?.external_payment_id) targetChargeIds.add(order.external_payment_id);

    // Seleciona as cobranças pagas ou confirmadas
    const paidCharges = charges.filter((c) =>
      PAID_ASAAS_STATUSES.includes(c.status?.toUpperCase() ?? '') && !c.deleted
    );

    // Encontra a melhor cobrança paga/confirmada:
    // 1º Prioridade: correspondência exata de ID (checkoutId ou external_payment_id)
    // 2º Prioridade: cobrança confirmada do mesmo valor do prêmio
    // 3º Prioridade: cobrança confirmada mais recente do cliente
    let matchedPaidCharge: AsaasCharge | undefined;
    if (targetChargeIds.size > 0) {
      matchedPaidCharge = paidCharges.find((c) => targetChargeIds.has(c.id));
    }
    if (!matchedPaidCharge && paidCharges.length > 0) {
      const targetValue = Number(cotacao.premio_final || cotacao.premio_calculado || order?.amount_total || 0);
      matchedPaidCharge = paidCharges.find((c) => Math.abs(c.value - targetValue) < 0.05) || paidCharges[0];
    }

    if (!matchedPaidCharge) {
      // Nenhuma cobrança paga localizada
      return {
        ok: true,
        cotacaoId,
        clientName: cotacao.client_name || undefined,
        statusBefore: cotacao.status,
        statusAfter: cotacao.status,
        updated: false,
        paid: false,
        chargesFound: charges.length,
      };
    }

    // Cobrança confirmada/paga localizada! Atualiza ordem e parcelas no banco
    const totalApolice = Number(
      order?.amount_total || cotacao.premio_final || cotacao.premio_calculado || matchedPaidCharge.value
    );
    const qtdParcelas = order?.installment_count || 1;

    // 1. Atualiza ou insere a ordem de pagamento
    if (order) {
      await sql`
        UPDATE payment_orders
        SET
          status = 'paid',
          paid_installments = ${qtdParcelas},
          paid_amount = ${totalApolice},
          external_payment_id = COALESCE(${matchedPaidCharge.id}, external_payment_id),
          invoice_url = COALESCE(${matchedPaidCharge.invoiceUrl || null}, invoice_url),
          bank_slip_url = COALESCE(${matchedPaidCharge.bankSlipUrl || null}, bank_slip_url),
          raw_payload = ${JSON.stringify(matchedPaidCharge)}::jsonb,
          updated_at = NOW()
        WHERE id = ${order.id}
      `;
    } else {
      await sql`
        INSERT INTO payment_orders (
          cotacao_id,
          client_id,
          partner_id,
          product_id,
          provider,
          provider_customer_id,
          external_payment_id,
          billing_type,
          status,
          amount_total,
          installment_count,
          paid_installments,
          paid_amount,
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
          ${matchedPaidCharge.customer || null},
          ${matchedPaidCharge.id},
          ${matchedPaidCharge.billingType || 'CREDIT_CARD'},
          'paid',
          ${totalApolice},
          ${qtdParcelas},
          ${qtdParcelas},
          ${totalApolice},
          ${matchedPaidCharge.invoiceUrl || null},
          ${matchedPaidCharge.bankSlipUrl || null},
          ${JSON.stringify(matchedPaidCharge)}::jsonb,
          NOW()
        )
        ON CONFLICT (cotacao_id)
        DO UPDATE SET
          status = 'paid',
          paid_installments = EXCLUDED.paid_installments,
          paid_amount = EXCLUDED.paid_amount,
          external_payment_id = EXCLUDED.external_payment_id,
          invoice_url = EXCLUDED.invoice_url,
          bank_slip_url = EXCLUDED.bank_slip_url,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `;
    }

    // 2. Atualiza client_data na cotação
    clientData.checkoutId = matchedPaidCharge.id;
    if (matchedPaidCharge.invoiceUrl) clientData.linkBoleto = matchedPaidCharge.invoiceUrl;
    if (matchedPaidCharge.dueDate) clientData.dataVencimento = matchedPaidCharge.dueDate;
    await sql`
      UPDATE cotacoes
      SET
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // 3. Emite a venda e comissões se aplicável
    const saleResult = await ensureSaleForPaidQuote({
      cotacaoId: cotacao.id,
      clientId: cotacao.client_id,
      partnerId: cotacao.partner_id,
      productId: cotacao.product_id,
      importanciaSegurada: Number(cotacao.importancia_segurada) || 0,
      premioFinal: totalApolice,
    });

    // 4. Se a venda foi criada pela primeira vez, despacha evento PAGAMENTO_CONFIRMADO
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
            formaPagamento: matchedPaidCharge.billingType,
            statusPagamento: matchedPaidCharge.status,
            chargeId: matchedPaidCharge.id,
          },
        });
      } catch (eventErr) {
        logger.warn({ eventErr, cotacaoId: cotacao.id }, 'asaas.reconcile.dispatch_event_failed');
      }
    }

    logger.info(
      { cotacaoId: cotacao.id, chargeId: matchedPaidCharge.id, durationMs: Date.now() - startTime },
      'Asaas reconcile success: quote approved and payment orders set to paid'
    );

    return {
      ok: true,
      cotacaoId,
      clientName: cotacao.client_name || undefined,
      statusBefore: cotacao.status,
      statusAfter: 'aprovada',
      updated: true,
      paid: true,
      chargesFound: charges.length,
      paidChargeId: matchedPaidCharge.id,
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

  // Seleciona cotações pendentes que possuem cliente associado e ainda não estão aprovadas/emitidas
  const quotes = await sql<Array<{ id: string }>>`
    SELECT c.id
    FROM cotacoes c
    WHERE c.status IN ('enviada', 'rascunho', 'pagamento_gerado', 'contrato_gerado', 'assinado')
      ${options.partnerId ? sql`AND c.partner_id = ${options.partnerId}` : sql``}
      ${options.onlyPending !== false ? sql`
        AND EXISTS (
          SELECT 1 FROM payment_orders po
          WHERE po.cotacao_id = c.id
            AND po.status NOT IN ('paid', 'confirmed', 'received')
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
