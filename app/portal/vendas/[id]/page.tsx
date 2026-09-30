import { notFound, redirect } from 'next/navigation';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function PortalVendaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();
  const { id } = await params;

  const isCorretora = Boolean(access.isCorretoraUser && access.corretoraId);

  const [sale] = isCorretora
    ? await sql<Array<{ cotacao_id: string }>>`
        SELECT cotacao_id
        FROM sales
        WHERE (id = ${id} OR cotacao_id = ${id})
          AND corretora_id = ${access.corretoraId}
        LIMIT 1
      `
    : access.visibleUserIds === null
    ? await sql<Array<{ cotacao_id: string }>>`
        SELECT cotacao_id
        FROM sales
        WHERE (id = ${id} OR cotacao_id = ${id})
          AND partner_id = ${access.partnerId}
        LIMIT 1
      `
    : await sql<Array<{ cotacao_id: string }>>`
        SELECT s.cotacao_id
        FROM sales s
        JOIN cotacoes c ON c.id = s.cotacao_id
        WHERE (s.id = ${id} OR s.cotacao_id = ${id})
          AND s.partner_id = ${access.partnerId}
          AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL)
        LIMIT 1
      `;

  if (!sale || !sale.cotacao_id) {
    notFound();
  }

  redirect(`/portal/cotacoes/${sale.cotacao_id}?from=vendas`);
}
