import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();

    const comissoes = await sql`
      SELECT
        cm.id,
        cm.amount,
        cm.rate,
        cm.status,
        cm.reference_month,
        cm.payment_date,
        cm.notes,
        cm.created_at,
        s.policy_number,
        p.name AS product_name,
        c.client_name
      FROM commissions cm
      JOIN sales s ON s.id = cm.sale_id
      JOIN products p ON p.id = s.product_id
      JOIN cotacoes c ON c.id = s.cotacao_id
      WHERE cm.partner_id = ${user.partnerId!}
      ORDER BY cm.created_at DESC
      LIMIT 100
    `;

    return Response.json({ comissoes });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'commissions.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
