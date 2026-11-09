import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { getAsaasConfig } from '@/lib/system-settings';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { success: false, error: 'ID da cotação é obrigatório.' },
      { status: 400 }
    );
  }

  try {
    const [cotacao] = await sql<any[]>`
      SELECT * FROM cotacoes WHERE id = ${id} LIMIT 1
    `;

    if (!cotacao) {
      return NextResponse.json(
        { success: false, error: `Cotação '${id}' não encontrada.` },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    // Forma de pagamento solicitada explicitamente pelo Wix (aceita `billingType` ou `formaPagamento`)
    const requestedBillingType = body.billingType || body.formaPagamento || null;
    const rawBillingType =
      requestedBillingType || clientData.formaPagamento || clientData.billingType || 'BOLETO';
    let billingType = 'UNDEFINED';
    if (rawBillingType) {
      const upper = String(rawBillingType).toUpperCase();
      if (['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(upper)) {
        billingType = upper;
      }
    }

    let forceRecreate = Boolean(body.forceRecreate);

    // Troca de forma de pagamento (ex.: BOLETO -> CREDIT_CARD ou o inverso):
    // o Hub mantém uma cobrança por cotação, então cancela a pendente e emite nova no método escolhido.
    // BOLETO, PIX e UNDEFINED são tratados como compatíveis entre si (a fatura de boleto já oferece PIX).
    if (requestedBillingType && !forceRecreate) {
      const [currentOrder] = await sql<any[]>`
        SELECT billing_type, status
        FROM payment_orders
        WHERE cotacao_id = ${cotacao.id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const currentType = String(currentOrder?.billing_type || '').toUpperCase();
      const isPaid = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(
        currentOrder?.status
      );
      const envolveCartao = billingType === 'CREDIT_CARD' || currentType === 'CREDIT_CARD';
      if (currentOrder && currentType && currentType !== billingType && envolveCartao) {
        if (isPaid) {
          return NextResponse.json(
            { success: false, error: 'Esta cotação já possui cobrança paga; não é possível trocar a forma de pagamento.' },
            { status: 409 }
          );
        }
        forceRecreate = true;
        logger.info(
          { cotacaoId: cotacao.id, de: currentType, para: billingType },
          'wix.gerar_pagamento.troca_forma_pagamento'
        );
      }
    }

    const paymentResult = await generateAsaasPaymentForQuote(cotacao.id, {
      isManualAdmin: false,
      forceRecreate,
      customValues: {
        billingType,
        qtdParcelas: body.qtdParcelas ? Number(body.qtdParcelas) : undefined,
        dueDate: body.dueDate ? String(body.dueDate) : undefined,
      },
    });

    if (!paymentResult.ok && !paymentResult.alreadyExisted) {
      return NextResponse.json(
        {
          success: false,
          error: paymentResult.error || 'Falha ao processar cobrança financeira no Asaas.',
        },
        { status: 400 }
      );
    }

    // Atualiza status da cotação se estiver em fluxo inicial
    await sql`
      UPDATE cotacoes
      SET status = CASE
            WHEN status IN ('aprovada', 'emitida', 'ativa') THEN status
            ELSE 'pagamento_gerado'
          END,
          updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // Recupera dados salvos da ordem de pagamento
    const [order] = await sql<any[]>`
      SELECT external_payment_id, invoice_url, bank_slip_url, due_date::text AS due_date, pix_qr_code_url, status, billing_type
      FROM payment_orders
      WHERE cotacao_id = ${cotacao.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const checkoutId =
      order?.external_payment_id || paymentResult.checkoutId || clientData.checkoutId || null;
    const bankSlipUrl =
      order?.bank_slip_url ||
      order?.invoice_url ||
      paymentResult.linkBoleto ||
      clientData.linkBoleto ||
      null;
    const invoiceUrl = order?.invoice_url || order?.bank_slip_url || bankSlipUrl;
    const dueDate =
      order?.due_date || paymentResult.dueDate || clientData.dataVencimento || null;
    let pixQrCode = order?.pix_qr_code_url || null;

    // Cobrança de cartão não possui QR Code PIX
    if (!pixQrCode && checkoutId && billingType !== 'CREDIT_CARD') {
      try {
        const { apiKey, baseUrl } = await getAsaasConfig();
        if (apiKey) {
          const pixRes = await fetch(`${baseUrl}/payments/${checkoutId}/pixQrCode`, {
            headers: { access_token: apiKey },
          });
          if (pixRes.ok) {
            const pixJson = await pixRes.json();
            pixQrCode = pixJson.payload || pixJson.encodedImage || null;
            if (pixQrCode) {
              await sql`
                UPDATE payment_orders
                SET pix_qr_code_url = ${pixQrCode}, updated_at = NOW()
                WHERE cotacao_id = ${cotacao.id}
              `.catch(() => {});
            }
          }
        }
      } catch (pixErr) {
        logger.warn({ pixErr }, 'wix.gerar_pagamento.fetch_pix_qr_code_warn');
      }
    }

    logger.info(
      {
        cotacaoId: cotacao.id,
        checkoutId,
        hasBankSlip: Boolean(bankSlipUrl),
      },
      'wix.gerar_pagamento.sucesso'
    );

    return NextResponse.json({
      success: true,
      cotacaoId: cotacao.id,
      checkoutId,
      bankSlipUrl,
      invoiceUrl,
      pixQrCode,
      dueDate,
      billingType: order?.billing_type || billingType,
      status: 'pagamento_gerado',
      alreadyExisted: paymentResult.alreadyExisted || false,
    });
  } catch (err: any) {
    logger.error({ err, cotacaoId: id }, 'wix.gerar_pagamento.erro');
    return NextResponse.json(
      {
        success: false,
        error: 'Erro interno ao gerar pagamento para a cotação.',
      },
      { status: 500 }
    );
  }
}
