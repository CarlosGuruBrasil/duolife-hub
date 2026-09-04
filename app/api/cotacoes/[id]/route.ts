import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  const { id } = await params;

  try {
    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id FROM public_sale_links
        WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `;
      if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });

      const [cotacao] = await sql`
        SELECT * FROM cotacoes
        WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${link.partner_id}
        LIMIT 1
      `;
      if (!cotacao) return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
      return Response.json({ ok: true, cotacao });
    }

    const user = await verifyAuth();
    if (!user) return unauthorized();

    const accessible = await getAccessibleQuoteById(id, user);
    if (!accessible) {
      return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const [cotacao] = await sql`
      SELECT
        c.*,
        p.name AS product_name,
        p.flow_key AS product_flow_key,
        part.nome_fantasia AS partner_name,
        part.razao_social AS partner_razao_social
      FROM cotacoes c
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN partners part ON part.id = c.partner_id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    return Response.json({ ok: true, cotacao: cotacao || accessible });
  } catch (err) {
    logger.error({ err, id }, 'api.cotacoes.get_by_id.failed');
    return Response.json({ error: 'Erro interno ao buscar cotação' }, { status: 500 });
  }
}
