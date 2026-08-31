import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { logger } from '@/lib/logger';

export async function GET(
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
      ? (await sql`SELECT id FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const orders = await sql`
      SELECT *
      FROM payment_orders
      WHERE cotacao_id = ${id}
      ORDER BY created_at DESC
    `;

    const installments = await sql`
      SELECT *
      FROM payment_installments
      WHERE cotacao_id = ${id}
      ORDER BY installment_number ASC, created_at ASC
    `;

    return Response.json({ ok: true, orders, installments });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.portal.cotacoes.pagamentos.failed');
    return Response.json({ error: 'Erro interno ao consultar pagamentos' }, { status: 500 });
  }
}

