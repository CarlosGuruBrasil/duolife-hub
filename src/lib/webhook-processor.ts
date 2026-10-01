import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { ensureSaleForPaidQuote } from '@/lib/insurance-ops';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { findPartnerByWixCode, logSyncEvent, normalizeWixRecord } from '@/lib/wix-sync';
import { parseJsonbField } from '@/lib/json-safe';

// ==========================================
// Helpers Asaas
// ==========================================

function normalizeAsaasStatus(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function isPaidEvent(event: string): boolean {
  return event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
}

function isOverdueEvent(event: string): boolean {
  return event === 'PAYMENT_OVERDUE';
}

function isRefundedEvent(event: string): boolean {
  return event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_DELETED';
}

function extractPixPayload(pixTransaction: unknown): string | null {
  if (!pixTransaction) return null;
  if (typeof pixTransaction === 'string') return pixTransaction;
  if (typeof pixTransaction === 'object') {
    const obj = pixTransaction as Record<string, unknown>;
    if (typeof obj.payload === 'string') return obj.payload;
    if (typeof obj.qrCode === 'string') return obj.qrCode;
  }
  return null;
}

// ==========================================
// Helpers ZapSign
// ==========================================

function normalizeZapSignStatus(payload: any, eventType?: string): string {
  const raw =
    payload?.status ||
    payload?.document?.status ||
    payload?.doc?.status ||
    payload?.event?.status ||
    eventType ||
    '';

  const s = String(raw || 'pending').toLowerCase();
  if (['completed', 'signed', 'doc_signed'].includes(s)) return 'signed';
  if (['expired', 'deadline_exceeded'].includes(s)) return 'expired';
  if (['refused', 'rejected', 'signature_request_refused', 'signature_refused'].includes(s)) return 'refused';
  if (['canceled', 'cancelled', 'doc_deleted'].includes(s)) return 'canceled';
  return s;
}

function extractZapSignDocumentId(payload: any): string | null {
  return (
    payload?.doc_token ||
    payload?.document?.doc_token ||
    payload?.document?.token ||
    payload?.doc?.token ||
    payload?.token ||
    null
  );
}

function extractZapSignExternalId(payload: any): string | null {
  return (
    payload?.external_id ||
    payload?.document?.external_id ||
    payload?.doc?.external_id ||
    null
  );
}

function extractZapSignSignedFileUrl(payload: any): string | null {
  return (
    payload?.signed_file ||
    payload?.signed_file_url ||
    payload?.document?.signed_file ||
    payload?.document?.signed_file_url ||
    payload?.doc?.signed_file ||
    payload?.doc?.signed_file_url ||
    null
  );
}

// ==========================================
// Helpers Wix
// ==========================================

async function resolveLead(partnerId: string | null, externalId: string | null, documentNumber: string | null) {
  if (externalId) {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id
      FROM leads
      WHERE external_id = ${externalId}
      LIMIT 1
    `;
    if (lead) return lead;
  }

  if (partnerId && documentNumber) {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id
      FROM leads
      WHERE partner_id = ${partnerId}
        AND document_number = ${documentNumber}
      ORDER BY data_atualizacao DESC NULLS LAST, synced_at DESC
      LIMIT 1
    `;
    if (lead) return lead;
  }

  return null;
}

// ==========================================
// Normalizador Seguro de Payloads
// ==========================================

export function normalizeWebhookPayload(input: unknown): Record<string, any> {
  if (!input) return {};

  let current: any = input;
  let iterations = 0;

  // Desembrulha caso venha como string ou double-encoded string JSON
  while (typeof current === 'string' && iterations < 5) {
    iterations++;
    const trimmed = current.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === current) break;
      current = parsed;
    } catch {
      break;
    }
  }

  if (current && typeof current === 'object' && !Array.isArray(current)) {
    // Se o payload vier encapsulado em { payload: {...} } ou { body: {...} } ou { data: {...} }
    if (current.payload && typeof current.payload === 'object' && !Array.isArray(current.payload) && !current.event && !current.payment) {
      return normalizeWebhookPayload(current.payload);
    }
    if (current.body && typeof current.body === 'object' && !Array.isArray(current.body) && !current.event && !current.payment) {
      return normalizeWebhookPayload(current.body);
    }
    if (current.data && typeof current.data === 'object' && !Array.isArray(current.data) && !current.event && !current.payment) {
      return normalizeWebhookPayload(current.data);
    }
    return current;
  }

  return {};
}

// =========================================================================
// Processador de Payloads Asaas
// =========================================================================

export async function processAsaasPayload(rawPayload: any): Promise<{ success: boolean; message?: string }> {
  try {
    const payload = normalizeWebhookPayload(rawPayload);

    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      return { success: false, message: 'Payload Asaas inválido ou vazio' };
    }

    const event = String(payload.event || payload.eventType || payload.type || '');
    const payment = payload.payment || (payload.id && (String(payload.id).startsWith('pay_') || payload.value !== undefined || payload.status !== undefined) ? payload : null);

    if (!payment || !payment.id) {
      if (!event || event.toLowerCase().includes('ping') || event.toLowerCase().includes('test')) {
        logger.info({ event, payload }, 'processAsaasPayload: Ping ou evento de teste reconhecido');
        return { success: true, message: 'Ping ou evento de teste reconhecido com sucesso' };
      }
      return { success: false, message: 'Payload Asaas não contém identificador de cobrança (payment.id)' };
    }

    const paymentStatus = normalizeAsaasStatus(payment.status);

    const installments = await sql<{
      id: string;
      payment_order_id: string;
      cotacao_id: string;
      client_id: string | null;
      external_installment_id: string | null;
      installment_number: number;
    }[]>`
      SELECT
        id,
        payment_order_id,
        cotacao_id,
        client_id,
        external_installment_id,
        installment_number
      FROM payment_installments
      WHERE provider = 'asaas'
        AND external_payment_id = ${payment.id}
      LIMIT 1
    `;

    const installment = installments[0];

    if (installment) {
      await sql`
        UPDATE payment_installments
        SET
          status = ${paymentStatus || normalizeAsaasStatus(event)},
          net_amount = COALESCE(${Number(payment.netValue) || null}, net_amount),
          due_date = COALESCE(${payment.dueDate || null}, due_date),
          paid_at = CASE
            WHEN ${isPaidEvent(event)} THEN COALESCE(paid_at, NOW())
            ELSE paid_at
          END,
          invoice_url = COALESCE(${payment.invoiceUrl || null}, invoice_url),
          bank_slip_url = COALESCE(${payment.bankSlipUrl || null}, bank_slip_url),
          pix_qr_code_url = COALESCE(${extractPixPayload(payment.pixTransaction)}, pix_qr_code_url),
          raw_payload = ${JSON.stringify(payment)}::jsonb,
          updated_at = NOW()
        WHERE id = ${installment.id}
      `;

      const [summary] = await sql<{
        total_count: number;
        paid_count: number;
        paid_amount: number;
        latest_due_date: string | null;
      }[]>`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE status IN ('received', 'confirmed'))::int AS paid_count,
          COALESCE(SUM(amount) FILTER (WHERE status IN ('received', 'confirmed')), 0)::numeric AS paid_amount,
          MAX(due_date)::text AS latest_due_date
        FROM payment_installments
        WHERE payment_order_id = ${installment.payment_order_id}
      `;

      const orderStatus = isRefundedEvent(event)
        ? 'refunded'
        : isOverdueEvent(event)
          ? 'overdue'
          : summary && summary.paid_count >= summary.total_count
            ? 'paid'
            : summary && summary.paid_count > 0
              ? 'partially_paid'
              : paymentStatus || 'pending';

      if (summary) {
        await sql`
          UPDATE payment_orders
          SET
            status = ${orderStatus},
            paid_installments = ${summary.paid_count},
            paid_amount = ${Number(summary.paid_amount) || 0},
            due_date = COALESCE(${payment.dueDate || summary.latest_due_date || null}, due_date),
            invoice_url = COALESCE(${payment.invoiceUrl || null}, invoice_url),
            bank_slip_url = COALESCE(${payment.bankSlipUrl || null}, bank_slip_url),
            pix_qr_code_url = COALESCE(${extractPixPayload(payment.pixTransaction)}, pix_qr_code_url),
            raw_payload = ${JSON.stringify(payment)}::jsonb,
            updated_at = NOW()
          WHERE id = ${installment.payment_order_id}
        `;
      }
    }

    if (isPaidEvent(event)) {
      let cotacao: {
        id: string;
        client_id: string | null;
        partner_id: string;
        product_id: string;
        importancia_segurada: number;
        status: string;
        premio_final: number | null;
        premio_calculado: number | null;
      } | undefined;

      if (installment?.cotacao_id) {
        const [directCotacao] = await sql<{
          id: string;
          client_id: string | null;
          partner_id: string;
          product_id: string;
          importancia_segurada: number;
          status: string;
          premio_final: number | null;
          premio_calculado: number | null;
        }[]>`
          SELECT id, client_id, partner_id, product_id, importancia_segurada, status, premio_final, premio_calculado 
          FROM cotacoes 
          WHERE id = ${installment.cotacao_id}
          LIMIT 1
        `;
        cotacao = directCotacao;
      }

      // Se há externalReference, busca prioritariamente pela cotação exata
      if (!cotacao && payment.externalReference) {
        const [refCotacao] = await sql<{
          id: string;
          client_id: string | null;
          partner_id: string;
          product_id: string;
          importancia_segurada: number;
          status: string;
          premio_final: number | null;
          premio_calculado: number | null;
          created_at: string | Date;
        }[]>`
          SELECT id, client_id, partner_id, product_id, importancia_segurada, status, premio_final, premio_calculado, created_at 
          FROM cotacoes 
          WHERE id = ${payment.externalReference}
          LIMIT 1
        `;
        if (refCotacao) {
          cotacao = refCotacao;
        }
      }

      // Se não encontrou por parcela ou externalReference, busca por checkoutId, parcelamento ou ordens
      if (!cotacao) {
        const [matchingCotacao] = await sql<{
          id: string;
          client_id: string | null;
          partner_id: string;
          product_id: string;
          importancia_segurada: number;
          status: string;
          premio_final: number | null;
          premio_calculado: number | null;
          created_at: string | Date;
        }[]>`
          SELECT id, client_id, partner_id, product_id, importancia_segurada, status, premio_final, premio_calculado, created_at 
          FROM cotacoes 
          WHERE (
            client_data->>'checkoutId' = ${payment.id}
            OR client_data->>'externalInstallmentId' = ${payment.installment || null}
            OR EXISTS (
              SELECT 1
              FROM payment_orders po
              WHERE po.cotacao_id = cotacoes.id
                AND (
                  po.external_payment_id = ${payment.id}
                  OR po.external_installment_id = ${payment.installment || null}
                )
            )
          )
          LIMIT 1
        `;
        cotacao = matchingCotacao;
      }

      // Validação temporal: se cotação foi localizada, confirma que a cobrança não foi criada antes dela
      if (cotacao && payment.dateCreated) {
        const paymentCreatedMs = new Date(payment.dateCreated).getTime();
        const quoteCreatedMs = new Date((cotacao as any).created_at || 0).getTime();
        if (quoteCreatedMs > 0 && paymentCreatedMs < quoteCreatedMs - (24 * 60 * 60 * 1000)) {
          logger.warn(
            { paymentId: payment.id, paymentDateCreated: payment.dateCreated, cotacaoId: cotacao.id },
            'processAsaasPayload: Pagamento descartado por ter sido criado antes da cotação vigente'
          );
          return { success: true, message: 'Cobrança descartada por ter sido criada antes da cotação vigente' };
        }
      }

      // Fallback estrito: se não encontrou cotação pelo ID exato da cobrança,
      // busca pela identificação do cliente no Asaas (customer ID) ou documento,
      // exigindo que a cotação tenha sido criada na mesma época e tenha valor compatível.
      const customerId = payment.customer || null;
      const cpfCnpj = payment.cpfCnpj || null;
      const cleanCpfCnpj = cpfCnpj ? String(cpfCnpj).replace(/\D/g, '') : null;

      if (!cotacao && (customerId || cpfCnpj)) {
        const [fallbackCotacao] = await sql<{
          id: string;
          client_id: string | null;
          partner_id: string;
          product_id: string;
          importancia_segurada: number;
          status: string;
          premio_final: number | null;
          premio_calculado: number | null;
          created_at: string | Date;
        }[]>`
          SELECT c.id, c.client_id, c.partner_id, c.product_id, c.importancia_segurada, c.status, c.premio_final, c.premio_calculado, c.created_at
          FROM cotacoes c
          LEFT JOIN insurance_clients ic ON ic.id = c.client_id
          LEFT JOIN payment_orders po ON po.cotacao_id = c.id
          WHERE (
            (${customerId}::text IS NOT NULL AND (
              c.client_data->>'clienteId' = ${customerId}
              OR c.client_data->>'asaasCustomerId' = ${customerId}
              OR po.provider_customer_id = ${customerId}
              OR ic.metadata->>'asaasCustomerId' = ${customerId}
            ))
            OR (${cpfCnpj}::text IS NOT NULL AND (
              c.client_cpf_cnpj = ${cpfCnpj}
              OR ic.document_number = ${cpfCnpj}
              OR (${cleanCpfCnpj}::text IS NOT NULL AND regexp_replace(c.client_cpf_cnpj, '\\D', '', 'g') = ${cleanCpfCnpj})
            ))
          )
          AND c.status IN ('pagamento_gerado', 'assinado', 'contrato_gerado', 'enviada', 'rascunho')
          AND c.created_at <= (COALESCE(${payment.dateCreated}::timestamptz, NOW()) + interval '24 hours')
          ORDER BY c.created_at DESC
          LIMIT 1
        `;

        if (fallbackCotacao) {
          const quoteVal = Number(fallbackCotacao.premio_final || fallbackCotacao.premio_calculado || 0);
          const payVal = Number(payment.value || 0);
          const isTotalMatch = Math.abs(payVal - quoteVal) < 0.15;
          const isInstMatch = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(
            (n) => Math.abs(payVal - (quoteVal / n)) < 0.15
          );

          if (quoteVal > 0 && payVal > 0 && (isTotalMatch || isInstMatch)) {
            cotacao = fallbackCotacao;
            logger.info({ paymentId: payment.id, cotacaoId: cotacao.id, customer: payment.customer }, 'processAsaasPayload: cotação localizada por fallback com validação de valor e data');
          } else {
            logger.warn({ paymentId: payment.id, payVal, quoteVal }, 'processAsaasPayload: fallback descartado por incompatibilidade de valor');
          }
        }
      }

      if (!cotacao) {
        logger.info({ paymentId: payment.id }, 'processAsaasPayload: Nenhuma cotação correspondente encontrada (ignorado)');
        return { success: true, message: 'Nenhuma cotação correspondente encontrada para este pagamento (ignorado)' };
      }

      const [orderSummary] = await sql<{
        id: string;
        installment_count: number;
        paid_count: number;
        paid_amount: number;
        amount_total: number;
      }[]>`
        SELECT
          po.id,
          COALESCE(po.installment_count, 1)::int AS installment_count,
          COUNT(pi.id) FILTER (WHERE pi.status IN ('received', 'confirmed'))::int AS paid_count,
          COALESCE(SUM(pi.amount) FILTER (WHERE pi.status IN ('received', 'confirmed')), 0)::numeric AS paid_amount,
          COALESCE(po.amount_total, 0)::numeric AS amount_total
        FROM payment_orders po
        LEFT JOIN payment_installments pi ON pi.payment_order_id = po.id
        WHERE po.cotacao_id = ${cotacao.id}
        GROUP BY po.id, po.installment_count, po.amount_total
        LIMIT 1
      `;

      if (orderSummary) {
        const isInstallment = orderSummary.installment_count > 1;
        const paidCount = Math.max(orderSummary.paid_count, 1);
        const isFullyPaid = !isInstallment || paidCount >= orderSummary.installment_count;
        const newOrderStatus = isFullyPaid ? 'paid' : 'partially_paid';
        const paidAmountVal = isInstallment
          ? (Number(orderSummary.paid_amount) || Number(payment.value) || 0)
          : (Number(orderSummary.amount_total) || Number(payment.value) || 0);

        await sql`
          UPDATE payment_orders
          SET
            status = ${newOrderStatus},
            billing_type = COALESCE(${payment.billingType || null}, billing_type),
            paid_installments = ${isInstallment ? paidCount : 1},
            paid_amount = ${paidAmountVal},
            external_payment_id = COALESCE(external_payment_id, ${payment.id}),
            updated_at = NOW()
          WHERE id = ${orderSummary.id}
        `;
      }

      const [orderRow] = await sql<{ amount_total: number }[]>`
        SELECT amount_total FROM payment_orders
        WHERE cotacao_id = ${cotacao.id}
        LIMIT 1
      `;

      const premioTotalApolice = Number(
        orderRow?.amount_total || cotacao.premio_final || cotacao.premio_calculado || payment.value
      );

      await sql`
        UPDATE cotacoes
        SET
          status = 'aprovada',
          premio_final = COALESCE(premio_final, ${premioTotalApolice}),
          updated_at = NOW()
        WHERE id = ${cotacao.id}
      `;

      const sale = await ensureSaleForPaidQuote({
        cotacaoId: cotacao.id,
        clientId: cotacao.client_id,
        partnerId: cotacao.partner_id,
        productId: cotacao.product_id,
        importanciaSegurada: Number(cotacao.importancia_segurada) || 0,
        premioFinal: premioTotalApolice,
      });

      logger.info({ cotacaoId: cotacao.id, saleId: sale.saleId, created: sale.created }, 'processAsaasPayload: Venda processada');

      if (sale.created) {
        try {
          const [clientRow] = cotacao.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
            SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
          ` : [];

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
            parceiro: partnerRow ? {
              id: cotacao.partner_id,
              nome: partnerRow.nome,
              email: partnerRow.email,
              codigoVenda: partnerRow.codigo_venda,
            } : undefined,
            cotacao: {
              id: cotacao.id,
              status: 'aprovada',
              premio_final: premioTotalApolice,
              cobertura: Number(cotacao.importancia_segurada) || 0,
            },
            transacao: {
              id: payment.id,
              valor: Number(payment.value),
              vencimento: payment.dueDate,
              forma_pagamento: payment.billingType,
              link_fatura: payment.invoiceUrl,
            },
          });
        } catch (dispatchErr) {
          logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'processAsaasPayload: Falha ao despachar gatilhos para pagamento confirmado');
        }
      }
    } else if (isOverdueEvent(event) && installment?.cotacao_id) {
      try {
        const [cotacao] = await sql<any[]>`
          SELECT id, partner_id, client_id, client_name, client_email, client_cpf_cnpj, client_phone,
                 partner_user_id, premio_final, importancia_segurada, client_data
          FROM cotacoes
          WHERE id = ${installment.cotacao_id}
          LIMIT 1
        `;

        let clientRow: any = null;
        if (cotacao?.client_id) {
          const [c] = await sql<any[]>`
            SELECT full_name, email, document_number, phone
            FROM insurance_clients
            WHERE id = ${cotacao.client_id}
            LIMIT 1
          `;
          clientRow = c;
        }

        let partnerRow: any = null;
        if (cotacao?.partner_id) {
          const [p] = await sql<any[]>`
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
          partnerRow = p;
        }

        let vendedorRow: any = null;
        if (cotacao?.partner_user_id) {
          const [v] = await sql<any[]>`
            SELECT id, name AS nome, email
            FROM partner_users
            WHERE id = ${cotacao.partner_user_id}
            LIMIT 1
          `;
          vendedorRow = v;
        }

        const [saleRow] = await sql<any[]>`
          SELECT policy_number FROM sales WHERE cotacao_id = ${installment.cotacao_id} LIMIT 1
        `;

        const clientData = (cotacao?.client_data as Record<string, any>) || {};
        const clientName = clientRow?.full_name || cotacao?.client_name || clientData.nome || 'Cliente';
        const clientEmail = clientRow?.email || cotacao?.client_email || clientData.email;
        const clientDoc = clientRow?.document_number || cotacao?.client_cpf_cnpj || clientData.cpf || clientData.cnpj || '';
        const clientPhone = clientRow?.phone || cotacao?.client_phone || clientData.celular || clientData.telefone || '';

        await dispatchDomainEvent('FATURA_VENCIDA', {
          eventType: 'FATURA_VENCIDA',
          contextId: installment.cotacao_id,
          cliente: {
            nome: clientName,
            email: clientEmail,
            documento: clientDoc,
            telefone: clientPhone,
          },
          parceiro: partnerRow ? {
            id: cotacao.partner_id,
            nome: partnerRow.nome,
            email: partnerRow.email,
            codigoVenda: partnerRow.codigo_venda,
          } : undefined,
          vendedor: vendedorRow ? {
            id: vendedorRow.id,
            nome: vendedorRow.nome,
            email: vendedorRow.email,
          } : undefined,
          cotacao: cotacao ? {
            id: cotacao.id,
            premio_final: Number(cotacao.premio_final) || undefined,
            cobertura: Number(cotacao.importancia_segurada) || undefined,
            produto_nome: 'Seguro RC Profissional',
          } : undefined,
          transacao: {
            id: payment.id,
            valor: Number(payment.value) || 0,
            vencimento: payment.dueDate,
            forma_pagamento: payment.billingType,
            link_fatura: payment.invoiceUrl,
          },
          dados: {
            apolice_numero: saleRow?.policy_number,
          },
        });
      } catch (overdueErr) {
        logger.error({ overdueErr }, 'processAsaasPayload: Falha ao despachar gatilho para fatura vencida');
      }
    }

    return { success: true, message: 'Payload Asaas processado com sucesso' };
  } catch (err: any) {
    logger.error({ err }, 'webhook.processor.asaas.error');
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao processar payload do Asaas',
    };
  }
}

// =========================================================================
// Processador de Payloads ZapSign
// =========================================================================

export async function processZapSignPayload(rawPayload: any): Promise<{ success: boolean; message?: string }> {
  try {
    const payload = normalizeWebhookPayload(rawPayload);

    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      return { success: false, message: 'Payload ZapSign inválido ou vazio' };
    }

    const eventType = String(
      payload?.event_type ||
        payload?.event ||
        payload?.type ||
        payload?.name ||
        'unknown'
    );
    const externalDocumentId = extractZapSignDocumentId(payload);
    const externalId = extractZapSignExternalId(payload);
    const normalizedStatus = normalizeZapSignStatus(payload, eventType);
    const signedFileUrl = extractZapSignSignedFileUrl(payload);

    const documents = externalDocumentId
      ? await sql<{ id: string; cotacao_id: string }[]>`
          SELECT id, cotacao_id
          FROM signature_documents
          WHERE provider = 'zapsign'
            AND external_document_id = ${externalDocumentId}
          LIMIT 1
        `
      : externalId
        ? await sql<{ id: string; cotacao_id: string }[]>`
            SELECT id, cotacao_id
            FROM signature_documents
            WHERE provider = 'zapsign'
              AND cotacao_id = ${externalId}
            LIMIT 1
          `
        : [];

    const document = documents[0];
    if (!document) {
      logger.info({ externalDocumentId, externalId, eventType }, 'processZapSignPayload: Documento de assinatura não encontrado');
      return { success: true, message: 'Documento não encontrado na base de dados (ignorado)' };
    }

    await sql`
      UPDATE signature_documents
      SET
        status = ${normalizedStatus},
        signed_file_url = COALESCE(${signedFileUrl}, signed_file_url),
        signed_at = CASE
          WHEN ${normalizedStatus} = 'signed' THEN COALESCE(signed_at, NOW())
          ELSE signed_at
        END,
        last_event_type = ${eventType},
        raw_payload = ${JSON.stringify(payload)}::jsonb,
        updated_at = NOW()
      WHERE id = ${document.id}
    `;

    if (normalizedStatus === 'signed') {
      const [cotacao] = await sql<{ client_data: unknown; status: string }[]>`
        SELECT client_data, status
        FROM cotacoes
        WHERE id = ${document.cotacao_id}
        LIMIT 1
      `;

      if (cotacao) {
        const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
        if (signedFileUrl) clientData.contratoPdf = signedFileUrl;
        clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

        const canAdvanceToAssinado = ['contrato_gerado', 'enviada', 'rascunho'].includes(cotacao.status);

        if (canAdvanceToAssinado) {
          await sql`
            UPDATE cotacoes
            SET
              status = 'assinado',
              client_data = ${JSON.stringify(clientData)}::jsonb,
              updated_at = NOW()
            WHERE id = ${document.cotacao_id}
          `;
        } else {
          await sql`
            UPDATE cotacoes
            SET
              client_data = ${JSON.stringify(clientData)}::jsonb,
              updated_at = NOW()
            WHERE id = ${document.cotacao_id}
          `;
        }

        try {
          const [cotacaoCompleta] = await sql<{ client_id: string | null; partner_id: string; partner_user_id: string | null; client_name: string; premio_final: number; importancia_segurada: number }[]>`
            SELECT client_id, partner_id, partner_user_id, client_name, premio_final, importancia_segurada
            FROM cotacoes
            WHERE id = ${document.cotacao_id}
            LIMIT 1
          `;

          const [clientRow] = cotacaoCompleta?.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
            SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacaoCompleta.client_id} LIMIT 1
          ` : [];

          const [vendedorRow] = cotacaoCompleta?.partner_user_id ? await sql<{ id: string; nome: string; email: string }[]>`
            SELECT id, name AS nome, email
            FROM partner_users
            WHERE id = ${cotacaoCompleta.partner_user_id}
            LIMIT 1
          ` : [];

          const [partnerRow] = cotacaoCompleta?.partner_id ? await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
            SELECT
              COALESCE(p.nome_fantasia, p.razao_social) AS nome,
              COALESCE(NULLIF(p.email, ''), pu.email) AS email,
              p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
            FROM partners p
            LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
            WHERE p.id = ${cotacaoCompleta.partner_id}
            ORDER BY pu.created_at ASC
            LIMIT 1
          ` : [];

          await dispatchDomainEvent('CONTRATO_ASSINADO', {
            eventType: 'CONTRATO_ASSINADO',
            contextId: document.cotacao_id,
            cliente: {
              nome: clientRow?.full_name || cotacaoCompleta?.client_name,
              email: clientRow?.email || clientData.email,
              documento: clientRow?.document_number || clientData.cpf || clientData.cnpj,
              telefone: clientRow?.phone || clientData.telefone,
            },
            vendedor: vendedorRow
              ? {
                  id: vendedorRow.id,
                  nome: vendedorRow.nome,
                  email: vendedorRow.email,
                }
              : partnerRow
              ? {
                  id: cotacaoCompleta.partner_user_id || cotacaoCompleta.partner_id,
                  nome: partnerRow.nome,
                  email: partnerRow.email,
                }
              : undefined,
            parceiro: partnerRow ? {
              id: cotacaoCompleta.partner_id,
              nome: partnerRow.nome,
              email: partnerRow.email,
              codigoVenda: partnerRow.codigo_venda,
            } : undefined,
            cotacao: {
              id: document.cotacao_id,
              status: 'assinado',
              premio_final: Number(cotacaoCompleta?.premio_final) || 0,
              cobertura: Number(cotacaoCompleta?.importancia_segurada) || 0,
            },
            dados: {
              contratoPdf: signedFileUrl,
              assinadoEm: clientData.assinadoEm,
            },
          });
        } catch (dispatchErr) {
          logger.error({ dispatchErr, cotacaoId: document.cotacao_id }, 'processZapSignPayload: Falha ao despachar CONTRATO_ASSINADO');
        }

        const [existingOrder] = await sql<{ id: string; status: string }[]>`
          SELECT id, status FROM payment_orders
          WHERE cotacao_id = ${document.cotacao_id}
            AND status IN ('pending', 'partially_paid', 'paid')
          LIMIT 1
        `;

        if (existingOrder) {
          logger.info(
            { cotacaoId: document.cotacao_id, orderId: existingOrder.id, status: existingOrder.status },
            'processZapSignPayload: Ordem de pagamento Asaas existente mantida'
          );
        } else {
          try {
            const paymentResult = await generateAsaasPaymentForQuote(document.cotacao_id, { isManualAdmin: false });
            if (paymentResult.ok) {
              logger.info(
                { cotacaoId: document.cotacao_id, checkoutId: paymentResult.checkoutId },
                'processZapSignPayload: Cobrança Asaas gerada com sucesso'
              );
            } else {
              logger.warn(
                { cotacaoId: document.cotacao_id, reason: paymentResult.error },
                'processZapSignPayload: Cobrança Asaas retida ou rejeitada'
              );
            }
          } catch (paymentErr) {
            logger.error(
              { paymentErr, cotacaoId: document.cotacao_id },
              'processZapSignPayload: Erro na geração automática de cobrança Asaas'
            );
          }
        }
      }
    } else if (normalizedStatus === 'expired') {
      await sql`
        UPDATE cotacoes
        SET status = 'expirada', updated_at = NOW()
        WHERE id = ${document.cotacao_id}
          AND status IN ('contrato_gerado', 'enviada', 'rascunho')
      `;
      logger.info({ cotacaoId: document.cotacao_id }, 'processZapSignPayload: Cotação expirada');
    } else if (normalizedStatus === 'refused') {
      await sql`
        UPDATE cotacoes
        SET status = 'recusada', updated_at = NOW()
        WHERE id = ${document.cotacao_id}
          AND status IN ('contrato_gerado', 'enviada', 'rascunho')
      `;
      logger.info({ cotacaoId: document.cotacao_id }, 'processZapSignPayload: Cotação recusada');
    }

    return { success: true, message: 'Payload ZapSign processado com sucesso' };
  } catch (err: any) {
    logger.error({ err }, 'webhook.processor.zapsign.error');
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao processar payload do ZapSign',
    };
  }
}

// =========================================================================
// Processador de Payloads Wix
// =========================================================================

export async function processWixPayload(rawPayload: any): Promise<{ success: boolean; message?: string }> {
  try {
    const payload = normalizeWebhookPayload(rawPayload);

    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      return { success: false, message: 'Payload Wix inválido ou vazio' };
    }

    const normalized = normalizeWixRecord(payload);
    const partner = await findPartnerByWixCode(normalized.partnerWixCode);
    const partnerId = partner?.id ?? null;

    const existingLead = await resolveLead(partnerId, normalized.externalId, normalized.documentNumber);

    const [lead] = existingLead
      ? await sql<{ id: string }[]>`
          UPDATE leads
          SET
            partner_id = COALESCE(${partnerId}, partner_id),
            external_id = COALESCE(${normalized.externalId}, external_id),
            document_number = COALESCE(${normalized.documentNumber}, document_number),
            nome = COALESCE(${normalized.nome}, nome),
            email = COALESCE(${normalized.email}, email),
            telefone = COALESCE(${normalized.telefone}, telefone),
            origem = COALESCE(${normalized.origem}, origem),
            status = COALESCE(${normalized.status}, status),
            status_cliente = COALESCE(${normalized.statusCliente}, status_cliente),
            raw = ${JSON.stringify(normalized.raw)}::jsonb,
            synced_at = NOW(),
            source_system = ${normalized.sourceSystem}
          WHERE id = ${existingLead.id}
          RETURNING id
        `
      : await sql<{ id: string }[]>`
          INSERT INTO leads (
            partner_id,
            external_id,
            document_number,
            nome,
            email,
            telefone,
            origem,
            status,
            status_cliente,
            raw,
            synced_at,
            source_system
          )
          VALUES (
            ${partnerId},
            ${normalized.externalId},
            ${normalized.documentNumber},
            ${normalized.nome},
            ${normalized.email},
            ${normalized.telefone},
            ${normalized.origem},
            ${normalized.status},
            ${normalized.statusCliente},
            ${JSON.stringify(normalized.raw)}::jsonb,
            NOW(),
            ${normalized.sourceSystem}
          )
          RETURNING id
        `;

    await logSyncEvent({
      entityType: 'lead',
      entityId: lead?.id || normalized.externalId || 'unknown',
      sourceSystem: normalized.sourceSystem,
      direction: 'inbound',
      eventType: 'wix_webhook',
      status: 'success',
      payload: {
        externalId: normalized.externalId,
        partnerWixCode: normalized.partnerWixCode,
        documentNumber: normalized.documentNumber,
        productCode: normalized.productCode,
      },
    });

    return {
      success: true,
      message: `Lead ${lead?.id || 'sincronizado'} processado com sucesso`,
    };
  } catch (err: any) {
    logger.error({ err }, 'webhook.processor.wix.error');
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao processar payload do Wix',
    };
  }
}

// =========================================================================
// Reprocessamento Individual
// =========================================================================

export async function reprocessWebhookEvent(id: string): Promise<{
  success: boolean;
  message?: string;
  event?: any;
}> {
  try {
    const [event] = await sql<{
      id: string;
      provider: string;
      event_type: string | null;
      external_id: string | null;
      payload: any;
      processed: boolean;
      error_message: string | null;
      retry_count: number;
      last_retried_at: string | null;
      created_at: string;
    }[]>`
      SELECT id, provider, event_type, external_id, payload, processed, error_message, retry_count, last_retried_at, created_at
      FROM webhook_events
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!event) {
      return { success: false, message: 'Evento de webhook não encontrado' };
    }

    const provider = String(event.provider || '').toLowerCase();
    let rawPayload = normalizeWebhookPayload(event.payload);

    // Fallback de recuperação caso o payload no banco esteja vazio:
    if (Object.keys(rawPayload).length === 0 && event.external_id) {
      if (provider === 'asaas') {
        const paymentIdMatch = event.external_id.match(/pay_[a-zA-Z0-9]+/);
        const paymentId = paymentIdMatch ? paymentIdMatch[0] : event.external_id;

        const [installment] = await sql<{ raw_payload: any; status: string }[]>`
          SELECT raw_payload, status
          FROM payment_installments
          WHERE provider = 'asaas' AND external_payment_id = ${paymentId}
          LIMIT 1
        `;

        if (installment?.raw_payload) {
          const parsedRaw = normalizeWebhookPayload(installment.raw_payload);
          rawPayload = {
            event: event.event_type || 'PAYMENT_RECEIVED',
            payment: parsedRaw,
          };
          logger.info({ id, paymentId }, 'reprocessWebhookEvent: Payload Asaas recuperado via payment_installments');
        } else {
          const [order] = await sql<{ raw_payload: any; status: string }[]>`
            SELECT raw_payload, status
            FROM payment_orders
            WHERE external_payment_id = ${paymentId}
            LIMIT 1
          `;
          if (order?.raw_payload) {
            const parsedRaw = normalizeWebhookPayload(order.raw_payload);
            rawPayload = {
              event: event.event_type || 'PAYMENT_RECEIVED',
              payment: parsedRaw,
            };
            logger.info({ id, paymentId }, 'reprocessWebhookEvent: Payload Asaas recuperado via payment_orders');
          }
        }
      } else if (provider === 'zapsign') {
        const [doc] = await sql<{ external_document_id: string; cotacao_id: string; status: string; signed_file_url: string | null }[]>`
          SELECT external_document_id, cotacao_id, status, signed_file_url
          FROM signature_documents
          WHERE external_document_id = ${event.external_id}
             OR cotacao_id = ${event.external_id}
          LIMIT 1
        `;
        if (doc) {
          rawPayload = {
            event_type: event.event_type || 'doc_signed',
            doc_token: doc.external_document_id,
            status: doc.status,
            signed_file_url: doc.signed_file_url,
          };
          logger.info({ id, docId: doc.external_document_id }, 'reprocessWebhookEvent: Payload ZapSign recuperado via signature_documents');
        }
      }
    }

    if (Object.keys(rawPayload).length === 0) {
      const emptyMsg = `O payload do evento ${provider.toUpperCase()} está vazio no banco de dados e não pôde ser recuperado pelo identificador (${event.external_id || 'sem ID'}).`;
      await sql`
        UPDATE webhook_events
        SET
          processed = false,
          error_message = ${emptyMsg},
          retry_count = retry_count + 1,
          last_retried_at = NOW()
        WHERE id = ${id}
      `;
      return {
        success: false,
        message: emptyMsg,
      };
    }

    let result: { success: boolean; message?: string };

    if (provider === 'asaas') {
      result = await processAsaasPayload(rawPayload);
    } else if (provider === 'zapsign') {
      result = await processZapSignPayload(rawPayload);
    } else if (provider === 'wix') {
      result = await processWixPayload(rawPayload);
    } else {
      result = {
        success: false,
        message: `Provedor de webhook desconhecido: "${event.provider}"`,
      };
    }

    const hadEmptyPayload = Object.keys(normalizeWebhookPayload(event.payload)).length === 0 && Object.keys(rawPayload).length > 0;

    if (hadEmptyPayload) {
      if (result.success) {
        await sql`
          UPDATE webhook_events
          SET
            processed = true,
            error_message = NULL,
            retry_count = retry_count + 1,
            last_retried_at = NOW(),
            payload = ${JSON.stringify(rawPayload)}::jsonb
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE webhook_events
          SET
            processed = false,
            error_message = ${result.message || 'Erro durante reprocessamento'},
            retry_count = retry_count + 1,
            last_retried_at = NOW(),
            payload = ${JSON.stringify(rawPayload)}::jsonb
          WHERE id = ${id}
        `;
      }
    } else {
      if (result.success) {
        await sql`
          UPDATE webhook_events
          SET
            processed = true,
            error_message = NULL,
            retry_count = retry_count + 1,
            last_retried_at = NOW()
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE webhook_events
          SET
            processed = false,
            error_message = ${result.message || 'Erro durante reprocessamento'},
            retry_count = retry_count + 1,
            last_retried_at = NOW()
          WHERE id = ${id}
        `;
      }
    }

    const [updatedEvent] = await sql<any[]>`
      SELECT *
      FROM webhook_events
      WHERE id = ${id}
      LIMIT 1
    `;

    return {
      success: result.success,
      message: result.message || (result.success ? 'Evento reprocessado com sucesso' : 'Falha ao reprocessar evento'),
      event: updatedEvent,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : 'Erro interno ao reprocessar webhook';
    logger.error({ err, id }, 'reprocessWebhookEvent: Exceção inesperada');

    await sql`
      UPDATE webhook_events
      SET
        processed = false,
        error_message = ${errorMsg},
        retry_count = retry_count + 1,
        last_retried_at = NOW()
      WHERE id = ${id}
    `.catch(() => null);

    return {
      success: false,
      message: errorMsg,
    };
  }
}

// =========================================================================
// Reprocessamento em Lote
// =========================================================================

export async function reprocessBatchWebhookEvents(ids?: string[]): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; success: boolean; error?: string }>;
}> {
  let targetIds: string[] = [];

  if (ids && Array.isArray(ids) && ids.length > 0) {
    targetIds = ids;
  } else {
    const rows = await sql<{ id: string }[]>`
      SELECT id
      FROM webhook_events
      WHERE processed = false OR (error_message IS NOT NULL AND error_message != '')
      ORDER BY created_at DESC
      LIMIT 100
    `;
    targetIds = rows.map((r) => r.id);
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of targetIds) {
    try {
      const res = await reprocessWebhookEvent(id);
      if (res.success) {
        succeeded++;
        results.push({ id, success: true });
      } else {
        failed++;
        results.push({ id, success: false, error: res.message });
      }
    } catch (err: any) {
      failed++;
      results.push({
        id,
        success: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  return {
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}
