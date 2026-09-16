import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, RefreshCw, FileText, Search } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { PortalVendasFilterSection } from './_components/PortalVendasFilterSection';
import { PortalVendasPagination } from './_components/PortalVendasPagination';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { formatCurrency, formatDate, formatStatusLabel } from '@/lib/format';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';

export const dynamic = 'force-dynamic';

interface VendaRow {
  id: string;
  policy_number: string | null;
  premio_total: string;
  commission_rate: string | null;
  commission_amount: string | null;
  status: string;
  issue_date: string;
  expiry_date: string;
  product_id: string;
  product_name: string;
  client_name: string;
  client_cpf_cnpj: string | null;
  partner_name?: string | null;
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

export default async function VendasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();

  const isCorretora = Boolean(access.isCorretoraUser && access.corretoraId);

  const params = searchParams ? await searchParams : {};
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const productId = typeof params.productId === 'string' ? params.productId : '';
  const periodPreset = typeof params.periodPreset === 'string' ? (params.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
  const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
  const pageSize = [10, 25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  // Cláusulas de controle de acesso do parceiro/corretora
  const conditions = [];

  if (isCorretora) {
    conditions.push(sql`s.corretora_id = ${access.corretoraId}`);
  } else if (access.visibleUserIds === null) {
    conditions.push(sql`s.partner_id = ${access.partnerId}`);
  } else if (access.visibleUserIds.length > 0) {
    conditions.push(sql`(s.partner_id = ${access.partnerId} AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL))`);
  } else {
    conditions.push(sql`(s.partner_id = ${access.partnerId} AND c.partner_user_id IS NULL)`);
  }

  // Filtros dinâmicos
  if (status) {
    conditions.push(sql`s.status = ${status}`);
  }
  if (productId) {
    conditions.push(sql`s.product_id = ${productId}`);
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
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR regexp_replace(COALESCE(c.client_cpf_cnpj, ''), '\\D', '', 'g') ILIKE ${digitsLike}
        OR regexp_replace(COALESCE(s.policy_number, ''), '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
      )`);
    }
  }

  const where = conditions.length > 0
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  const [metricsResult, productsList] = await Promise.all([
    sql<{ total_count: string; total_premios: string; total_comissoes: string }[]>`
      SELECT
        COUNT(*)::text as total_count,
        COALESCE(SUM(NULLIF(regexp_replace(s.premio_total::text, '[^0-9.]', '', 'g'), '')::numeric), 0)::text as total_premios,
        COALESCE(SUM(NULLIF(regexp_replace(s.commission_amount::text, '[^0-9.]', '', 'g'), '')::numeric), 0)::text as total_comissoes
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN cotacoes c ON c.id = s.cotacao_id
      LEFT JOIN partners pt ON pt.id = s.partner_id
      WHERE ${where}
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, name
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
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
      s.premio_total,
      s.commission_rate,
      s.commission_amount,
      s.status,
      s.issue_date,
      s.expiry_date,
      s.product_id,
      p.name AS product_name,
      c.client_name,
      c.client_cpf_cnpj,
      pt.razao_social AS partner_name
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners pt ON pt.id = s.partner_id
    WHERE ${where}
    ORDER BY s.issue_date DESC, s.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const hasActiveFilters = Boolean(q || status || productId || (periodPreset && periodPreset !== 'all'));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Vendas</h1>
          <p className="muted mt-1 text-sm">
            {isCorretora
              ? 'Apólices emitidas e volume gerado por toda a equipe da sua corretora.'
              : 'Apólices emitidas e volume gerado pela sua carteira.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isCorretora && (
            <Link href="/portal/equipe" className="btn-outline text-xs py-2">
              Ver Vendedores
            </Link>
          )}
          <Link href="/portal/cotacoes/nova" className="btn-primary">
            <Plus size={16} /> Nova Cotação
          </Link>
        </div>
      </div>

      {/* Cards de Métricas Reativos (calculados sobre os filtros atuais) */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card bg-white border border-gray-200 shadow-2xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Apólices</div>
          <div className="mt-2 text-2xl font-black text-[#0e4a5a]">{totalRecords}</div>
        </div>
        <div className="card bg-white border border-gray-200 shadow-2xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Volume em Prêmios</div>
          <div className="mt-2 text-2xl font-black text-[#0e4a5a]">{formatCurrency(totalPremios)}</div>
        </div>
        <div className="card bg-white border border-gray-200 shadow-2xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões Geradas</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{formatCurrency(totalComissoes)}</div>
        </div>
      </div>

      {/* Barra de Filtros Reativa e Inteligente */}
      <PortalVendasFilterSection
        products={productsList.map((p) => ({ id: p.id, name: p.name }))}
        statusLabels={statusLabel}
        pageSize={pageSize}
      />

      {/* Tabela de Vendas */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs">
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
                ? 'Tente ajustar ou limpar os filtros para encontrar o que procura.'
                : 'As vendas emitidas pela DuoLife aparecerão aqui com apólice, prêmio e comissão.'}
            </p>
            {hasActiveFilters && (
              <Link
                href="/portal/vendas"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-gray-800"
              >
                Limpar todos os filtros
              </Link>
            )}
          </div>
        ) : (
          <>
            <TableScrollContainer minWidth="860px">
              <table className="w-full min-w-[860px] text-left text-sm border-separate border-spacing-0">
                <thead className="bg-gray-50/95 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-5 py-3.5 table-sticky-col-head rounded-tl-2xl">Cliente</th>
                    {isCorretora && <th className="px-5 py-3.5 border-b border-gray-200">Corretor</th>}
                    <th className="px-5 py-3.5 border-b border-gray-200">Apólice</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Produto</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Prêmio</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Comissão</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Vigência</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Status</th>
                    <th className="px-5 py-3.5 border-b border-gray-200 text-right rounded-tr-2xl">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {vendas.map((venda) => {
                    const expiryDays = Math.round(
                      (new Date(venda.expiry_date + 'T00:00:00').getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                    );
                    const isExpiringSoon = venda.status === 'ativa' && expiryDays <= 60;

                    return (
                      <tr key={venda.id} className="group hover:bg-gray-50/75 transition-colors">
                        <td className="px-5 py-4 table-sticky-col-cell">
                          <div className="font-semibold text-gray-900">{venda.client_name}</div>
                          {venda.client_cpf_cnpj && (
                            <div className="text-xs text-gray-500">{venda.client_cpf_cnpj}</div>
                          )}
                        </td>
                        {isCorretora && (
                          <td className="px-5 py-4 text-xs font-semibold text-gray-700 border-b border-gray-100">
                            {venda.partner_name || 'Corretora'}
                          </td>
                        )}
                        <td className="px-5 py-4 text-gray-600 font-medium border-b border-gray-100">{venda.policy_number || '-'}</td>
                        <td className="px-5 py-4 text-gray-700 font-medium border-b border-gray-100">{venda.product_name}</td>
                        <td className="px-5 py-4 text-gray-900 font-semibold border-b border-gray-100">{formatCurrency(venda.premio_total)}</td>
                        <td className="px-5 py-4 text-gray-600 border-b border-gray-100">
                          <div className="font-semibold text-gray-900">{formatCurrency(venda.commission_amount)}</div>
                          {venda.commission_rate && (
                            <span className="block text-xs text-gray-400">
                              {Number(venda.commission_rate)}%
                            </span>
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
                        <td className="px-5 py-4 text-right border-b border-gray-100">
                          {isExpiringSoon ? (
                            <Link
                              href={`/portal/cotacoes/nova?product=${encodeURIComponent(
                                venda.product_id
                              )}&cpf=${encodeURIComponent(
                                (venda.client_cpf_cnpj || '').replace(/\D/g, '')
                              )}&renovacao=true&origemSaleId=${encodeURIComponent(venda.id)}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs"
                              title={`Apólice expira em ${expiryDays} dias. Clique para iniciar a renovação.`}
                            >
                              <RefreshCw size={12} className="text-emerald-600" />
                              Renovar {expiryDays <= 0 ? '(Hoje)' : `(D-${expiryDays})`}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScrollContainer>

            <PortalVendasPagination
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
