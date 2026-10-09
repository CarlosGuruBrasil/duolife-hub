import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { getZapSignConfig, sanitizeApiToken, getAsaasConfig } from '@/lib/system-settings';
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
    // 1. Busca cotação
    const [cotacao] = await sql<any[]>`
      SELECT * FROM cotacoes WHERE id = ${id} LIMIT 1
    `;

    if (!cotacao) {
      return NextResponse.json(
        { success: false, error: `Cotação '${id}' não encontrada.` },
        { status: 404 }
      );
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    // 2. Se a cotação já estava previamente assinada ou com pagamento gerado
    const isAlreadySignedStatus = [
      'assinado',
      'pagamento_gerado',
      'aprovada',
      'emitida',
      'ativa',
    ].includes(cotacao.status);

    // Identifica o token do documento ZapSign
    let docToken = String(clientData.contratoToken || clientData.tokenZapsign || '').trim();
    if (!docToken) {
      const [docRow] = await sql<any[]>`
        SELECT external_document_id
        FROM signature_documents
        WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (docRow?.external_document_id) {
        docToken = docRow.external_document_id;
      }
    }

    let isSigned = isAlreadySignedStatus;

    // 3. Se ainda não estava marcada como assinada e temos docToken, consulta ZapSign
    if (!isSigned && docToken) {
      const zapConfig = await getZapSignConfig();
      const token = sanitizeApiToken(zapConfig.apiToken);
      const baseUrl = zapConfig.baseUrl;

      if (token) {
        try {
          const zapRes = await fetch(`${baseUrl}/docs/${docToken}/`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(12000),
          });

          if (zapRes.ok) {
            const zapDoc = await zapRes.json();
            const zapStatus = String(zapDoc.status || '').toLowerCase();

            isSigned =
              zapStatus === 'completed' ||
              zapStatus === 'signed' ||
              (Array.isArray(zapDoc.signers) &&
                zapDoc.signers.length > 0 &&
                zapDoc.signers.every((s: { status?: string }) => s.status === 'signed'));

            if (isSigned) {
              const signedFile =
                zapDoc.signed_file ||
                zapDoc.signed_file_url ||
                zapDoc.original_file ||
                zapDoc.original_file_url ||
                null;

              clientData.contratoPdf = signedFile || clientData.contratoPdf;
              clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

              await sql`
                UPDATE signature_documents
                SET status = 'signed',
                    signed_file_url = COALESCE(${signedFile}, signed_file_url),
                    signed_at = COALESCE(signed_at, NOW()),
                    raw_payload = ${JSON.stringify(zapDoc)}::jsonb,
                    updated_at = NOW()
                WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
              `;
            }
          } else {
            logger.warn(
              { status: zapRes.status, docToken, cotacaoId: cotacao.id },
              'wix.verificar_assinatura.zapsign_http_not_ok'
            );
          }
        } catch (fetchErr) {
          logger.error(
            { fetchErr, docToken, cotacaoId: cotacao.id },
            'wix.verificar_assinatura.zapsign_fetch_error'
          );
        }
      }
    }

    // Se NÃO estiver assinado
    if (!isSigned) {
      return NextResponse.json({
        assinado: false,
        status: 'aguardando_assinatura',
      });
    }

    // 4. Se assinado: atualiza status da cotação para 'assinado' se ainda estava em fase anterior
    if (['rascunho', 'enviada', 'contrato_gerado'].includes(cotacao.status)) {
      await sql`
        UPDATE cotacoes
        SET status = 'assinado',
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
        WHERE id = ${cotacao.id}
      `;
    }

    // 5. Dispara geração de cobrança Asaas
    let paymentResult: any = null;
    try {
      paymentResult = await generateAsaasPaymentForQuote(cotacao.id, { isManualAdmin: false });
    } catch (paymentErr) {
      logger.error({ paymentErr, cotacaoId: cotacao.id }, 'wix.verificar_assinatura.asaas_payment_error');
    }

    // 6. Recupera dados consolidados da ordem de pagamento emitida no Asaas
    const [order] = await sql<any[]>`
      SELECT external_payment_id, bank_slip_url, invoice_url, due_date::text AS due_date, pix_qr_code_url
      FROM payment_orders
      WHERE cotacao_id = ${cotacao.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const checkoutId = order?.external_payment_id || paymentResult?.checkoutId || clientData.checkoutId || null;
    const bankSlipUrl =
      order?.bank_slip_url ||
      order?.invoice_url ||
      paymentResult?.linkBoleto ||
      clientData.linkBoleto ||
      null;
    const dueDate = order?.due_date || paymentResult?.dueDate || clientData.dataVencimento || null;
    let pixQrCode = order?.pix_qr_code_url || null;

    // Se o QR Code Pix ainda não estiver no banco, tenta buscar diretamente via API Asaas
    if (!pixQrCode && checkoutId) {
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
      } catch (err) {
        logger.warn({ err }, 'wix.verificar_assinatura.fetch_pix_qr_code_warn');
      }
    }

    logger.info(
      {
        cotacaoId: cotacao.id,
        assinado: true,
        checkoutId,
        hasBankSlip: Boolean(bankSlipUrl),
        hasPix: Boolean(pixQrCode),
      },
      'wix.verificar_assinatura.concluida'
    );

    return NextResponse.json({
      assinado: true,
      status: 'assinado',
      checkoutId,
      bankSlipUrl,
      pixQrCode,
      dueDate,
    });
  } catch (err: any) {
    logger.error({ err, cotacaoId: id }, 'wix.verificar_assinatura.erro_inesperado');
    return NextResponse.json(
      {
        assinado: false,
        error: err?.message || 'Erro interno ao verificar assinatura do contrato.',
      },
      { status: 500 }
    );
  }
}
