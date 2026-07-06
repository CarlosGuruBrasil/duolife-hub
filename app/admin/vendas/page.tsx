import { redirect } from 'next/navigation';
import { FileText, TrendingUp, WalletCards } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';

interface VendaRow {
  id: string;
  policy_number: string | null;
  importancia_segurada: string | null;
  premio_total: string | null;
  commission_rate: string | null;
  commission_amount: string | null;
  status: string;
  issue_date: string;
  expiry_date: string;
  created_at: string;
  partner_name: string;
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

export default async function AdminVendasPage() {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const vendas = await sql<VendaRow[]>`
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
      COALESCE(p.razao_social, 'Sem parceiro') AS partner_name,
      pr.name AS product_name,
      c.client_name
    FROM sales s
    JOIN products pr ON pr.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners p ON p.id = s.partner_id
    ORDER BY s.created_at DESC
    LIMIT 200
  `;

  const totalPremios = vendas.reduce((sum, venda) => sum + Number(venda.premio_total || 0), 0);
  const totalComissoes = vendas.reduce((sum, venda) => sum + Number(venda.commission_amount || 0), 0);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <FileText size={24} style={{ color: 'var(--primary)' }} />
          <div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>Vendas</h1>
            <p className="text-gray-500 text-sm mt-1">Todas as apólices emitidas na plataforma.</p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendas</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{vendas.length}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Volume total</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(totalPremios)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões geradas</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(totalComissoes)}</div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {vendas.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhuma venda registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Parceiro</th>
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
                    <td className="px-5 py-4 text-gray-600">{venda.partner_name}</td>
                    <td className="px-5 py-4 font-semibold" style={{ color: 'var(--primary)' }}>{venda.client_name}</td>
                    <td className="px-5 py-4 text-gray-600">{venda.policy_number || '-'}</td>
                    <td className="px-5 py-4 text-gray-600">{venda.product_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatCurrency(venda.premio_total)}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {formatCurrency(venda.commission_amount)}
                      {venda.commission_rate && <span className="block text-xs text-gray-400">{Number(venda.commission_rate)}%</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {formatDate(venda.issue_date)} - {formatDate(venda.expiry_date)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="status-pill">{statusLabel[venda.status] || venda.status}</span>
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
