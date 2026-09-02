import { sql } from '@/lib/pg';

type NumericLike = number | string | null;

export interface AdminPeriod {
  monthKey: string;
  label: string;
  start: string;
  endExclusive: string;
  previousStart: string;
  previousEndExclusive: string;
}

export interface AdminMonthOption {
  value: string;
  label: string;
}

export interface DashboardSummary {
  quotesCreated: number;
  waitingSignature: number;
  waitingPayment: number;
  salesIssued: number;
  activePolicies: number;
  totalPremium: number;
  commissionPending: number;
  commissionPaid: number;
  paidAmount: number;
}

export interface DashboardMetricCard {
  title: string;
  value: string;
  hint: string;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
}

export interface FunnelStage {
  status: string;
  label: string;
  count: number;
}

export interface ProductPerformance {
  productName: string;
  quotesCount: number;
  salesCount: number;
  premiumTotal: number;
  commissionTotal: number;
}

export interface PartnerPerformance {
  partnerId: string | null;
  partnerName: string;
  quotesCount: number;
  salesCount: number;
  premiumTotal: number;
  commissionPending: number;
}

export interface RecentAdminEvent {
  id: string;
  type: 'cotacao' | 'venda' | 'comissao';
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  amount: number | null;
}

export interface SyncHealthRow {
  sourceSystem: string;
  total: number;
  successCount: number;
  failedCount: number;
  lastEventAt: string | null;
}

export interface QuoteStatusRow {
  status: string;
  count: number;
  premioTotal: number;
}

export interface PaymentStatusRow {
  status: string;
  ordersCount: number;
  amountTotal: number;
  paidAmount: number;
}

export interface ReportPartnerRow {
  partnerId: string | null;
  partnerName: string;
  quotesCount: number;
  salesCount: number;
  premiumTotal: number;
  paidAmount: number;
  pendingCommission: number;
}

export interface AdminDashboardData {
  period: AdminPeriod;
  summary: DashboardSummary;
  previousSummary: DashboardSummary;
  metricCards: DashboardMetricCard[];
  funnel: FunnelStage[];
  productPerformance: ProductPerformance[];
  partnerPerformance: PartnerPerformance[];
  recentEvents: RecentAdminEvent[];
  syncHealth: SyncHealthRow[];
}

export interface AdminReportData {
  period: AdminPeriod;
  quoteStatuses: QuoteStatusRow[];
  paymentStatuses: PaymentStatusRow[];
  partnerRows: ReportPartnerRow[];
  overduePayments: {
    clientName: string;
    partnerName: string;
    amountTotal: number;
    dueDate: string | null;
    status: string;
  }[];
  syncErrors: {
    sourceSystem: string;
    eventType: string;
    entityType: string;
    errorMessage: string | null;
    createdAt: string;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Contrato gerado',
  assinado: 'Assinado',
  pagamento_gerado: 'Pagamento gerado',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Emitida',
  ativa: 'Ativa',
  cancelada: 'Cancelada',
  pendente: 'Pendente',
  paga: 'Paga',
  estornada: 'Estornada',
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  partially_paid: 'Parcial',
  refunded: 'Estornado',
};

function toCurrency(value: NumericLike) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function toNumber(value: NumericLike) {
  return Number(value || 0);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDateIso(date: Date) {
  return `${formatDateKey(date)}-01`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function resolveAdminPeriod(monthParam?: string, startDateParam?: string, endDateParam?: string): AdminPeriod {
  const now = new Date();
  
  // 1. Período Customizado (De / Até)
  if (startDateParam && endDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam) && /^\d{4}-\d{2}-\d{2}$/.test(endDateParam)) {
    const startObj = new Date(`${startDateParam}T00:00:00`);
    const endObj = new Date(`${endDateParam}T23:59:59`);
    const durationMs = endObj.getTime() - startObj.getTime();
    const prevStartObj = new Date(startObj.getTime() - durationMs);

    return {
      monthKey: 'custom',
      label: `Período Customizado (${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(startObj)} - ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(endObj)})`,
      start: startDateParam,
      endExclusive: `${endDateParam}T23:59:59`,
      previousStart: formatDateIso(prevStartObj),
      previousEndExclusive: startDateParam,
    };
  }  // 1.5 Atalho: Todo o Histórico
  if (monthParam === 'all') {
    return {
      monthKey: 'all',
      label: 'Todo o Histórico',
      start: '2020-01-01',
      endExclusive: '2099-12-31',
      previousStart: '2010-01-01',
      previousEndExclusive: '2020-01-01',
    };
  }

  // 2. Atalho: Últimos 3 Meses
  if (monthParam === 'last-3-months') {
    const current = startOfMonth(now);
    const start3Months = addMonths(current, -2);
    const next = addMonths(current, 1);
    const prevStart3Months = addMonths(start3Months, -3);

    return {
      monthKey: 'last-3-months',
      label: 'Últimos 3 Meses',
      start: formatDateIso(start3Months),
      endExclusive: formatDateIso(next),
      previousStart: formatDateIso(prevStart3Months),
      previousEndExclusive: formatDateIso(start3Months),
    };
  }

  // 3. Atalho: Ano Atual
  if (monthParam === `year-${now.getFullYear()}`) {
    const startYear = `${now.getFullYear()}-01-01`;
    const nextYear = `${now.getFullYear() + 1}-01-01`;
    const prevYearStart = `${now.getFullYear() - 1}-01-01`;

    return {
      monthKey: `year-${now.getFullYear()}`,
      label: `Ano Atual (${now.getFullYear()})`,
      start: startYear,
      endExclusive: nextYear,
      previousStart: prevYearStart,
      previousEndExclusive: startYear,
    };
  }

  // 4. Mês Selecionado ou Mês Atual (Padrão)
  const isValidMonth = typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam);
  const baseDate = isValidMonth
    ? new Date(`${monthParam}-01T00:00:00`)
    : now;

  const current = startOfMonth(baseDate);
  const next = addMonths(current, 1);
  const previous = addMonths(current, -1);

  return {
    monthKey: formatDateKey(current),
    label: formatMonthLabel(current),
    start: formatDateIso(current),
    endExclusive: formatDateIso(next),
    previousStart: formatDateIso(previous),
    previousEndExclusive: formatDateIso(current),
  };
}

export function getRecentMonthOptions(count = 24): AdminMonthOption[] {
  const now = startOfMonth(new Date());
  const months: AdminMonthOption[] = Array.from({ length: count }, (_, index) => {
    const month = addMonths(now, -index);
    return {
      value: formatDateKey(month),
      label: formatMonthLabel(month),
    };
  });
  return [{ value: 'all', label: 'Todo o Histórico' }, ...months];
}

async function getSummary(start: string, endExclusive: string): Promise<DashboardSummary> {
  const [row] = await sql<{
    quotes_created: NumericLike;
    waiting_signature: NumericLike;
    waiting_payment: NumericLike;
    sales_issued: NumericLike;
    active_policies: NumericLike;
    total_premium: NumericLike;
    commission_pending: NumericLike;
    commission_paid: NumericLike;
    paid_amount: NumericLike;
  }[]>`
    WITH quote_summary AS (
      SELECT
        COUNT(*)::int AS quotes_created,
        COUNT(*) FILTER (WHERE status IN ('enviada', 'contrato_gerado', 'assinado'))::int AS waiting_signature,
        COUNT(*) FILTER (WHERE status = 'pagamento_gerado')::int AS waiting_payment
      FROM cotacoes
      WHERE created_at >= ${start}::date
        AND created_at < ${endExclusive}::date
    ),
    sales_summary AS (
      SELECT
        COUNT(*)::int AS sales_issued,
        COUNT(*) FILTER (WHERE status = 'ativa')::int AS active_policies,
        COALESCE(SUM(premio_total), 0) AS total_premium
      FROM sales
      WHERE created_at >= ${start}::date
        AND created_at < ${endExclusive}::date
    ),
    commission_summary AS (
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status IN ('pendente', 'aprovada')), 0) AS commission_pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paga'), 0) AS commission_paid
      FROM commissions
      WHERE created_at >= ${start}::date
        AND created_at < ${endExclusive}::date
    ),
    payment_summary AS (
      SELECT COALESCE(SUM(paid_amount), 0) AS paid_amount
      FROM payment_orders
      WHERE created_at >= ${start}::date
        AND created_at < ${endExclusive}::date
    )
    SELECT *
    FROM quote_summary, sales_summary, commission_summary, payment_summary
  `;

  return {
    quotesCreated: toNumber(row?.quotes_created),
    waitingSignature: toNumber(row?.waiting_signature),
    waitingPayment: toNumber(row?.waiting_payment),
    salesIssued: toNumber(row?.sales_issued),
    activePolicies: toNumber(row?.active_policies),
    totalPremium: toNumber(row?.total_premium),
    commissionPending: toNumber(row?.commission_pending),
    commissionPaid: toNumber(row?.commission_paid),
    paidAmount: toNumber(row?.paid_amount),
  };
}

function formatDelta(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 'Sem variação';
    return 'Nova tração no período';
  }

  const delta = ((current - previous) / previous) * 100;
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${delta.toFixed(0)}% vs. período anterior`;
}

function buildMetricCards(summary: DashboardSummary, previous: DashboardSummary): DashboardMetricCard[] {
  return [
    {
      title: 'Cotações geradas',
      value: String(summary.quotesCreated),
      hint: formatDelta(summary.quotesCreated, previous.quotesCreated),
      tone: 'primary',
    },
    {
      title: 'Aguardando assinatura',
      value: String(summary.waitingSignature),
      hint: `${summary.waitingPayment} aguardando cobrança`,
      tone: summary.waitingSignature > 0 ? 'warning' : 'neutral',
    },
    {
      title: 'Vendas emitidas',
      value: String(summary.salesIssued),
      hint: `${summary.activePolicies} apólices ativas`,
      tone: 'success',
    },
    {
      title: 'Prêmio emitido',
      value: toCurrency(summary.totalPremium),
      hint: formatDelta(summary.totalPremium, previous.totalPremium),
      tone: 'primary',
    },
    {
      title: 'Comissão pendente',
      value: toCurrency(summary.commissionPending),
      hint: `${toCurrency(summary.commissionPaid)} já paga`,
      tone: summary.commissionPending > 0 ? 'warning' : 'success',
    },
    {
      title: 'Recebimento confirmado',
      value: toCurrency(summary.paidAmount),
      hint: 'Baixas financeiras no período',
      tone: 'success',
    },
  ];
}

export async function getAdminDashboardData(
  monthParam?: string,
  startDateParam?: string,
  endDateParam?: string
): Promise<AdminDashboardData> {
  const period = resolveAdminPeriod(monthParam, startDateParam, endDateParam);
  const [summary, previousSummary, funnelRows, productRows, partnerRows, eventRows, syncRows] = await Promise.all([
    getSummary(period.start, period.endExclusive),
    getSummary(period.previousStart, period.previousEndExclusive),
    sql<{ status: string; count: NumericLike }[]>`
      SELECT status, COUNT(*)::int AS count
      FROM cotacoes
      WHERE created_at >= ${period.start}::date
        AND created_at < ${period.endExclusive}::date
      GROUP BY status
      ORDER BY COUNT(*) DESC, status ASC
    `,
    sql<{
      product_name: string;
      quotes_count: NumericLike;
      sales_count: NumericLike;
      premium_total: NumericLike;
      commission_total: NumericLike;
    }[]>`
      SELECT
        p.name AS product_name,
        COUNT(DISTINCT c.id)::int AS quotes_count,
        COUNT(DISTINCT s.id)::int AS sales_count,
        COALESCE(SUM(s.premio_total), 0) AS premium_total,
        COALESCE(SUM(s.commission_amount), 0) AS commission_total
      FROM products p
      LEFT JOIN cotacoes c
        ON c.product_id = p.id
       AND c.created_at >= ${period.start}::date
       AND c.created_at < ${period.endExclusive}::date
      LEFT JOIN sales s
        ON s.product_id = p.id
       AND s.created_at >= ${period.start}::date
       AND s.created_at < ${period.endExclusive}::date
      GROUP BY p.name
      ORDER BY premium_total DESC, quotes_count DESC, p.name ASC
    `,
    sql<{
      partner_id: string | null;
      partner_name: string;
      quotes_count: NumericLike;
      sales_count: NumericLike;
      premium_total: NumericLike;
      commission_pending: NumericLike;
    }[]>`
      SELECT
        p.id AS partner_id,
        COALESCE(p.nome_fantasia, p.razao_social, 'Operação direta') AS partner_name,
        COUNT(DISTINCT c.id)::int AS quotes_count,
        COUNT(DISTINCT s.id)::int AS sales_count,
        COALESCE(SUM(s.premio_total), 0) AS premium_total,
        COALESCE(SUM(cm.amount) FILTER (WHERE cm.status IN ('pendente', 'aprovada')), 0) AS commission_pending
      FROM partners p
      LEFT JOIN cotacoes c
        ON c.partner_id = p.id
       AND c.created_at >= ${period.start}::date
       AND c.created_at < ${period.endExclusive}::date
      LEFT JOIN sales s
        ON s.partner_id = p.id
       AND s.created_at >= ${period.start}::date
       AND s.created_at < ${period.endExclusive}::date
      LEFT JOIN commissions cm
        ON cm.partner_id = p.id
       AND cm.created_at >= ${period.start}::date
       AND cm.created_at < ${period.endExclusive}::date
      GROUP BY p.id, partner_name
      ORDER BY premium_total DESC, quotes_count DESC, partner_name ASC
      LIMIT 8
    `,
    sql<RecentAdminEvent[]>`
      SELECT *
      FROM (
        SELECT
          c.id,
          'cotacao'::text AS type,
          c.client_name AS title,
          COALESCE(p.name, 'RC Profissional') AS subtitle,
          c.status,
          c.created_at::text AS "createdAt",
          c.premio_final::numeric AS amount
        FROM cotacoes c
        LEFT JOIN products p ON p.id = c.product_id
        UNION ALL
        SELECT
          s.id,
          'venda'::text AS type,
          c.client_name AS title,
          COALESCE(s.policy_number, 'Apólice em emissão') AS subtitle,
          s.status,
          s.created_at::text AS "createdAt",
          s.premio_total::numeric AS amount
        FROM sales s
        JOIN cotacoes c ON c.id = s.cotacao_id
        UNION ALL
        SELECT
          cm.id,
          'comissao'::text AS type,
          COALESCE(p.nome_fantasia, p.razao_social, 'Parceiro') AS title,
          COALESCE(s.policy_number, 'Comissão sem apólice') AS subtitle,
          cm.status,
          cm.created_at::text AS "createdAt",
          cm.amount::numeric AS amount
        FROM commissions cm
        LEFT JOIN partners p ON p.id = cm.partner_id
        LEFT JOIN sales s ON s.id = cm.sale_id
      ) events
      WHERE "createdAt"::timestamptz >= ${period.start}::date
        AND "createdAt"::timestamptz < ${period.endExclusive}::date
      ORDER BY "createdAt"::timestamptz DESC
      LIMIT 12
    `,
    sql<{
      source_system: string;
      total: NumericLike;
      success_count: NumericLike;
      failed_count: NumericLike;
      last_event_at: string | null;
    }[]>`
      SELECT
        source_system,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('success', 'synced', 'ok'))::int AS success_count,
        COUNT(*) FILTER (WHERE status NOT IN ('success', 'synced', 'ok'))::int AS failed_count,
        MAX(created_at)::text AS last_event_at
      FROM sync_log
      WHERE created_at >= ${period.start}::date
        AND created_at < ${period.endExclusive}::date
      GROUP BY source_system
      ORDER BY last_event_at DESC NULLS LAST, source_system ASC
      LIMIT 6
    `,
  ]);

  return {
    period,
    summary,
    previousSummary,
    metricCards: buildMetricCards(summary, previousSummary),
    funnel: funnelRows.map((row) => ({
      status: row.status,
      label: STATUS_LABELS[row.status] || row.status,
      count: toNumber(row.count),
    })),
    productPerformance: productRows.map((row) => ({
      productName: row.product_name,
      quotesCount: toNumber(row.quotes_count),
      salesCount: toNumber(row.sales_count),
      premiumTotal: toNumber(row.premium_total),
      commissionTotal: toNumber(row.commission_total),
    })),
    partnerPerformance: partnerRows.map((row) => ({
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      quotesCount: toNumber(row.quotes_count),
      salesCount: toNumber(row.sales_count),
      premiumTotal: toNumber(row.premium_total),
      commissionPending: toNumber(row.commission_pending),
    })),
    recentEvents: eventRows.map((row) => ({
      ...row,
      amount: row.amount ? toNumber(row.amount) : null,
    })),
    syncHealth: syncRows.map((row) => ({
      sourceSystem: row.source_system,
      total: toNumber(row.total),
      successCount: toNumber(row.success_count),
      failedCount: toNumber(row.failed_count),
      lastEventAt: row.last_event_at,
    })),
  };
}

export async function getAdminReportData(
  monthParam?: string,
  startDateParam?: string,
  endDateParam?: string
): Promise<AdminReportData> {
  const period = resolveAdminPeriod(monthParam, startDateParam, endDateParam);
  const [quoteStatuses, paymentStatuses, partnerRows, overduePayments, syncErrors] = await Promise.all([
    sql<{
      status: string;
      count: NumericLike;
      premio_total: NumericLike;
    }[]>`
      SELECT
        status,
        COUNT(*)::int AS count,
        COALESCE(SUM(premio_final), 0) AS premio_total
      FROM cotacoes
      WHERE created_at >= ${period.start}::date
        AND created_at < ${period.endExclusive}::date
      GROUP BY status
      ORDER BY COUNT(*) DESC, status ASC
    `,
    sql<{
      status: string;
      orders_count: NumericLike;
      amount_total: NumericLike;
      paid_amount: NumericLike;
    }[]>`
      SELECT
        status,
        COUNT(*)::int AS orders_count,
        COALESCE(SUM(amount_total), 0) AS amount_total,
        COALESCE(SUM(paid_amount), 0) AS paid_amount
      FROM payment_orders
      WHERE created_at >= ${period.start}::date
        AND created_at < ${period.endExclusive}::date
      GROUP BY status
      ORDER BY amount_total DESC, status ASC
    `,
    sql<{
      partner_id: string | null;
      partner_name: string;
      quotes_count: NumericLike;
      sales_count: NumericLike;
      premium_total: NumericLike;
      paid_amount: NumericLike;
      pending_commission: NumericLike;
    }[]>`
      SELECT
        p.id AS partner_id,
        COALESCE(p.nome_fantasia, p.razao_social, 'Operação direta') AS partner_name,
        COUNT(DISTINCT c.id)::int AS quotes_count,
        COUNT(DISTINCT s.id)::int AS sales_count,
        COALESCE(SUM(s.premio_total), 0) AS premium_total,
        COALESCE(SUM(po.paid_amount), 0) AS paid_amount,
        COALESCE(SUM(cm.amount) FILTER (WHERE cm.status IN ('pendente', 'aprovada')), 0) AS pending_commission
      FROM partners p
      LEFT JOIN cotacoes c
        ON c.partner_id = p.id
       AND c.created_at >= ${period.start}::date
       AND c.created_at < ${period.endExclusive}::date
      LEFT JOIN sales s
        ON s.partner_id = p.id
       AND s.created_at >= ${period.start}::date
       AND s.created_at < ${period.endExclusive}::date
      LEFT JOIN payment_orders po
        ON po.partner_id = p.id
       AND po.created_at >= ${period.start}::date
       AND po.created_at < ${period.endExclusive}::date
      LEFT JOIN commissions cm
        ON cm.partner_id = p.id
       AND cm.created_at >= ${period.start}::date
       AND cm.created_at < ${period.endExclusive}::date
      GROUP BY p.id, partner_name
      ORDER BY premium_total DESC, quotes_count DESC, partner_name ASC
    `,
    sql<{
      client_name: string;
      partner_name: string;
      amount_total: NumericLike;
      due_date: string | null;
      status: string;
    }[]>`
      SELECT
        c.client_name,
        COALESCE(p.nome_fantasia, p.razao_social, 'Operação direta') AS partner_name,
        po.amount_total,
        po.due_date::text AS due_date,
        po.status
      FROM payment_orders po
      JOIN cotacoes c ON c.id = po.cotacao_id
      LEFT JOIN partners p ON p.id = po.partner_id
      WHERE po.status IN ('overdue', 'pending', 'partially_paid')
      ORDER BY po.due_date ASC NULLS LAST, po.created_at DESC
      LIMIT 10
    `,
    sql<{
      source_system: string;
      event_type: string;
      entity_type: string;
      error_message: string | null;
      created_at: string;
    }[]>`
      SELECT
        source_system,
        event_type,
        entity_type,
        error_message,
        created_at::text AS created_at
      FROM sync_log
      WHERE created_at >= ${period.start}::date
        AND created_at < ${period.endExclusive}::date
        AND status NOT IN ('success', 'synced', 'ok')
      ORDER BY created_at DESC
      LIMIT 12
    `,
  ]);

  return {
    period,
    quoteStatuses: quoteStatuses.map((row) => ({
      status: STATUS_LABELS[row.status] || row.status,
      count: toNumber(row.count),
      premioTotal: toNumber(row.premio_total),
    })),
    paymentStatuses: paymentStatuses.map((row) => ({
      status: STATUS_LABELS[row.status] || row.status,
      ordersCount: toNumber(row.orders_count),
      amountTotal: toNumber(row.amount_total),
      paidAmount: toNumber(row.paid_amount),
    })),
    partnerRows: partnerRows.map((row) => ({
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      quotesCount: toNumber(row.quotes_count),
      salesCount: toNumber(row.sales_count),
      premiumTotal: toNumber(row.premium_total),
      paidAmount: toNumber(row.paid_amount),
      pendingCommission: toNumber(row.pending_commission),
    })),
    overduePayments: overduePayments.map((row) => ({
      clientName: row.client_name,
      partnerName: row.partner_name,
      amountTotal: toNumber(row.amount_total),
      dueDate: row.due_date,
      status: STATUS_LABELS[row.status] || row.status,
    })),
    syncErrors: syncErrors.map((row) => ({
      sourceSystem: row.source_system,
      eventType: row.event_type,
      entityType: row.entity_type,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    })),
  };
}

export type RankingSource = 'duolife' | 'wix' | 'consolidated';

export interface AdminRankingRow {
  posicao: number;
  partnerId: string | null;
  partnerName: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  personType: 'pj' | 'pf';
  partnerCode: string;
  status: string;
  quotesCount: number;
  salesCount: number;
  pendingCount: number;
  conversionRate: number;
  premiumTotal: number;
  paidAmount: number;
  commissionTotal: number;
  ticketMedio: number;
  isLinkedToDuoLife: boolean;
  duolifeSalesCount?: number;
  duolifePremiumTotal?: number;
  wixSalesCount?: number;
  wixPremiumTotal?: number;
}

export interface AdminRankingData {
  period: AdminPeriod;
  source: RankingSource;
  podium: AdminRankingRow[];
  ranking: AdminRankingRow[];
  totals: {
    totalPartnersActive: number;
    totalPartnersProducing: number;
    totalQuotes: number;
    totalSales: number;
    totalPending: number;
    totalPremium: number;
    totalPaidAmount: number;
    totalCommission: number;
    averageTicket: number;
    overallConversionRate: number;
  };
}

function parseWixNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d.,-]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function extractWixRevenue(payload: Record<string, unknown> | null | undefined): number {
  if (!payload) return 0;
  const raw =
    payload.item && typeof payload.item === 'object' && (payload.item as { data?: unknown }).data
      ? (payload.item as { data: Record<string, unknown> }).data
      : payload;

  const val =
    raw.premio ??
    raw.receita ??
    raw._receita ??
    raw.valor ??
    raw.premioTotal ??
    raw.premio_total;

  return parseWixNumber(val);
}

function classifyWixStatus(statusRaw: unknown): 'fechado' | 'pendente' | 'cancelado' | 'outro' {
  if (!statusRaw) return 'outro';
  const s = String(statusRaw).toLowerCase().trim();
  if (
    s === '3' ||
    s.includes('paga de') ||
    s.includes('todas as parcelas pagas') ||
    s.includes('negócio fechado') ||
    s.includes('negocio fechado') ||
    s === 'ativa' ||
    s === 'ativo' ||
    s === 'pago' ||
    s === 'fechado'
  ) {
    return 'fechado';
  }
  if (
    s === '2' ||
    s.includes('pagamento gerado') ||
    s.includes('contrato assinado') ||
    s.includes('pendente de pagamento') ||
    s.includes('falta de pagamento') ||
    s.includes('em negociacao') ||
    s.includes('em negociação') ||
    s === 'pendente' ||
    s === 'aguardando'
  ) {
    return 'pendente';
  }
  if (s === '1' || s.includes('cancelado') || s === 'recusado') {
    return 'cancelado';
  }
  return 'outro';
}

export async function getAdminRankingData(
  monthParam?: string,
  startDateParam?: string,
  endDateParam?: string,
  sourceParam?: string
): Promise<AdminRankingData> {
  const period = resolveAdminPeriod(monthParam, startDateParam, endDateParam);
  const source: RankingSource =
    sourceParam === 'wix' || sourceParam === 'consolidated' ? sourceParam : 'duolife';

  // 1. Carrega todos os parceiros cadastrados no DuoLife
  const partnerRows = await sql<
    Array<{
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
      cnpj: string | null;
      cpf: string | null;
      person_type: 'pj' | 'pf';
      status: string;
      metadata: Record<string, unknown> | null;
    }>
  >`
    SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, status, metadata
    FROM partners
    WHERE status != 'suspended'
    ORDER BY razao_social ASC
  `;

  interface PartnerLookup {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    cpf: string | null;
    personType: 'pj' | 'pf';
    status: string;
    partnerCode: string;
  }

  const partners: PartnerLookup[] = partnerRows.map((p) => {
    const wl = (p.metadata?.whiteLabel as Record<string, unknown>) || {};
    const code = String(wl.wixCode || wl.slug || '').trim();
    return {
      id: p.id,
      razaoSocial: p.razao_social,
      nomeFantasia: p.nome_fantasia,
      cnpj: p.cnpj,
      cpf: p.cpf,
      personType: p.person_type || 'pj',
      status: p.status,
      partnerCode: code,
    };
  });

  const partnerByCodeMap = new Map<string, PartnerLookup>();
  for (const p of partners) {
    if (p.partnerCode) partnerByCodeMap.set(p.partnerCode.toLowerCase(), p);
    if (p.razaoSocial) partnerByCodeMap.set(p.razaoSocial.toLowerCase(), p);
    if (p.nomeFantasia) partnerByCodeMap.set(p.nomeFantasia.toLowerCase(), p);
    partnerByCodeMap.set(p.id.toLowerCase(), p);
  }

  // 2. Coleta métricas nativas do DuoLife (se source == 'duolife' ou 'consolidated')
  const duoMetricsByPartnerId = new Map<
    string,
    { quotes: number; sales: number; pending: number; premium: number; paid: number; commission: number }
  >();

  if (source === 'duolife' || source === 'consolidated') {
    const isAll = period.monthKey === 'all';
    const duoRows = await sql<
      Array<{
        partner_id: string;
        quotes_count: NumericLike;
        sales_count: NumericLike;
        pending_count: NumericLike;
        premium_total: NumericLike;
        paid_amount: NumericLike;
        commission_total: NumericLike;
      }>
    >`
      SELECT
        p.id AS partner_id,
        COUNT(DISTINCT c.id)::int AS quotes_count,
        COUNT(DISTINCT s.id)::int AS sales_count,
        COUNT(DISTINCT CASE WHEN c.status IN ('pendente', 'aguardando_pagamento', 'aguardando_assinatura') THEN c.id END)::int AS pending_count,
        COALESCE(SUM(s.premio_total), 0) AS premium_total,
        COALESCE(SUM(po.paid_amount), 0) AS paid_amount,
        COALESCE(SUM(cm.amount), 0) AS commission_total
      FROM partners p
      LEFT JOIN cotacoes c
        ON c.partner_id = p.id
       AND (${isAll} OR (c.created_at >= ${period.start}::date AND c.created_at < ${period.endExclusive}::date))
      LEFT JOIN sales s
        ON s.partner_id = p.id
       AND (${isAll} OR (s.created_at >= ${period.start}::date AND s.created_at < ${period.endExclusive}::date))
      LEFT JOIN payment_orders po
        ON po.partner_id = p.id
       AND (${isAll} OR (po.created_at >= ${period.start}::date AND po.created_at < ${period.endExclusive}::date))
      LEFT JOIN commissions cm
        ON cm.partner_id = p.id
       AND (${isAll} OR (cm.created_at >= ${period.start}::date AND cm.created_at < ${period.endExclusive}::date))
      WHERE p.status != 'suspended'
      GROUP BY p.id
    `;

    for (const r of duoRows) {
      duoMetricsByPartnerId.set(r.partner_id, {
        quotes: toNumber(r.quotes_count),
        sales: toNumber(r.sales_count),
        pending: toNumber(r.pending_count),
        premium: toNumber(r.premium_total),
        paid: toNumber(r.paid_amount),
        commission: toNumber(r.commission_total),
      });
    }
  }

  // 3. Coleta métricas históricas do Wix Import1 por codigoVenda (se source == 'wix' ou 'consolidated')
  interface WixGroupMetrics {
    code: string;
    quotes: number;
    sales: number;
    pending: number;
    premium: number;
  }
  const wixMetricsByCode = new Map<string, WixGroupMetrics>();

  if (source === 'wix' || source === 'consolidated') {
    // Tenta wix_items primeiro (espelho oficial de coleções)
    let wixRows = await sql<
      Array<{
        partner_code: string | null;
        status: string | null;
        payload: Record<string, unknown> | null;
        created_at: string | null;
      }>
    >`
      SELECT
        wi.partner_code,
        wi.status,
        wi.payload,
        COALESCE(wi.wix_created_at, wi.created_at)::text AS created_at
      FROM wix_items wi
      INNER JOIN wix_collections wc ON wc.id = wi.wix_collection_id
      WHERE wc.collection_id = 'Import1'
    `;

    // Se wix_items ainda não estiver populado neste ambiente, busca na tabela leads (origem wix)
    if (wixRows.length === 0) {
      wixRows = await sql<
        Array<{
          partner_code: string | null;
          status: string | null;
          payload: Record<string, unknown> | null;
          created_at: string | null;
        }>
      >`
        SELECT
          COALESCE(raw->'wix'->>'codigoVenda', raw->'wix'->>'codigoParceiro', partner_code) AS partner_code,
          COALESCE(status_cliente, status) AS status,
          raw->'wix' AS payload,
          data_cadastro::text AS created_at
        FROM leads
        WHERE source_system = 'wix'
      `;
    }

    const isAll = period.monthKey === 'all';
    const startDate = !isAll ? new Date(period.start) : null;
    const endDate = !isAll ? new Date(period.endExclusive) : null;

    for (const r of wixRows) {
      if (r.created_at && !isAll && startDate && endDate) {
        const itemDate = new Date(r.created_at);
        if (itemDate < startDate || itemDate >= endDate) {
          continue;
        }
      }

      const rawCode = (r.partner_code || '').trim();
      const code = rawCode ? rawCode : 'VENDA SITE';
      const key = code.toLowerCase();

      const rev = extractWixRevenue(r.payload);
      const classification = classifyWixStatus(r.status);

      const existing = wixMetricsByCode.get(key) || {
        code,
        quotes: 0,
        sales: 0,
        pending: 0,
        premium: 0,
      };

      existing.quotes += 1;
      if (classification === 'fechado') {
        existing.sales += 1;
        existing.premium += rev;
      } else if (classification === 'pendente') {
        existing.pending += 1;
      }

      wixMetricsByCode.set(key, existing);
    }
  }

  // 4. Monta a lista consolidada ou específica de acordo com a fonte
  const combinedMap = new Map<string, AdminRankingRow>();

  if (source === 'duolife') {
    for (const p of partners) {
      const dm = duoMetricsByPartnerId.get(p.id) || {
        quotes: 0,
        sales: 0,
        pending: 0,
        premium: 0,
        paid: 0,
        commission: 0,
      };
      const convRate = dm.quotes > 0 ? (dm.sales / dm.quotes) * 100 : 0;
      const ticket = dm.sales > 0 ? dm.premium / dm.sales : 0;

      combinedMap.set(p.id, {
        posicao: 0,
        partnerId: p.id,
        partnerName: p.nomeFantasia || p.razaoSocial,
        razaoSocial: p.razaoSocial,
        nomeFantasia: p.nomeFantasia,
        cnpj: p.cnpj,
        cpf: p.cpf,
        personType: p.personType,
        partnerCode: p.partnerCode,
        status: p.status,
        quotesCount: dm.quotes,
        salesCount: dm.sales,
        pendingCount: dm.pending,
        conversionRate: Math.round(convRate * 10) / 10,
        premiumTotal: dm.premium,
        paidAmount: dm.paid,
        commissionTotal: dm.commission,
        ticketMedio: Math.round(ticket * 100) / 100,
        isLinkedToDuoLife: true,
        duolifeSalesCount: dm.sales,
        duolifePremiumTotal: dm.premium,
      });
    }
  } else if (source === 'wix') {
    // Modo Wix: cada codigoVenda da base Import1 é um concorrente no ranking
    for (const [key, wm] of wixMetricsByCode.entries()) {
      const linked = partnerByCodeMap.get(key);
      const convRate = wm.quotes > 0 ? (wm.sales / wm.quotes) * 100 : 0;
      const ticket = wm.sales > 0 ? wm.premium / wm.sales : 0;

      const isSite = wm.code.toUpperCase() === 'VENDA SITE' || wm.code.toUpperCase() === 'SEM INFORMAÇÃO';

      combinedMap.set(key, {
        posicao: 0,
        partnerId: linked ? linked.id : null,
        partnerName: linked
          ? linked.nomeFantasia || linked.razaoSocial
          : isSite
          ? 'Venda Direta / Site'
          : `Corretor: ${wm.code}`,
        razaoSocial: linked
          ? linked.razaoSocial
          : isSite
          ? 'Operação Direta DuoLife (Sem Corretor Parceiro)'
          : `Corretor Wix (${wm.code})`,
        nomeFantasia: linked ? linked.nomeFantasia : null,
        cnpj: linked ? linked.cnpj : null,
        cpf: linked ? linked.cpf : null,
        personType: linked ? linked.personType : 'pj',
        partnerCode: linked?.partnerCode || wm.code,
        status: linked ? linked.status : 'wix_only',
        quotesCount: wm.quotes,
        salesCount: wm.sales,
        pendingCount: wm.pending,
        conversionRate: Math.round(convRate * 10) / 10,
        premiumTotal: Math.round(wm.premium * 100) / 100,
        paidAmount: Math.round(wm.premium * 100) / 100,
        commissionTotal: 0,
        ticketMedio: Math.round(ticket * 100) / 100,
        isLinkedToDuoLife: !!linked,
        wixSalesCount: wm.sales,
        wixPremiumTotal: wm.premium,
      });
    }
  } else {
    // Modo Consolidated: soma DuoLife + Wix para cada parceiro vinculado e lista avulsos do Wix
    const processedWixKeys = new Set<string>();

    for (const p of partners) {
      const dm = duoMetricsByPartnerId.get(p.id) || {
        quotes: 0,
        sales: 0,
        pending: 0,
        premium: 0,
        paid: 0,
        commission: 0,
      };

      // Procura dados do Wix correspondentes ao slug/código ou nome
      const codeKey = p.partnerCode ? p.partnerCode.toLowerCase() : null;
      let wm: WixGroupMetrics | undefined;
      if (codeKey && wixMetricsByCode.has(codeKey)) {
        wm = wixMetricsByCode.get(codeKey);
        processedWixKeys.add(codeKey);
      } else if (wixMetricsByCode.has(p.razaoSocial.toLowerCase())) {
        wm = wixMetricsByCode.get(p.razaoSocial.toLowerCase());
        processedWixKeys.add(p.razaoSocial.toLowerCase());
      } else if (p.nomeFantasia && wixMetricsByCode.has(p.nomeFantasia.toLowerCase())) {
        wm = wixMetricsByCode.get(p.nomeFantasia.toLowerCase());
        processedWixKeys.add(p.nomeFantasia.toLowerCase());
      }

      const totalQuotes = dm.quotes + (wm?.quotes || 0);
      const totalSales = dm.sales + (wm?.sales || 0);
      const totalPending = dm.pending + (wm?.pending || 0);
      const totalPremium = dm.premium + (wm?.premium || 0);
      const totalPaid = dm.paid + (wm?.premium || 0);
      const convRate = totalQuotes > 0 ? (totalSales / totalQuotes) * 100 : 0;
      const ticket = totalSales > 0 ? totalPremium / totalSales : 0;

      combinedMap.set(p.id, {
        posicao: 0,
        partnerId: p.id,
        partnerName: p.nomeFantasia || p.razaoSocial,
        razaoSocial: p.razaoSocial,
        nomeFantasia: p.nomeFantasia,
        cnpj: p.cnpj,
        cpf: p.cpf,
        personType: p.personType,
        partnerCode: p.partnerCode,
        status: p.status,
        quotesCount: totalQuotes,
        salesCount: totalSales,
        pendingCount: totalPending,
        conversionRate: Math.round(convRate * 10) / 10,
        premiumTotal: Math.round(totalPremium * 100) / 100,
        paidAmount: Math.round(totalPaid * 100) / 100,
        commissionTotal: dm.commission,
        ticketMedio: Math.round(ticket * 100) / 100,
        isLinkedToDuoLife: true,
        duolifeSalesCount: dm.sales,
        duolifePremiumTotal: dm.premium,
        wixSalesCount: wm?.sales || 0,
        wixPremiumTotal: wm?.premium || 0,
      });
    }

    // Inclui registros Wix que não foram vinculados a parceiros DuoLife
    for (const [key, wm] of wixMetricsByCode.entries()) {
      if (processedWixKeys.has(key)) continue;

      const isSite = wm.code.toUpperCase() === 'VENDA SITE' || wm.code.toUpperCase() === 'SEM INFORMAÇÃO';
      const convRate = wm.quotes > 0 ? (wm.sales / wm.quotes) * 100 : 0;
      const ticket = wm.sales > 0 ? wm.premium / wm.sales : 0;

      combinedMap.set(key, {
        posicao: 0,
        partnerId: null,
        partnerName: isSite ? 'Venda Direta / Site' : `Corretor: ${wm.code}`,
        razaoSocial: isSite
          ? 'Operação Direta DuoLife (Sem Corretor Parceiro)'
          : `Corretor Wix (${wm.code})`,
        nomeFantasia: null,
        cnpj: null,
        cpf: null,
        personType: 'pj',
        partnerCode: wm.code,
        status: 'wix_only',
        quotesCount: wm.quotes,
        salesCount: wm.sales,
        pendingCount: wm.pending,
        conversionRate: Math.round(convRate * 10) / 10,
        premiumTotal: Math.round(wm.premium * 100) / 100,
        paidAmount: Math.round(wm.premium * 100) / 100,
        commissionTotal: 0,
        ticketMedio: Math.round(ticket * 100) / 100,
        isLinkedToDuoLife: false,
        wixSalesCount: wm.sales,
        wixPremiumTotal: wm.premium,
      });
    }
  }

  // 5. Ordena por Volume em Prêmios DESC, Vendas DESC, Cotações DESC
  const sorted = Array.from(combinedMap.values()).sort((a, b) => {
    if (b.premiumTotal !== a.premiumTotal) return b.premiumTotal - a.premiumTotal;
    if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
    return b.quotesCount - a.quotesCount;
  });

  let totalQuotes = 0;
  let totalSales = 0;
  let totalPending = 0;
  let totalPremium = 0;
  let totalPaidAmount = 0;
  let totalCommission = 0;
  let producingPartners = 0;

  const ranking: AdminRankingRow[] = sorted.map((row, idx) => {
    totalQuotes += row.quotesCount;
    totalSales += row.salesCount;
    totalPending += row.pendingCount;
    totalPremium += row.premiumTotal;
    totalPaidAmount += row.paidAmount;
    totalCommission += row.commissionTotal;
    if (row.salesCount > 0 || row.premiumTotal > 0) producingPartners++;

    return {
      ...row,
      posicao: idx + 1,
    };
  });

  const podium = ranking.slice(0, 3);
  const averageTicket = totalSales > 0 ? totalPremium / totalSales : 0;
  const overallConversionRate = totalQuotes > 0 ? (totalSales / totalQuotes) * 100 : 0;

  return {
    period,
    source,
    podium,
    ranking,
    totals: {
      totalPartnersActive: ranking.length,
      totalPartnersProducing: producingPartners,
      totalQuotes,
      totalSales,
      totalPending,
      totalPremium: Math.round(totalPremium * 100) / 100,
      totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      averageTicket: Math.round(averageTicket * 100) / 100,
      overallConversionRate: Math.round(overallConversionRate * 10) / 10,
    },
  };
}

