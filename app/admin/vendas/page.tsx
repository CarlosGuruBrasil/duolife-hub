import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Search } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import WixSalesSyncButton from './_sync-button';
import { VendasFilterSection } from './_components/VendasFilterSection';
import { VendasPagination } from './_components/VendasPagination';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { formatCurrency, formatDate, formatStatusLabel } from '@/lib/format';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';

export const dynamic = 'force-dynamic';

interface VendaRow {
  id: string;
  policy_number: string;
  premio_total: number;
  commission_amount: number;
  commission_rate: number | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  created_at: string;
  client_name: string;
  product_name: string;
  partner_name: string;
  client_cpf_cnpj: string | null;
  source?: string | null;
}

const statusLabel: Record<string, string> = {
  ativa: 'Ativa',
  active: 'Ativa',
  cancelada: 'Cancelada',
  cancelled: 'Cancelada',
  expirada: 'Expirada',
  expired: 'Expirada',
  suspensa: 'Suspensa',
  suspended: 'Suspensa',
};

const statusColor: Record<string, string> = {
  ativa: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelada: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-amber-50 text-amber-800 border-amber-200',
  expired: 'bg-amber-50 text-amber-800 border-amber-200',
  suspensa: 'bg-slate-100 text-slate-700 border-slate-200',
  suspended: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default async function AdminVendasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const params = searchParams ? await searchParams : {};
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const productId = typeof params.productId === 'string' ? params.productId : '';
  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : '';
  const periodPreset = typeof params.periodPreset === 'string' ? (params.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
  const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
  const pageSize = [10, 25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const conditions = [];

  if (status) {
    conditions.push(sql`s.status = ${status}`);
  }
  if (productId) {
    conditions.push(sql`s.product_id = ${productId}`);
  }
  if (partnerId) {
    conditions.push(sql`s.partner_id = ${partnerId}`);
  }

  const { start, end } = resolveDateRange(periodPreset, startDate, endDate);
  if (start) conditions.push(sql`s.created_at >= ${start}::timestamptz`);
  if (end) conditions.push(sql`s.created_at <= ${end}::timestamptz`);

  if (q) {
    const textLike = `%${q.replace(/([\\%_])/g, '\\$1')}%`;
    const digitsOnly = q.replace(/\D/g, '');
    if (digitsOnly.length >= 3) {
      const digitsLike = `%${digitsOnly.replace(/([\\%_])/g, '\\$1')}%`;
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR p.razao_social ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR regexp_replace(COALESCE(c.client_cpf_cnpj, ''), '\\D', '', 'g') ILIKE ${digitsLike}
        OR regexp_replace(COALESCE(s.policy_number, ''), '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR p.razao_social ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
      )`);
    }
  }

  const where = conditions.length
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  const [metricsResult, productsList, partnersList] = await Promise.all([
    sql<{ total_count: string; total_premios: string; total_comissoes: string }[]>`
      SELECT
        COUNT(*)::text as total_count,
        COALESCE(SUM(NULLIF(regexp_replace(s.premio_total::text, '[^0-9.]', '', 'g'), '')::numeric), 0)::text as total_premios,
        COALESCE(SUM(NULLIF(regexp_replace(s.commission_amount::text, '[^0-9.]', '', 'g'), '')::numeric), 0)::text as total_comissoes
      FROM sales s
      JOIN products pr ON pr.id = s.product_id
      JOIN cotacoes c ON c.id = s.cotacao_id
      LEFT JOIN partners p ON p.id = s.partner_id
      WHERE ${where}
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, name
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, razao_social AS name
      FROM partners
      WHERE status = 'active'
      ORDER BY razao_social ASC
    `,
  ]);

  const totalRecords = Number(metricsResult[0]?.total_count || 0);
  const totalPremios = Number(metricsResult[0]?.total_premios || 0);
  const totalComissoes = Number(metricsResult[0]?.total_comissoes || 0);

  const totalPages = Math.ceil(totalRecords / pageSize);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const offset = (safePage - 1) * pageSize;

  const vendas = await sql<VendaRow[]>`
    SELECT
      s.id,
      s.policy_number,
      s.importancia_segurada,
      s.premio_total,
      s.commission_rate,
      s.commission_amount,
      s.status,
      COALESCE(s.metadata->>'source', 'duolife') AS source,
      s.issue_date,
      s.expiry_date,
      s.created_at,
      COALESCE(p.razao_social, 'Sem parceiro') AS partner_name,
      pr.name AS product_name,
      c.client_name,
      c.client_cpf_cnpj
    FROM sales s
    JOIN products pr ON pr.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners p ON p.id = s.partner_id
    WHERE ${where}
    ORDER BY s.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const hasActiveFilters = Boolean(q || status || productId || partnerId || (periodPreset && periodPreset !== 'all'));

  return (
    <div className="space-y-6">
      {/* Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card flex-row items-center justify-between flex-wrap gap-4">
        <div>
          <span className="admin-eyebrow">OPERAÇÃO DE VENDAS</span>
          <h1 className="admin-page-title">Vendas</h1>
          <p className="admin-page-copy">Todas as apólices emitidas na plataforma DuoLife.</p>
        </div>
        <WixSalesSyncButton />
      </section>

      {/* Cards de Métricas Grid Padronizado (Baseado nos filtros aplicados) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="admin-metric-card">
          <div className="admin-metric-label">Total Vendas</div>
          <div className="admin-metric-value">{totalRecords}</div>
          <div className="admin-metric-hint">apólices encontradas</div>
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

      {/* Barra de Filtros Reativa e Inteligente */}
      <VendasFilterSection
        products={productsList.map((p) => ({ id: p.id, name: p.name }))}
        partners={partnersList.map((p) => ({ id: p.id, name: p.name }))}
        statusLabels={statusLabel}
        pageSize={pageSize}
      />

      {/* Tabela de Vendas Padronizada */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {vendas.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              {hasActiveFilters ? <Search size={28} /> : <FileText size={28} />}
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {hasActiveFilters ? 'Nenhuma venda encontrada' : 'Nenhuma venda registrada'}
            </h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm text-gray-500">
              {hasActiveFilters
                ? 'Tente ajustar ou limpar os filtros para encontrar as vendas desejadas.'
                : 'As apólices emitidas na plataforma aparecerão nesta lista.'}
            </p>
            {hasActiveFilters && (
              <Link
                href="/admin/vendas"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-gray-800"
              >
                Limpar todos os filtros
              </Link>
            )}
          </div>
        ) : (
          <>
            <TableScrollContainer minWidth="1100px">
              <table className="w-full min-w-[1100px] text-left text-sm border-separate border-spacing-0">
                <thead className="table-sticky-head bg-gray-50/95 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-5 py-3.5 table-sticky-col-head rounded-tl-2xl">Cliente</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Parceiro</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Apólice</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Produto</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Prêmio</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Comissão</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Vigência</th>
                    <th className="px-5 py-3.5 border-b border-gray-200 rounded-tr-2xl">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {vendas.map((venda) => (
                    <tr key={venda.id} className="group hover:bg-gray-50/75 transition-colors">
                      <td className="px-5 py-4 table-sticky-col-cell">
                        <div className="font-semibold text-gray-900">{venda.client_name}</div>
                        {venda.client_cpf_cnpj && (
                          <div className="text-xs text-gray-500">{venda.client_cpf_cnpj}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-gray-700 border-b border-gray-100">{venda.partner_name}</td>
                      <td className="px-5 py-4 text-gray-600 border-b border-gray-100">
                        <div className="font-semibold text-gray-800">{venda.policy_number || '-'}</div>
                        {venda.source === 'wix' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-[#0e4a5a] mt-0.5">
                            Wix Import
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 mt-0.5">
                            DuoLife Direct
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-700 font-medium border-b border-gray-100">{venda.product_name}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900 border-b border-gray-100">{formatCurrency(venda.premio_total)}</td>
                      <td className="px-5 py-4 text-gray-600 border-b border-gray-100">
                        <div className="font-semibold text-gray-900">{formatCurrency(venda.commission_amount)}</div>
                        {venda.commission_rate && (
                          <span className="text-xs text-gray-400">{Number(venda.commission_rate)}%</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-500 border-b border-gray-100">
                        {formatDate(venda.issue_date)} — {formatDate(venda.expiry_date)}
                      </td>
                      <td className="px-5 py-4 border-b border-gray-100">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border ${
                            statusColor[venda.status?.toLowerCase()] || statusColor[venda.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {formatStatusLabel(venda.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollContainer>

            <VendasPagination
              currentPage={safePage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              pageSize={pageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
