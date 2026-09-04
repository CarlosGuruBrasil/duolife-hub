import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
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
    // Validação de acesso à cotação
    const cotacao = publicToken
      ? (await sql`SELECT id FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const result = await generateAsaasPaymentForQuote(id);

    if (!result.ok) {
      return Response.json({ error: result.error || 'Falha ao gerar cobrança' }, { status: 400 });
    }

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
