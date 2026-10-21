import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, RefreshCw, FileText, Search, ExternalLink } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { PortalVendasFilterSection } from './_components/PortalVendasFilterSection';
import { PortalVendasPagination } from './_components/PortalVendasPagination';
import { PeriodPreset, resolveDateRange, getPeriodLabel } from '@/lib/date-filters';
import { formatCurrency, formatDate, formatStatusLabel, formatPlanLabel, formatPolicyValidity } from '@/lib/format';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { MatrixStatusBadge } from '@/components/common/MatrixStatusBadge';
import { calculateMatrixStatus, getSaleMatrixFilterSql } from '@/lib/status-matrix';

export const dynamic = 'force-dynamic';

interface VendaRow {
  id: string;
  cotacao_id?: string;
  policy_number: string;
  importancia_segurada?: number | string | null;
  premio_total: number;
  commission_amount: number;
  commission_rate: number | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  created_at: string;
  client_name: string;
  product_id: string;
  product_name: string;
  partner_name: string;
  client_cpf_cnpj: string | null;
  client_data?: any;
  days_overdue?: number | null;
  is_fully_paid?: boolean | null;
  payment_order_status?: string | null;
}

const statusLabel: Record<string, string> = {
  // Status do Cliente (Matriz Principal)
  vigente: 'Vigente / Renovado',
  'vigente / renovado': 'Vigente / Renovado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  // Status da Venda (Legado)
  ativa: 'Ativa',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  suspensa: 'Suspensa',
};

const statusAliases: Record<string, string[]> = {
  ativa: ['ativa', 'active'],
  active: ['ativa', 'active'],
  cancelada: ['cancelada', 'cancelled'],
  cancelled: ['cancelada', 'cancelled'],
  expirada: ['expirada', 'expired'],
  expired: ['expirada', 'expired'],
  suspensa: ['suspensa', 'suspended'],
  suspended: ['suspensa', 'suspended'],
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

export default async function PortalVendasPage({
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
  const rawStatus = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
  const statusGeral = typeof params.statusGeral === 'string' ? params.statusGeral.trim() : '';
  const statusPagamento = typeof params.statusPagamento === 'string' ? params.statusPagamento.trim() : '';
  const statusVariants = statusAliases[rawStatus] || (statusLabel[rawStatus] ? [rawStatus] : null);
  const status = statusLabel[rawStatus] ? rawStatus : (statusVariants ? statusVariants[0] : '');
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const productId = typeof params.productId === 'string' ? params.productId : '';
  const rawPeriodPreset = typeof params.periodPreset === 'string' ? (params.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
  const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
  const periodPreset: PeriodPreset = rawPeriodPreset ?? (startDate || endDate ? 'custom' : '30d');
  const periodLabel = getPeriodLabel(periodPreset, startDate, endDate);
  const isFilteredPeriod = periodPreset !== 'all';
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
  if (['vigente', 'vigente / renovado'].includes(rawStatus)) {
    conditions.push(sql`s.status = 'ativa' AND s.expiry_date >= CURRENT_DATE`);
  } else if (rawStatus === 'cancelado') {
    conditions.push(sql`s.status = 'cancelada'`);
  } else if (rawStatus === 'expirado') {
    conditions.push(sql`(s.status = 'expirada' OR s.expiry_date < CURRENT_DATE)`);
  } else if (statusVariants && statusVariants.length > 0) {
    conditions.push(sql`s.status = ANY(${statusVariants})`);
  }

  // Filtros da Matriz de Status (Status Geral e Status de Pagamento)
  if (statusGeral || statusPagamento) {
    const matrixClauses = getSaleMatrixFilterSql(statusGeral, statusPagamento, 's', 'c');
    for (const clause of matrixClauses) {
      conditions.push(sql.unsafe(clause));
    }
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
      s.cotacao_id,
      s.policy_number,
      COALESCE(s.importancia_segurada, c.importancia_segurada) AS importancia_segurada,
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
      c.client_data,
      pt.razao_social AS partner_name,
      COALESCE(
        (
          SELECT CASE
            -- Se existem parcelas cadastradas em payment_installments:
            -- Só existe atraso se houver alguma parcela NÃO PAGA cujo vencimento seja anterior a hoje
            WHEN COUNT(*) > 0 THEN
              COALESCE(
                MAX(
                  CASE
                    WHEN (pi.paid_at IS NULL AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash'))
                         AND pi.due_date < CURRENT_DATE
                    THEN GREATEST(0, (CURRENT_DATE - pi.due_date)::int)
                    ELSE 0
                  END
                ),
                0
              )
            ELSE NULL
          END
          FROM payment_installments pi
          WHERE pi.cotacao_id = s.cotacao_id
            -- Ignora cobrança avulsa inicial substituída por carnê (quando já existe parcela 1 paga e parcelas subsequentes)
            AND NOT (
              pi.installment_number = 1
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash')
              AND EXISTS (
                SELECT 1 FROM payment_installments pi_sub
                WHERE pi_sub.cotacao_id = pi.cotacao_id
                  AND pi_sub.installment_number > 1
              )
              AND EXISTS (
                SELECT 1 FROM payment_installments pi_paid
                WHERE pi_paid.cotacao_id = pi.cotacao_id
                  AND pi_paid.installment_number = 1
                  AND (pi_paid.paid_at IS NOT NULL OR LOWER(COALESCE(pi_paid.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash'))
                  AND pi_paid.id != pi.id
              )
            )
        ),
        (
          SELECT CASE
            -- Se a ordem está totalmente paga/confirmada: 0 atraso
            WHEN LOWER(COALESCE(po.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash') THEN 0
            -- Se a ordem é partially_paid (1ª parcela paga e as demais a vencer): 0 atraso da ordem mãe
            WHEN LOWER(COALESCE(po.status, '')) = 'partially_paid' THEN 0
            -- Se a apólice já foi emitida e está ativa na tabela sales, a parcela inicial já foi quitada
            WHEN s.status = 'ativa' THEN 0
            -- Cotação não emitida e não paga: calcula atraso a partir do vencimento da proposta
            WHEN LOWER(COALESCE(po.status, '')) IN ('pending', 'overdue') AND po.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - po.due_date)::int)
            ELSE 0
          END
          FROM payment_orders po
          WHERE po.cotacao_id = s.cotacao_id
          ORDER BY po.created_at DESC
          LIMIT 1
        ),
        0
      )::int AS days_overdue,
      COALESCE(
        (
          SELECT CASE
            WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE LOWER(COALESCE(pi.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash')) THEN true
            ELSE false
          END
          FROM payment_installments pi
          WHERE pi.cotacao_id = s.cotacao_id
            -- Ignora cobrança avulsa inicial substituída por carnê (quando já existe parcela 1 paga e parcelas subsequentes)
            AND NOT (
              pi.installment_number = 1
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash')
              AND EXISTS (
                SELECT 1 FROM payment_installments pi_sub
                WHERE pi_sub.cotacao_id = pi.cotacao_id
                  AND pi_sub.installment_number > 1
              )
              AND EXISTS (
                SELECT 1 FROM payment_installments pi_paid
                WHERE pi_paid.cotacao_id = pi.cotacao_id
                  AND pi_paid.installment_number = 1
                  AND (pi_paid.paid_at IS NOT NULL OR LOWER(COALESCE(pi_paid.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash'))
                  AND pi_paid.id != pi.id
              )
            )
        ),
        (
          SELECT CASE
            WHEN LOWER(COALESCE(po.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash') THEN true
            ELSE false
          END
          FROM payment_orders po
          WHERE po.cotacao_id = s.cotacao_id
          ORDER BY po.created_at DESC
          LIMIT 1
        ),
        CASE
          WHEN c.status IN ('aprovada', 'emitida') THEN true
          ELSE false
        END
      )::boolean AS is_fully_paid,
      (
        SELECT po.status
        FROM payment_orders po
        WHERE po.cotacao_id = s.cotacao_id
        ORDER BY po.created_at DESC
        LIMIT 1
      ) AS payment_order_status
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners pt ON pt.id = s.partner_id
    WHERE ${where}
    ORDER BY s.issue_date DESC, s.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const hasActiveFilters = Boolean(q || status || productId || periodPreset !== '30d');

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
          <div className="mt-1 text-xs text-gray-400">
            {isFilteredPeriod ? `apólices (${periodLabel.toLowerCase()})` : 'acumulado total'}
          </div>
        </div>
        <div className="card bg-white border border-gray-200 shadow-2xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Volume em Prêmios</div>
          <div className="mt-2 text-2xl font-black text-[#0e4a5a]">{formatCurrency(totalPremios)}</div>
          <div className="mt-1 text-xs text-gray-400">
            {isFilteredPeriod ? `emitido (${periodLabel.toLowerCase()})` : 'acumulado total'}
          </div>
        </div>
        <div className="card bg-white border border-gray-200 shadow-2xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões Geradas</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{formatCurrency(totalComissoes)}</div>
          <div className="mt-1 text-xs text-emerald-600/80">
            {isFilteredPeriod ? `repasse (${periodLabel.toLowerCase()})` : 'acumulado total'}
          </div>
        </div>
      </div>

      {/* Barra de Filtros Reativa e Inteligente */}
      <PortalVendasFilterSection
        products={productsList.map((p) => ({ id: p.id, name: p.name }))}
        statusLabels={statusLabel}
        pageSize={pageSize}
      />

      {/* Tabela de Vendas */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
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
                className="mt-5 gap-2 rounded-xl bg-primary px-4 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center text-xs font-semibold text-white transition hover:bg-primary/90"
              >
                Limpar todos os filtros
              </Link>
            )}
          </div>
        ) : (
          <>
            <TableScrollContainer minWidth="860px">
              <table className="w-full min-w-[860px] text-left text-sm border-separate border-spacing-0">
                <thead className="table-sticky-head bg-gray-50/95 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-5 py-3.5 table-sticky-col-head rounded-tl-2xl">Cliente</th>
                    <th className="px-5 py-3.5 border-b border-gray-200 text-center">Situação / Status</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Plano</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Prêmio</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Comissão</th>
                    <th className="px-5 py-3.5 border-b border-gray-200">Vigência</th>
                    {isCorretora && <th className="px-5 py-3.5 border-b border-gray-200">Corretor</th>}
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

                    const matrixStatus = calculateMatrixStatus({
                      hasSale: true,
                      saleStatus: venda.status,
                      expiryDate: venda.expiry_date,
                      daysOverdue: venda.days_overdue,
                      isFullyPaid: venda.is_fully_paid,
                      paymentStatus: venda.payment_order_status || (venda.is_fully_paid ? 'paid' : undefined),
                      hasCotacao: Boolean(venda.cotacao_id),
                      cotacaoStatus: 'emitida',
                    });

                    return (
                      <tr key={venda.id} className="group hover:bg-gray-50/75 transition-colors">
                        <td className="px-5 py-4 table-sticky-col-cell">
                          <Link
                            href={venda.cotacao_id ? `/portal/cotacoes/${venda.cotacao_id}?from=vendas` : `/portal/vendas/${venda.id}`}
                            className="font-semibold text-gray-900 hover:text-[#0e4a5a] hover:underline transition-colors inline-flex items-center gap-1.5 group/name"
                            title="Ver detalhes completos da venda, contrato e cobrança"
                          >
                            <span>{venda.client_name}</span>
                            <ExternalLink size={12} className="text-gray-400 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                          </Link>
                          {venda.client_cpf_cnpj && (
                            <div className="text-xs text-gray-500">{venda.client_cpf_cnpj}</div>
                          )}
                        </td>
                        <td className="px-5 py-4 border-b border-gray-100 text-center">
                          <MatrixStatusBadge result={matrixStatus} variant="table-cell" />
                        </td>
                        <td className="px-5 py-4 border-b border-gray-100">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
                            {formatPlanLabel(venda.importancia_segurada, venda.client_data, venda.product_name)}
                          </span>
                        </td>
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
                          {formatPolicyValidity(venda.issue_date, venda.expiry_date)}
                        </td>
                        {isCorretora && (
                          <td className="px-5 py-4 text-xs font-semibold text-gray-700 border-b border-gray-100">
                            {venda.partner_name || 'Corretora'}
                          </td>
                        )}
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
