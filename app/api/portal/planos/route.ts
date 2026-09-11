import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function GET(req: Request) {
  const publicToken = req.headers.get('x-public-token');
  const url = new URL(req.url);
  const requestedPartnerId = url.searchParams.get('partnerId');
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
    
    if (isInternalUser(user)) {
      targetPartnerId = requestedPartnerId || user.partnerId || null;
    } else {
      targetPartnerId = user.partnerId;
    }
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

    // Obtém taxa de comissão do parceiro (ou base do produto prod-rc-001)
    let commissionRate = 20;
    try {
      const [rateRow] = await sql`
        SELECT
          COALESCE(
            (
              SELECT rate
              FROM partner_commission_rates
              WHERE (partner_id = ${targetPartnerId} OR ${targetPartnerId} IS NULL)
                AND (product_id = 'prod-rc-001' OR product_id IS NOT NULL)
                AND valid_from <= CURRENT_DATE
                AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
              ORDER BY valid_from DESC
              LIMIT 1
            ),
            (
              SELECT base_commission_rate
              FROM products
              WHERE id = 'prod-rc-001'
              LIMIT 1
            ),
            20
          ) AS rate
      `;
      if (rateRow?.rate != null) {
        commissionRate = Number(rateRow.rate);
      }
    } catch {
      // Fallback seguro de 20%
    }

    return Response.json({ ok: true, planos, commissionRate });
  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.planos.failed');
    return Response.json({ error: 'Erro interno ao buscar planos' }, { status: 500 });
  }
}

