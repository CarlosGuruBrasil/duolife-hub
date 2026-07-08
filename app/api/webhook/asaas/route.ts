import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
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

    // Apenas nos importamos com pagamentos confirmados ou recebidos
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      
      // 1. Encontra a cotação vinculada a este pagamento
      const [cotacao] = await sql<{ id: string, partner_id: string, product_id: string, importancia_segurada: number, status: string }[]>`
        SELECT id, partner_id, product_id, importancia_segurada, status 
        FROM cotacoes 
        WHERE client_data->>'checkoutId' = ${payment.id} 
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

      // 2. Determina a taxa de comissão aplicável
      const [rateRow] = await sql<{ rate: number }[]>`
        SELECT 
          COALESCE(
            (
              SELECT rate 
              FROM partner_commission_rates 
              WHERE partner_id = ${cotacao.partner_id} 
                AND product_id = ${cotacao.product_id} 
                AND valid_from <= CURRENT_DATE 
                AND (valid_until IS NULL OR valid_until >= CURRENT_DATE) 
              ORDER BY valid_from DESC 
              LIMIT 1
            ),
            p.base_commission_rate,
            0
          ) as rate
        FROM products p 
        WHERE id = ${cotacao.product_id}
      `;

      const commissionRate = rateRow ? Number(rateRow.rate) : 0;
      const premioFinal = Number(payment.value);
      const commissionAmount = premioFinal * (commissionRate / 100);
      const policyNumber = `DL-RC-${payment.id.replace('pay_', '')}`;

      // 3. Gerar Venda (Apólice) e Comissão
      // Usa uma transação simples com queries encadeadas
      try {
        const [sale] = await sql<{ id: string }[]>`
          INSERT INTO sales (
            cotacao_id, partner_id, product_id, policy_number, 
            importancia_segurada, premio_total, commission_rate, commission_amount,
            status, issue_date, expiry_date
          ) VALUES (
            ${cotacao.id}, ${cotacao.partner_id}, ${cotacao.product_id}, ${policyNumber},
            ${cotacao.importancia_segurada || 0}, ${premioFinal}, ${commissionRate}, ${commissionAmount},
            'ativa', CURRENT_DATE, CURRENT_DATE + interval '1 year'
          ) RETURNING id
        `;

        if (commissionAmount > 0) {
          await sql`
            INSERT INTO commissions (
              sale_id, partner_id, amount, rate, status, reference_month
            ) VALUES (
              ${sale.id}, ${cotacao.partner_id}, ${commissionAmount},
              ${commissionRate}, 'pendente', to_char(CURRENT_DATE, 'YYYY-MM')
            )
          `;
        }

        // 4. Atualizar Cotação para Aprovada
        await sql`
          UPDATE cotacoes 
          SET status = 'aprovada', updated_at = NOW() 
          WHERE id = ${cotacao.id}
        `;

        logger.info({ cotacaoId: cotacao.id, saleId: sale.id }, 'Sale successfully generated from webhook');
      } catch (err) {
        logger.error({ err, cotacaoId: cotacao.id }, 'Error saving sale data from webhook');
        return NextResponse.json({ error: 'Failed to process sale' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'asaas.webhook.failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
