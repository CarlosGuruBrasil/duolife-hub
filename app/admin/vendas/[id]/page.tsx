import { notFound, redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function AdminVendaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();
  const { id } = await params;

  // Busca venda por ID da venda ou ID da cotação
  const [sale] = await sql<Array<{ cotacao_id: string }>>`
    SELECT cotacao_id
    FROM sales
    WHERE id = ${id} OR cotacao_id = ${id}
    LIMIT 1
  `;

  if (!sale || !sale.cotacao_id) {
    notFound();
  }

  redirect(`/admin/cotacoes/${sale.cotacao_id}?from=vendas`);
}
