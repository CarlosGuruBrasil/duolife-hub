import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function GET(req: Request) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    const user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  try {
    const items = await sql`
      SELECT payload
      FROM wix_items
      WHERE wix_collection_id IN (
        SELECT id FROM wix_collections WHERE collection_id = 'PPECARGOS'
      )
      AND is_active = true
    `;

    const cargos = items
      .map(row => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          return parsed?.item?.data || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map(c => ({ id: String(c.id_), text: String(c.text || '') }))
      .filter(c => c.id !== undefined && c.id !== 'undefined' && c.id !== '0') // id_0 é "não desempenho cargo" — já coberto pelo select Sim/Não do formulário
      .sort((a, b) => Number(a.id) - Number(b.id));

    return Response.json({ ok: true, cargos });
  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.ppe-cargos.failed');
    return Response.json({ error: 'Erro interno ao buscar cargos PPE' }, { status: 500 });
  }
}
