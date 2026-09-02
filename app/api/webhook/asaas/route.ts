import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { ensureSaleForPaidQuote } from '@/lib/insurance-ops';
import { verifyWebhookToken } from '@/lib/webhook-auth';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';

function normalizeAsaasStatus(value: string | null | undefined) {
  return String(value || '').toLowerCase();
}

function isPaidEvent(event: string) {
  return event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
}

function isOverdueEvent(event: string) {
  return event === 'PAYMENT_OVERDUE';
}

function isRefundedEvent(event: string) {
  return event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_DELETED';
}

// payment.pixTransaction vem como objeto ({ encodedImage, payload, expirationDate, ... }) na
// maioria dos eventos da Asaas, não como URL — gravar o objeto direto na coluna TEXT quebraria
// o parâmetro do postgres.js. Extrai o payload (copia-e-cola do Pix) quando disponível.
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

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const authHeader = req.headers.get('asaas-access-token');
    const secret = process.env.ASAAS_WEBHOOK_SECRET;

    // Fail-closed: sem secret configurado ou token que não bate, a requisição é sempre rejeitada.
    if (!verifyWebhookToken(authHeader, secret)) {
      logger.warn({ ip: req.headers.get('x-forwarded-for'), hasSecretConfigured: Boolean(secret) }, 'Asaas Webhook unauthorized attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const event = payload.event;
    const payment = payload.payment;

    if (!payment || !payment.id) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    logger.info({ event, paymentId: payment.id }, 'Asaas Webhook received');

    const [webhookEvent] = await sql<{ id: string }[]>`
      INSERT INTO webhook_events (
        provider,
        event_type,
        external_id,
        signature_valid,
        payload,
        processed
      )
      VALUES (
        'asaas',
        ${event},
        ${payment.id},
        true,
        ${JSON.stringify(payload)}::jsonb,
        false
      )
      RETURNING id
    `;

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
          : summary.paid_count >= summary.total_count
            ? 'paid'
            : summary.paid_count > 0
              ? 'partially_paid'
              : paymentStatus || 'pending';

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

    // Apenas nos importamos com pagamentos confirmados ou recebidos
    if (isPaidEvent(event)) {
      
      // 1. Encontra a cotação vinculada a este pagamento
      const [cotacao] = await sql<{ id: string, client_id: string | null, partner_id: string, product_id: string, importancia_segurada: number, status: string }[]>`
        SELECT id, client_id, partner_id, product_id, importancia_segurada, status 
        FROM cotacoes 
        WHERE id = COALESCE(${installment?.cotacao_id || null}, id)
          AND (
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

      if (!cotacao) {
        logger.info({ paymentId: payment.id }, 'Asaas webhook ignored: No matching quote found');
        return NextResponse.json({ success: true, ignored: true });
      }

      if (cotacao.status === 'aprovada') {
        logger.info({ cotacaoId: cotacao.id }, 'Asaas webhook ignored: Quote already approved');
        return NextResponse.json({ success: true, ignored: true });
      }

      const premioFinal = Number(payment.value);

      try {
        const sale = await ensureSaleForPaidQuote({
          cotacaoId: cotacao.id,
          clientId: cotacao.client_id,
          partnerId: cotacao.partner_id,
          productId: cotacao.product_id,
          importanciaSegurada: Number(cotacao.importancia_segurada) || 0,
          premioFinal,
        });

        logger.info({ cotacaoId: cotacao.id, saleId: sale.saleId }, 'Sale successfully generated from webhook');

        // Dispara gatilhos da árvore de decisão para PAGAMENTO_CONFIRMADO
        try {
          const [clientRow] = cotacao.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
            SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
          ` : [];

          const [partnerRow] = await sql<{ razao_social: string; email: string; metadata: any }[]>`
            SELECT razao_social, email, metadata FROM partners WHERE id = ${cotacao.partner_id} LIMIT 1
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
            parceiro: {
              id: cotacao.partner_id,
              nome: partnerRow?.razao_social,
              email: partnerRow?.email,
              codigoVenda: partnerRow?.metadata?.whiteLabel?.wixCode,
            },
            cotacao: {
              id: cotacao.id,
              status: 'aprovada',
              premio_final: premioFinal,
              cobertura: Number(cotacao.importancia_segurada) || 0,
            },
            transacao: {
              id: payment.id,
              valor: premioFinal,
              vencimento: payment.dueDate,
              forma_pagamento: payment.billingType,
              link_fatura: payment.invoiceUrl,
            },
          });
        } catch (dispatchErr) {
          logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'Falha ao despachar gatilhos para pagamento confirmado');
        }
      } catch (err) {
        logger.error({ err, cotacaoId: cotacao.id }, 'Error saving sale data from webhook');
        return NextResponse.json({ error: 'Failed to process sale' }, { status: 500 });
      }
    } else if (isOverdueEvent(event) && installment?.cotacao_id) {
      // Dispara gatilho de fatura vencida
      try {
        await dispatchDomainEvent('FATURA_VENCIDA', {
          eventType: 'FATURA_VENCIDA',
          contextId: installment.cotacao_id,
          transacao: {
            id: payment.id,
            valor: Number(payment.value) || 0,
            vencimento: payment.dueDate,
            forma_pagamento: payment.billingType,
            link_fatura: payment.invoiceUrl,
          },
        });
      } catch (overdueErr) {
        logger.error({ overdueErr }, 'Falha ao despachar gatilho para fatura vencida');
      }
    }

    await sql`
      UPDATE webhook_events
      SET processed = true
      WHERE id = ${webhookEvent.id}
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'asaas.webhook.failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
