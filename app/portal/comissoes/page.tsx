import { redirect } from 'next/navigation';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

interface ComissaoRow {
  id: string;
  amount: string;
  rate: string;
  status: string;
  reference_month: string | null;
  payment_date: string | null;
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

export default async function ComissoesPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();

  const comissoes = access.visibleUserIds === null
    ? await sql<ComissaoRow[]>`
        SELECT
          cm.id,
          cm.amount,
          cm.rate,
          cm.status,
          cm.reference_month,
          cm.payment_date,
          s.policy_number,
          p.name AS product_name,
          c.client_name
        FROM commissions cm
        JOIN sales s ON s.id = cm.sale_id
        JOIN products p ON p.id = s.product_id
        JOIN cotacoes c ON c.id = s.cotacao_id
        WHERE cm.partner_id = ${access.partnerId}
        ORDER BY cm.created_at DESC
        LIMIT 100
      `
    : await sql<ComissaoRow[]>`
        SELECT
          cm.id,
          cm.amount,
          cm.rate,
          cm.status,
          cm.reference_month,
          cm.payment_date,
          s.policy_number,
          p.name AS product_name,
          c.client_name
        FROM commissions cm
        JOIN sales s ON s.id = cm.sale_id
        JOIN products p ON p.id = s.product_id
        JOIN cotacoes c ON c.id = s.cotacao_id
        WHERE cm.partner_id = ${access.partnerId}
          AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        ORDER BY cm.created_at DESC
        LIMIT 100
      `;

  const pending = comissoes
    .filter((comissao) => comissao.status === 'pendente' || comissao.status === 'aprovada')
    .reduce((sum, comissao) => sum + Number(comissao.amount), 0);
  const paid = comissoes
    .filter((comissao) => comissao.status === 'paga')
    .reduce((sum, comissao) => sum + Number(comissao.amount), 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Comissões</h1>
        <p className="muted mt-1 text-sm">Extrato financeiro das comissões vinculadas às suas apólices.</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">A receber</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(pending)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pagas</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{formatCurrency(paid)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lançamentos</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{comissoes.length}</div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {comissoes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Nenhuma comissão lançada</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              Quando a DuoLife emitir vendas e calcular repasses, o extrato aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="table-head">
                <tr>
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
                      <span className="status-pill">
                        {statusLabel[comissao.status] || comissao.status}
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
