import { redirect } from 'next/navigation';
import { WalletCards } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';

interface ComissaoRow {
  id: string;
  amount: string;
  rate: string;
  status: string;
  reference_month: string | null;
  payment_date: string | null;
  created_at: string;
  partner_name: string;
  policy_number: string | null;
  product_name: string;
  client_name: string;
}

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  paga: 'Paga',
  estornada: 'Estornada',
};

function formatCurrency(value: string | number | null) {
  if (value === null) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

export default async function AdminComissoesPage() {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const comissoes = await sql<ComissaoRow[]>`
    SELECT
      cm.id,
      cm.amount,
      cm.rate,
      cm.status,
      cm.reference_month,
      cm.payment_date,
      cm.created_at,
      COALESCE(p.razao_social, 'Sem parceiro') AS partner_name,
      s.policy_number,
      pr.name AS product_name,
      c.client_name
    FROM commissions cm
    JOIN sales s ON s.id = cm.sale_id
    JOIN products pr ON pr.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners p ON p.id = cm.partner_id
    ORDER BY cm.created_at DESC
    LIMIT 200
  `;

  const pending = comissoes
    .filter((comissao) => comissao.status === 'pendente' || comissao.status === 'aprovada')
    .reduce((sum, comissao) => sum + Number(comissao.amount), 0);

  const paid = comissoes
    .filter((comissao) => comissao.status === 'paga')
    .reduce((sum, comissao) => sum + Number(comissao.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">FINANCEIRO & REPASSE</span>
          <h1 className="admin-page-title">Comissões</h1>
          <p className="admin-page-copy">Extrato financeiro consolidado da plataforma.</p>
        </div>
      </section>

      {/* Cards de Métricas Grid Padronizado */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="admin-metric-card tone-warning">
          <div className="admin-metric-label">A Receber</div>
          <div className="admin-metric-value">{formatCurrency(pending)}</div>
          <div className="admin-metric-hint">comissões em aberto</div>
        </div>

        <div className="admin-metric-card tone-success">
          <div className="admin-metric-label">Pagas</div>
          <div className="admin-metric-value">{formatCurrency(paid)}</div>
          <div className="admin-metric-hint">baixas repassadas</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Total Lançamentos</div>
          <div className="admin-metric-value">{comissoes.length}</div>
          <div className="admin-metric-hint">registros no extrato</div>
        </div>
      </section>

      {/* Tabela de Comissões Padronizada */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {comissoes.length === 0 ? (
          <div className="px-6 py-16 text-center text-xs font-bold text-gray-400">Nenhuma comissão lançada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Parceiro</th>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Apólice</th>
                  <th className="px-5 py-3 font-semibold">Produto</th>
                  <th className="px-5 py-3 font-semibold">Referência</th>
                  <th className="px-5 py-3 font-semibold">Valor</th>
                  <th className="px-5 py-3 font-semibold">Pagamento</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comissoes.map((comissao) => (
                  <tr key={comissao.id} className="table-row">
                    <td className="px-5 py-4 text-gray-600">{comissao.partner_name}</td>
                    <td className="px-5 py-4 font-semibold" style={{ color: 'var(--primary)' }}>{comissao.client_name}</td>
                    <td className="px-5 py-4 text-gray-600">{comissao.policy_number || '-'}</td>
                    <td className="px-5 py-4 text-gray-600">{comissao.product_name}</td>
                    <td className="px-5 py-4 text-gray-600">{comissao.reference_month || '-'}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {formatCurrency(comissao.amount)}
                      <span className="block text-xs text-gray-400">{Number(comissao.rate)}%</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{formatDate(comissao.payment_date)}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">{statusLabel[comissao.status] || comissao.status}</span>
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
