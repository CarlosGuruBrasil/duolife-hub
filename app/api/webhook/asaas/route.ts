import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { ensureSaleForPaidQuote } from '@/lib/insurance-ops';

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

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const authHeader = req.headers.get('asaas-access-token');
    // Se você configurou um token de webhook no painel do Asaas, coloque no .env como ASAAS_WEBHOOK_SECRET
    const secret = process.env.ASAAS_WEBHOOK_SECRET;
    
    // Se temos um secret configurado no sistema e ele é diferente do recebido, bloqueamos.
    if (secret && authHeader !== secret) {
      logger.warn({ ip: req.headers.get('x-forwarded-for') }, 'Asaas Webhook unauthorized attempt');
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
        ${secret ? true : null},
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
          pix_qr_code_url = COALESCE(${payment.pixTransaction || null}, pix_qr_code_url),
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
          pix_qr_code_url = COALESCE(${payment.pixTransaction || null}, pix_qr_code_url),
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
      } catch (err) {
        logger.error({ err, cotacaoId: cotacao.id }, 'Error saving sale data from webhook');
        return NextResponse.json({ error: 'Failed to process sale' }, { status: 500 });
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
