import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

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
    logger.error({ err, partnerId: user.partnerId }, 'api.portal.planos.failed');
    return Response.json({ error: 'Erro interno ao buscar planos' }, { status: 500 });
  }
}
