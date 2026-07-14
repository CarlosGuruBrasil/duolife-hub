import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

interface VendaRow {
  id: string;
  policy_number: string | null;
  premio_total: string | null;
  commission_rate: string | null;
  commission_amount: string | null;
  status: string;
  issue_date: string;
  expiry_date: string;
  product_name: string;
  client_name: string;
}

const statusLabel: Record<string, string> = {
  ativa: 'Ativa',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  suspensa: 'Suspensa',
};

function formatCurrency(value: string | number | null) {
  if (value === null) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

export default async function VendasPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();

  const vendas = access.visibleUserIds === null
    ? await sql<VendaRow[]>`
        SELECT
          s.id,
          s.policy_number,
          s.premio_total,
          s.commission_rate,
          s.commission_amount,
          s.status,
          s.issue_date,
          s.expiry_date,
          p.name AS product_name,
          c.client_name
        FROM sales s
        JOIN products p ON p.id = s.product_id
        JOIN cotacoes c ON c.id = s.cotacao_id
        WHERE s.partner_id = ${access.partnerId}
        ORDER BY s.issue_date DESC, s.created_at DESC
        LIMIT 100
      `
    : await sql<VendaRow[]>`
        SELECT
          s.id,
          s.policy_number,
          s.premio_total,
          s.commission_rate,
          s.commission_amount,
          s.status,
          s.issue_date,
          s.expiry_date,
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

  const totalPremios = vendas.reduce((sum, venda) => sum + Number(venda.premio_total || 0), 0);
  const totalComissoes = vendas.reduce((sum, venda) => sum + Number(venda.commission_amount || 0), 0);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Vendas</h1>
          <p className="muted mt-1 text-sm">Apólices emitidas e volume gerado pela sua corretora.</p>
        </div>
        <Link href="/portal/cotacoes/nova" className="btn-primary">
          <Plus size={16} /> Nova Cotação
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Apólices</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{vendas.length}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Prêmios</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(totalPremios)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões geradas</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(totalComissoes)}</div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {vendas.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Nenhuma venda registrada</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              As vendas emitidas pela DuoLife aparecerão aqui com apólice, prêmio e comissão.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Apólice</th>
                  <th className="px-5 py-3 font-semibold">Produto</th>
                  <th className="px-5 py-3 font-semibold">Prêmio</th>
                  <th className="px-5 py-3 font-semibold">Comissão</th>
                  <th className="px-5 py-3 font-semibold">Vigência</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendas.map((venda) => (
                  <tr key={venda.id} className="table-row">
                    <td className="px-5 py-4 font-semibold" style={{ color: 'var(--primary)' }}>{venda.client_name}</td>
                    <td className="px-5 py-4 text-gray-600">{venda.policy_number || '-'}</td>
                    <td className="px-5 py-4 text-gray-600">{venda.product_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatCurrency(venda.premio_total)}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {formatCurrency(venda.commission_amount)}
                      {venda.commission_rate && <span className="block text-xs text-gray-400">{Number(venda.commission_rate)}%</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-500">{formatDate(venda.issue_date)} - {formatDate(venda.expiry_date)}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">
                        {statusLabel[venda.status] || venda.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
