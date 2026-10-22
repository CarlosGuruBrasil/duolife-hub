import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let user = null;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  const { id } = await params;

  try {
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Payload JSON inválido' }, { status: 400 });
    }

    const rawBillingType = body?.billingType ? String(body.billingType).trim().toUpperCase() : 'UNDEFINED';
    let billingType = 'UNDEFINED';
    if (['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(rawBillingType)) {
      billingType = rawBillingType;
    }

    const parcelasNum = Math.max(1, Math.min(12, Math.floor(Number(body?.parcelas || 1))));

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    clientData.formaPagamentoPreferida = billingType;
    clientData.parcelasPreferidas = parcelasNum;
    clientData.preferenciaPagamentoSalvaEm = new Date().toISOString();

    // Mantém compatibilidade com outros fluxos
    clientData.billingType = billingType;
    clientData.formaPagamento = billingType;
    clientData.parcela = parcelasNum;

    // Atualiza cotação no banco
    await sql`
      UPDATE cotacoes
      SET
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    logger.info(
      {
        cotacaoId: cotacao.id,
        billingType,
        parcelas: parcelasNum,
      },
      'api.portal.salvar-preferencia-pagamento.sucesso'
    );

    // Se ambas as assinaturas já estiverem concluídas, tenta emitir a cobrança Asaas
    let paymentInfo: any = null;
    const todasAssinadas =
      clientData.statusAssinatura === 'todas_assinadas' ||
      cotacao.status === 'assinado' ||
      (Boolean(clientData.clienteAssinou) && Boolean(clientData.corretoraAssinou));

    if (todasAssinadas) {
      try {
        const isManualAdmin = user ? isInternalUser(user) : false;
        paymentInfo = await generateAsaasPaymentForQuote(cotacao.id, {
          isManualAdmin,
          customValues: {
            billingType,
            qtdParcelas: parcelasNum,
          },
        });
      } catch (paymentErr) {
        logger.error(
          { paymentErr, cotacaoId: cotacao.id },
          'api.portal.salvar-preferencia-pagamento.asaas_payment_failed'
        );
      }
    }

    return Response.json({
      ok: true,
      message: 'Preferência de pagamento salva com sucesso!',
      formaPagamentoPreferida: clientData.formaPagamentoPreferida,
      parcelasPreferidas: clientData.parcelasPreferidas,
      checkoutId: paymentInfo?.checkoutId || clientData.checkoutId || null,
      linkBoleto: paymentInfo?.linkBoleto || clientData.linkBoleto || null,
      dueDate: paymentInfo?.dueDate || clientData.dataVencimento || null,
      paymentError: paymentInfo?.ok === false ? paymentInfo.error : undefined,
    });
  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.salvar-preferencia-pagamento.failed');
    return Response.json({ error: 'Erro interno ao salvar preferência de pagamento' }, { status: 500 });
  }
}
