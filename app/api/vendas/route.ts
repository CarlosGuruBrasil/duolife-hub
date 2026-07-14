import { getPartnerAccessContext, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();
  const access = await getPartnerAccessContext(user);
  if (!access) return unauthorized();

  try {
    await ensureSchema();

    const vendas = access.visibleUserIds === null
      ? await sql`
          SELECT
            s.id,
            s.policy_number,
            s.importancia_segurada,
            s.premio_total,
            s.commission_rate,
            s.commission_amount,
            s.status,
            s.issue_date,
            s.expiry_date,
            s.created_at,
            p.name AS product_name,
            c.client_name
          FROM sales s
          JOIN products p ON p.id = s.product_id
          JOIN cotacoes c ON c.id = s.cotacao_id
          WHERE s.partner_id = ${access.partnerId}
          ORDER BY s.issue_date DESC, s.created_at DESC
          LIMIT 100
        `
      : await sql`
          SELECT
            s.id,
            s.policy_number,
            s.importancia_segurada,
            s.premio_total,
            s.commission_rate,
            s.commission_amount,
            s.status,
            s.issue_date,
            s.expiry_date,
            s.created_at,
            p.name AS product_name,
            c.client_name
          FROM sales s
          JOIN products p ON p.id = s.product_id
          JOIN cotacoes c ON c.id = s.cotacao_id
          WHERE s.partner_id = ${access.partnerId}
            AND c.partner_user_id IN ${sql(access.visibleUserIds)}
          ORDER BY s.issue_date DESC, s.created_at DESC
          LIMIT 100
        `;

    return Response.json({ vendas });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'sales.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
