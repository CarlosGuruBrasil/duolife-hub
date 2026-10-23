import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
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
    // Validação de acesso à cotação com dados de status e assinatura
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = (cotacao.client_data as Record<string, any>) || {};

    // Trava de obrigatoriedade: o termo deve estar assinado antes da emissão do boleto/pagamento
    const isSigned =
      cotacao.status === 'assinado' ||
      cotacao.status === 'assinada' ||
      cotacao.status === 'pagamento_gerado' ||
      cotacao.status === 'aprovada' ||
      cotacao.status === 'emitida' ||
      cotacao.status === 'ativa' ||
      Boolean(clientData.contratoAssinado) ||
      Boolean(cotacao.contrato_assinado);

    if (!isSigned) {
      return Response.json(
        { error: 'É obrigatório assinar o Termo de Adesão antes da geração do boleto de pagamento.' },
        { status: 422 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { billingType?: string };
    const rawBillingType = body.billingType || clientData.billingType || clientData.formaPagamento;

    let billingType = 'UNDEFINED';
    if (rawBillingType) {
      const upper = String(rawBillingType).toUpperCase();
      if (['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(upper)) {
        billingType = upper;
      }
    }

    const isManualAdmin = user ? isInternalUser(user) : false;
    const result = await generateAsaasPaymentForQuote(id, {
      isManualAdmin,
      customValues: { billingType },
    });

    if (!result.ok) {
      return Response.json({ error: result.error || 'Falha ao gerar cobrança' }, { status: 400 });
    }

    await sql`
      UPDATE cotacoes
      SET
        status = CASE
          WHEN status IN ('aprovada', 'emitida') THEN status
          ELSE 'pagamento_gerado'
        END,
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return Response.json({
      ok: true,
      checkoutId: result.checkoutId,
      linkBoleto: result.linkBoleto,
      dueDate: result.dueDate,
      netValue: result.netValue,
      alreadyExisted: result.alreadyExisted,
    });
  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.gerar-pagamento.failed');
    return Response.json({ error: 'Erro interno ao gerar pagamento' }, { status: 500 });
  }
}
