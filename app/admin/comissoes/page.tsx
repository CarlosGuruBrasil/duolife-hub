import { redirect } from 'next/navigation';
import { WalletCards } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { formatCurrency, formatDateTime as formatDate, formatStatusLabel } from '@/lib/format';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';

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
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs">
        {comissoes.length === 0 ? (
          <div className="px-6 py-16 text-center text-xs font-bold text-gray-400">Nenhuma comissão lançada.</div>
        ) : (
          <TableScrollContainer minWidth="1180px">
            <table className="w-full min-w-[1180px] text-left text-sm border-separate border-spacing-0">
              <thead className="bg-gray-50/95 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 table-sticky-col-head rounded-tl-2xl">Parceiro</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Cliente</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Apólice</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Produto</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Referência</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Valor</th>
                  <th className="px-5 py-3.5 border-b border-gray-200">Pagamento</th>
                  <th className="px-5 py-3.5 border-b border-gray-200 rounded-tr-2xl">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comissoes.map((comissao) => (
                  <tr key={comissao.id} className="group hover:bg-gray-50/75 transition-colors">
                    <td className="px-5 py-4 table-sticky-col-cell text-xs font-semibold text-gray-700">{comissao.partner_name}</td>
                    <td className="px-5 py-4 font-semibold border-b border-gray-100" style={{ color: 'var(--primary)' }}>{comissao.client_name}</td>
                    <td className="px-5 py-4 text-gray-600 border-b border-gray-100">{comissao.policy_number || '-'}</td>
                    <td className="px-5 py-4 text-gray-600 border-b border-gray-100">{comissao.product_name}</td>
                    <td className="px-5 py-4 text-gray-600 border-b border-gray-100">{comissao.reference_month || '-'}</td>
                    <td className="px-5 py-4 text-gray-600 border-b border-gray-100">
                      {formatCurrency(comissao.amount)}
                      <span className="block text-xs text-gray-400">{Number(comissao.rate)}%</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 border-b border-gray-100">{formatDate(comissao.payment_date)}</td>
                    <td className="px-5 py-4 border-b border-gray-100">
                      <span className="status-pill">{formatStatusLabel(comissao.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollContainer>
        )}
      </div>
    </div>
  );
}
