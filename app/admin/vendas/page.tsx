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
    <div className="space-y-6">
      {/* Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">OPERAÇÃO DE VENDAS</span>
          <h1 className="admin-page-title">Vendas</h1>
          <p className="admin-page-copy">Todas as apólices emitidas na plataforma.</p>
        </div>
      </section>

      {/* Cards de Métricas Grid Padronizado */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="admin-metric-card">
          <div className="admin-metric-label">Total Vendas</div>
          <div className="admin-metric-value">{vendas.length}</div>
          <div className="admin-metric-hint">apólices confirmadas</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Volume Total</div>
          <div className="admin-metric-value">{formatCurrency(totalPremios)}</div>
          <div className="admin-metric-hint">prêmio emitido acumulado</div>
        </div>

        <div className="admin-metric-card tone-success">
          <div className="admin-metric-label">Comissões Geradas</div>
          <div className="admin-metric-value">{formatCurrency(totalComissoes)}</div>
          <div className="admin-metric-hint">repasse parceiros</div>
        </div>
      </section>

      {/* Tabela de Vendas Padronizada */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {vendas.length === 0 ? (
          <div className="px-6 py-16 text-center text-xs font-bold text-gray-400">Nenhuma venda registrada.</div>
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
