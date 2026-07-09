import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function GET(req: Request) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let isAdmin = false;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active'
    `;
    if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  try {
    const items = await sql`
      SELECT payload
      FROM wix_items
      WHERE wix_collection_id IN (
        SELECT id FROM wix_collections WHERE collection_id = 'Planos'
      )
      AND is_active = true
    `;

    const planos = items
      .map(row => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          return parsed?.item?.data || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));

    return Response.json({ ok: true, planos });
  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.planos.failed');
    return Response.json({ error: 'Erro interno ao buscar planos' }, { status: 500 });
  }
}
