import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ExternalLink, FileText, Search, Play } from 'lucide-react';
import { verifyAuth, isInternalUser, isDevUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { RecusarCotacaoButton } from './_recusar-button';
import { ExcluirCotacaoButton } from '@/components/dev';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { formatCurrency, formatDateTime, formatStatusLabel } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';

import { CotacoesFilterSection } from './_components/CotacoesFilterSection';
import { CotacoesPagination } from './_components/CotacoesPagination';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import TransferirParceiroCotacaoButton from '@/components/modals/TransferirParceiroCotacaoButton';
import { ContratoActionButton } from '@/components/cotacoes/ContratoActionButton';
import { SincronizarAsaasButton } from '@/components/cotacoes/SincronizarAsaasButton';

import { MatrixStatusBadge } from '@/components/common/MatrixStatusBadge';
import { calculateMatrixStatus, getCotacaoMatrixFilterSql } from '@/lib/status-matrix';
import { getCotacaoAssinaturaInfo } from '@/lib/assinatura-status';

export const dynamic = 'force-dynamic';

interface AdminCotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  client_email: string | null;
  client_phone: string | null;
  importancia_segurada: string | null;
  premio_calculado: string | null;
  premio_final: string | null;
  status: string;
  created_at: string;
  client_data: unknown;
  product_id: string;
  product_name: string;
  partner_id: string;
  partner_name: string;
  partner_status?: string | null;
  partner_user_name?: string | null;
  sale_id?: string | null;
  sale_status?: string | null;
  sale_expiry_date?: string | null;
  days_overdue?: number | null;
  is_fully_paid?: boolean | null;
  payment_order_status?: string | null;
}

const statusLabel: Record<string, string> = {
  // Status do Cliente (Matriz Principal)
  vigente: 'Vigente / Renovado',
  'vigente / renovado': 'Vigente / Renovado',
  negociacao: 'Em negociação',
  'em negociacao': 'Em negociação',
  'em negociação': 'Em negociação',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  cadastrado: 'Cadastrado',
  // Etapas de Cotação
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando Assinatura',
  assinado: 'Contrato Assinado',
  pagamento_gerado: 'Fatura Gerada (Asaas)',
  aprovada: 'Aprovada (Venda)',
  emitida: 'Apólice Emitida',
  recusada: 'Recusada',
  expirada: 'Expirada'
};

const statusAliases: Record<string, string[]> = {
  assinado: ['assinado', 'signed'],
  signed: ['assinado', 'signed'],
  rascunho: ['rascunho', 'draft'],
  draft: ['rascunho', 'draft'],
  aprovada: ['aprovada', 'approved'],
  approved: ['aprovada', 'approved'],
  recusada: ['recusada', 'rejected', 'refused'],
  rejected: ['recusada', 'rejected', 'refused'],
  expirada: ['expirada', 'expired'],
  expired: ['expirada', 'expired'],
};

const statusColor: Record<string, string> = {
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  aprovada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
  emitida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assinado: 'bg-purple-50 text-purple-700 border-purple-200',
  signed: 'bg-purple-50 text-purple-700 border-purple-200',
  pagamento_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-800 border-amber-200'
};

function parseClientData(data: unknown) {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }
  return {};
}

function getDisplayPrice(cotacao: AdminCotacaoRow) {
  if (cotacao.premio_final !== null) return formatCurrency(cotacao.premio_final);
  if (cotacao.premio_calculado !== null) return formatCurrency(cotacao.premio_calculado);
  const parsed = parseClientData(cotacao.client_data);
  if (parsed.valor) return formatCurrency(parsed.valor as number | string);
  if (parsed.valorParcela) return formatCurrency(parsed.valorParcela as number | string);
  return 'Sob Consulta';
}

export default async function AdminCotacoesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyAuth();
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  const isDev = isDevUser(user);

  const params = searchParams ? await searchParams : {};
  const rawStatus = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
  const statusGeral = typeof params.statusGeral === 'string' ? params.statusGeral.trim() : '';
  const statusPagamento = typeof params.statusPagamento === 'string' ? params.statusPagamento.trim() : '';
  const statusAssinatura = typeof params.statusAssinatura === 'string' ? params.statusAssinatura.trim() : '';
  const statusVariants = statusAliases[rawStatus] || (statusLabel[rawStatus] ? [rawStatus] : null);
  const status = statusLabel[rawStatus] ? rawStatus : (statusVariants ? statusVariants[0] : '');
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const productId = typeof params.productId === 'string' ? params.productId : '';
  const corretoraId = typeof params.corretoraId === 'string' ? params.corretoraId : '';
  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : '';
  const isRenewal = typeof params.isRenewal === 'string' ? params.isRenewal : '';
  const periodPreset = typeof params.periodPreset === 'string' ? (params.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
  const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
  const pageSize = [10, 25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const conditions = [];
  if (['vigente', 'vigente / renovado'].includes(rawStatus)) {
    conditions.push(sql`(
      EXISTS (
        SELECT 1 FROM sales s_f
        WHERE s_f.cotacao_id = c.id
          AND s_f.status = 'ativa'
          AND s_f.expiry_date >= CURRENT_DATE
      )
      OR c.status IN ('aprovada', 'emitida')
    )`);
  } else if (['negociacao', 'em negociacao', 'em negociação'].includes(rawStatus)) {
    conditions.push(sql`(
      NOT EXISTS (SELECT 1 FROM sales s_f WHERE s_f.cotacao_id = c.id)
      AND c.status IN ('rascunho', 'enviada', 'contrato_gerado', 'assinado', 'pagamento_gerado')
    )`);
  } else if (rawStatus === 'cancelado') {
    conditions.push(sql`(
      c.status IN ('recusada', 'cancelada')
      OR EXISTS (SELECT 1 FROM sales s_f WHERE s_f.cotacao_id = c.id AND s_f.status = 'cancelada')
    )`);
  } else if (rawStatus === 'expirado') {
    conditions.push(sql`(
      c.status = 'expirada'
      OR EXISTS (
        SELECT 1 FROM sales s_f
        WHERE s_f.cotacao_id = c.id
          AND (s_f.status = 'expirada' OR s_f.expiry_date < CURRENT_DATE)
      )
    )`);
  } else if (statusVariants && statusVariants.length > 0) {
    conditions.push(sql`c.status = ANY(${statusVariants})`);
  }

  // Filtros da Matriz de Status (Status Geral e Status de Pagamento)
  if (statusGeral || statusPagamento) {
    const matrixClauses = getCotacaoMatrixFilterSql(statusGeral, statusPagamento, 'c', 's');
    for (const clause of matrixClauses) {
      conditions.push(sql.unsafe(clause));
    }
  }

  // Filtro de Status de Assinatura
  if (statusAssinatura === 'falta_1') {
    conditions.push(sql`(c.client_data->>'statusAssinatura' IN ('falta_corretora', 'falta_cliente'))`);
  } else if (statusAssinatura === 'falta_corretora') {
    conditions.push(sql`(c.client_data->>'statusAssinatura' = 'falta_corretora')`);
  } else if (statusAssinatura === 'falta_cliente') {
    conditions.push(sql`(c.client_data->>'statusAssinatura' = 'falta_cliente')`);
  } else if (statusAssinatura === 'faltam_ambas') {
    conditions.push(sql`(c.client_data->>'statusAssinatura' = 'faltam_ambas' OR (c.status = 'contrato_gerado' AND (c.client_data->>'statusAssinatura' IS NULL OR c.client_data->>'statusAssinatura' = '')))`);
  } else if (statusAssinatura === 'ambas_assinadas') {
    conditions.push(sql`(
      c.client_data->>'statusAssinatura' = 'todas_assinadas'
      OR (
        c.status IN ('aprovada', 'emitida')
        AND (c.client_data->>'statusAssinatura' IS NULL OR c.client_data->>'statusAssinatura' NOT IN ('falta_corretora', 'falta_cliente', 'faltam_ambas'))
      )
    )`);
  }

  if (productId) conditions.push(sql`c.product_id = ${productId}`);
  if (corretoraId) {
    conditions.push(sql`(c.corretora_id = ${corretoraId} OR part.corretora_id = ${corretoraId})`);
  }
  if (partnerId) conditions.push(sql`c.partner_id = ${partnerId}`);
  if (isRenewal === 'true' || isRenewal === 'sim') {
    conditions.push(sql`(c.is_renewal = true OR c.client_data->>'isRenovacao' = 'Sim' OR (c.client_data->>'renovacao')::text = 'true')`);
  } else if (isRenewal === 'false' || isRenewal === 'nao') {
    conditions.push(sql`(c.is_renewal = false AND (c.client_data->>'isRenovacao' IS NULL OR c.client_data->>'isRenovacao' != 'Sim') AND ((c.client_data->>'renovacao')::text IS NULL OR (c.client_data->>'renovacao')::text != 'true'))`);
  }

  const { start, end } = resolveDateRange(periodPreset, startDate, endDate);
  if (start) conditions.push(sql`c.created_at >= ${start}::timestamptz`);
  if (end) conditions.push(sql`c.created_at <= ${end}::timestamptz`);

  if (q) {
    const textLike = `%${q.replace(/([\\%_])/g, '\\$1')}%`;
    const digitsOnly = q.replace(/\D/g, '');
    if (digitsOnly.length >= 3) {
      const digitsLike = `%${digitsOnly.replace(/([\\%_])/g, '\\$1')}%`;
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR regexp_replace(c.client_cpf_cnpj, '\\D', '', 'g') ILIKE ${digitsLike}
        OR c.client_email ILIKE ${textLike}
        OR c.client_phone ILIKE ${textLike}
        OR regexp_replace(COALESCE(c.client_phone, ''), '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR c.client_email ILIKE ${textLike}
        OR c.client_phone ILIKE ${textLike}
      )`);
    }
  }

  const where = conditions.length
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  const [countResult, productsList, corretorasList, partnersList] = await Promise.all([
    sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM cotacoes c
      JOIN products p ON p.id = c.product_id
      JOIN partners part ON part.id = c.partner_id
      WHERE ${where}
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, name FROM products WHERE is_active = true ORDER BY name ASC
    `,
    sql<{ id: string; name: string; cnpj: string | null }[]>`
      SELECT id, COALESCE(nome_fantasia, razao_social) AS name, cnpj FROM corretoras ORDER BY name ASC
    `,
    sql<{ id: string; name: string; corretoraId: string | null }[]>`
      SELECT id, COALESCE(nome_fantasia, razao_social) AS name, corretora_id AS "corretoraId" FROM partners ORDER BY name ASC
    `,
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const cotacoes = await sql<AdminCotacaoRow[]>`
    SELECT
      c.id,
      c.client_name,
      c.client_cpf_cnpj,
      c.client_email,
      c.client_phone,
      c.importancia_segurada,
      c.premio_final,
      c.premio_calculado,
      c.status,
      c.created_at,
      c.client_data,
      c.partner_id,
      p.name AS product_name,
      COALESCE(part.nome_fantasia, part.razao_social) AS partner_name,
      part.status AS partner_status,
      pu.name AS partner_user_name,
      s.id AS sale_id,
      s.status AS sale_status,
      s.expiry_date::text AS sale_expiry_date,
      COALESCE(
        (
          SELECT CASE
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
          WHERE pi.cotacao_id = c.id
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
            WHEN LOWER(COALESCE(po.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash') THEN 0
            WHEN LOWER(COALESCE(po.status, '')) = 'partially_paid' THEN 0
            WHEN LOWER(COALESCE(po.status, '')) IN ('pending', 'overdue') AND po.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - po.due_date)::int)
            WHEN s.status = 'ativa' THEN 0
            ELSE 0
          END
          FROM payment_orders po
          WHERE po.cotacao_id = c.id
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
          WHERE pi.cotacao_id = c.id
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
          WHERE po.cotacao_id = c.id
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
        WHERE po.cotacao_id = c.id
        ORDER BY po.created_at DESC
        LIMIT 1
      ) AS payment_order_status
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    LEFT JOIN partner_users pu ON pu.id = c.partner_user_id
    LEFT JOIN sales s ON s.cotacao_id = c.id
    WHERE ${where}
    ORDER BY c.created_at DESC
    LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}
  `;

  const hasFilters = Boolean(
    status ||
    statusGeral ||
    statusPagamento ||
    statusAssinatura ||
    q ||
    productId ||
    corretoraId ||
    partnerId ||
    isRenewal ||
    (periodPreset && periodPreset !== 'all')
  );

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">COTAÇÕES & PROPOSTAS</span>
          <h1 className="admin-page-title">Cotações Gerais</h1>
          <p className="admin-page-copy">Gerencie cotações, faturas do Asaas, assinaturas do ZapSign e vendas finalizadas.</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <SincronizarAsaasButton />
          <Link
            href="/admin/cotacoes/nova"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0 min-h-[44px]"
          >
            <Plus size={16} strokeWidth={2.5} /> Nova Cotação
          </Link>
        </div>
      </section>

      {/* Seção de Filtros Reativos */}
      <CotacoesFilterSection
        products={productsList}
        corretoras={corretorasList}
        partners={partnersList}
        statusLabels={statusLabel}
        pageSize={pageSize}
      />

      {/* Main Content Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {cotacoes.length === 0 ? (
          <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              {hasFilters ? 'Nenhuma cotação encontrada' : 'Nenhuma cotação cadastrada'}
            </h2>
            <p className="text-slate-500 mx-auto mt-2 max-w-md text-sm">
              {hasFilters
                ? 'Ajuste a busca ou limpe os filtros para ver todas as cotações.'
                : 'Crie a primeira cotação ou aguarde os parceiros gerarem propostas.'}
            </p>
            {hasFilters && (
              <Link
                href="/admin/cotacoes"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#072a33] transition-colors shadow-xs"
              >
                Limpar todos os filtros
              </Link>
            )}
          </div>
        ) : (
          <TableScrollContainer minWidth="1100px">
            <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap border-separate border-spacing-0">
              <thead className="table-sticky-head bg-slate-50/95 backdrop-blur-sm text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 table-sticky-col-head rounded-tl-2xl">Cliente / CPF</th>
                  <th className="px-6 py-4 border-b border-slate-200">Plano / Cobertura</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center">Situação / Status</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Valor Total</th>
                  <th className="px-6 py-4 border-b border-slate-200">Parceiro / Vendedor</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center">Fatura & Contrato</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Data</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center rounded-tr-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cotacoes.map((cotacao) => {
                  const clientData = parseClientData(cotacao.client_data);
                  const planoNome = String(clientData.nomePlano || clientData.tipoDePlano || cotacao.product_name || 'RC Advogados');
                  const cobertura = String(clientData.valorCobertura || (cotacao.importancia_segurada ? formatCurrency(cotacao.importancia_segurada) : ''));
                  const linkBoleto = safeExternalUrl(clientData.linkBoleto as string | undefined);
                  const rawSignedPdf =
                    (clientData.contratoPdf as string | undefined) ||
                    (clientData.signedFileUrl as string | undefined) ||
                    (clientData.linkContrato as string | undefined);
                  const signedPdfUrl = (rawSignedPdf && !rawSignedPdf.includes('/verificar/'))
                    ? safeExternalUrl(rawSignedPdf)
                    : null;
                  const rawSignUrl = clientData.signUrl as string | undefined;
                  const signUrl = rawSignUrl ? safeExternalUrl(rawSignUrl) : null;
                  const contratoUrl = signedPdfUrl || signUrl;
                  const isContratoAssinado = [
                    'assinado',
                    'signed',
                    'pagamento_gerado',
                    'aprovada',
                    'emitida',
                    'ativa',
                    'active',
                  ].includes(String(cotacao.status || '').toLowerCase()) || Boolean(clientData.contratoPdf || clientData.signedFileUrl || clientData.assinadoEm);
                  const oab = String(clientData.oab || '');

                  const matrixStatus = calculateMatrixStatus({
                    hasCotacao: true,
                    cotacaoStatus: cotacao.status,
                    hasSale: Boolean(cotacao.sale_id),
                    saleStatus: cotacao.sale_status,
                    expiryDate: cotacao.sale_expiry_date,
                    daysOverdue: cotacao.days_overdue,
                    isContractSigned: isContratoAssinado,
                    isFullyPaid: cotacao.is_fully_paid,
                    paymentStatus: cotacao.payment_order_status || (cotacao.is_fully_paid ? 'paid' : undefined),
                  });

                  const assinaturaInfo = getCotacaoAssinaturaInfo(cotacao.status, clientData, cotacao);

                  return (
                    <tr key={cotacao.id} className="hover:bg-slate-50/60 transition-colors duration-150 group">
                      <td className="px-6 py-4 table-sticky-col-cell">
                        <Link href={`/admin/cotacoes/${cotacao.id}`} className="font-semibold text-slate-900 hover:text-emerald-600 hover:underline block">
                          {cotacao.client_name}
                        </Link>
                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                          {cotacao.client_cpf_cnpj} {oab ? `· OAB ${oab}` : ''}
                        </div>
                      </td>

                      <td className="px-6 py-4 border-b border-slate-100">
                        <span className="text-sm font-semibold text-slate-900 block">{planoNome}</span>
                        {cobertura && <span className="text-xs text-slate-500 font-normal block">{cobertura}</span>}
                      </td>

                      <td className="px-6 py-4 text-center border-b border-slate-100">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <MatrixStatusBadge result={matrixStatus} variant="table-cell" />
                          {assinaturaInfo && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${assinaturaInfo.badgeClass}`}
                              title={`Status de Assinatura: ${assinaturaInfo.label}`}
                            >
                              <span>✍️</span>
                              <span>{assinaturaInfo.label}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-900 block">{getDisplayPrice(cotacao)}</span>
                        {clientData.parcela && Number(clientData.parcela) > 1 && (
                          <span className="text-[11px] text-slate-500 font-normal block">{clientData.parcela}x parcelado</span>
                        )}
                      </td>

                      <td className="px-6 py-4 border-b border-slate-100">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase shrink-0">
                              {(cotacao.partner_name || 'DL').substring(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <span className="block truncate">{cotacao.partner_name || 'DuoLife'}</span>
                              {cotacao.partner_user_name && (
                                <span className="text-[10px] text-slate-400 font-normal block truncate">{cotacao.partner_user_name}</span>
                              )}
                            </div>
                          </span>
                          <TransferirParceiroCotacaoButton
                            cotacaoId={cotacao.id}
                            cotacaoTitle={`Cotação #${cotacao.id.slice(0, 8)} · ${cotacao.client_name}`}
                            currentPartner={{
                              id: cotacao.partner_id,
                              name: cotacao.partner_name,
                              userName: cotacao.partner_user_name,
                              isActive: cotacao.partner_status === 'active',
                            }}
                            variant="icon"
                            size="sm"
                          />
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center border-b border-slate-100">
                        <div className="flex items-center justify-center gap-2">
                          {linkBoleto ? (
                            <a
                              href={linkBoleto}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-lg transition-colors"
                              title="Abrir Boleto / Pix do Asaas"
                            >
                              📄 Fatura Asaas <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">—</span>
                          )}

                          {(isContratoAssinado || contratoUrl || clientData.signUrlCorretora || clientData.contratoToken) && (
                            <ContratoActionButton
                              cotacaoId={cotacao.id}
                              cotacao={cotacao}
                              status={cotacao.status}
                              clientName={cotacao.client_name}
                              clientCpfCnpj={cotacao.client_cpf_cnpj}
                              clientEmail={cotacao.client_email}
                              productName={cotacao.product_name}
                              signUrl={signUrl}
                              signUrlCorretora={clientData.signUrlCorretora as string | undefined}
                              contratoPdfUrl={signedPdfUrl || (clientData.contratoPdf as string | undefined)}
                              isContratoAssinado={isContratoAssinado}
                              statusAssinatura={clientData.statusAssinatura as string | undefined}
                              totalAssinaturas={
                                typeof clientData.totalAssinaturas === 'number'
                                  ? clientData.totalAssinaturas
                                  : undefined
                              }
                              variant="table"
                            />
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-500 text-xs text-right font-medium border-b border-slate-100">
                        {formatDateTime(cotacao.created_at)}
                      </td>

                      <td className="px-6 py-4 text-center border-b border-slate-100">
                        <div className="flex items-center justify-center gap-2">
                          {cotacao.status === 'rascunho' && (
                            <Link
                              href={`/admin/cotacoes/nova?cotacaoId=${cotacao.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#072a33] bg-[#00d4e0] hover:bg-[#00b8c4] px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                              title="Continuar preenchimento desta cotação rascunho"
                            >
                              <Play size={11} className="fill-current" /> Continuar
                            </Link>
                          )}
                          <Link
                            href={`/admin/cotacoes/${cotacao.id}`}
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Detalhes
                          </Link>
                          {!ESTADOS_TERMINAIS.includes(cotacao.status) && (
                            <RecusarCotacaoButton id={cotacao.id} clientName={cotacao.client_name} />
                          )}
                          {isDev && (
                            <ExcluirCotacaoButton
                              cotacaoId={cotacao.id}
                              clientName={cotacao.client_name}
                              variant="icon"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollContainer>
        )}

        <CotacoesPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={total}
          pageSize={pageSize}
        />
      </div>
    </div>
  );
}
