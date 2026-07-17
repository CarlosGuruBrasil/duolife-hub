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

export function resolveAdminPeriod(monthParam?: string): AdminPeriod {
  const isValidMonth = typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam);
  const baseDate = isValidMonth
    ? new Date(`${monthParam}-01T00:00:00`)
    : new Date();
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

export function getRecentMonthOptions(count = 6): AdminMonthOption[] {
  const now = startOfMonth(new Date());
  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(now, -index);
    return {
      value: formatDateKey(month),
      label: formatMonthLabel(month),
    };
  });
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

export async function getAdminDashboardData(monthParam?: string): Promise<AdminDashboardData> {
  const period = resolveAdminPeriod(monthParam);
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

export async function getAdminReportData(monthParam?: string): Promise<AdminReportData> {
  const period = resolveAdminPeriod(monthParam);
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
