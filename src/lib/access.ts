import { getPartnerAccessContext, isInternalUser, type AuthUser } from './auth';
import { sql } from './pg';

export async function getAccessibleQuoteById(quoteId: string, user: AuthUser) {
  if (isInternalUser(user)) {
    const rows = await sql`SELECT * FROM cotacoes WHERE id = ${quoteId} LIMIT 1`;
    return rows[0] ?? null;
  }

  const access = await getPartnerAccessContext(user);
  if (!access) return null;

  if (access.visibleUserIds === null) {
    const rows = await sql`
      SELECT *
      FROM cotacoes
      WHERE id = ${quoteId}
        AND partner_id = ${access.partnerId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  const rows = await sql`
    SELECT *
    FROM cotacoes
    WHERE id = ${quoteId}
      AND partner_id = ${access.partnerId}
      AND partner_user_id IN ${sql(access.visibleUserIds)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
