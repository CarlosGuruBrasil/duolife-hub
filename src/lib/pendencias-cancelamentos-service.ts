import { sql } from '@/lib/pg';
import type { PartnerAccessContext } from '@/lib/auth';
import {
  calculateCancellationDeadline,
  isInstallmentPastCancellationDeadline,
  getTodayISODate,
} from '@/lib/business-days';
import type {
  PendenciaTab,
  TipoRegistro,
  SituacaoContrato,
  ParcelaDetalhe,
  PendenciaCancelamentoItem,
  PendenciasKPIs,
  PendenciasFiltros,
  PendenciasPaginadasResult,
} from '@/types/pendencias-cancelamentos';

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

/**
 * Enriquece um item de pendência/cancelamento com as regras de negócio da BR-031
 * e tolerâncias de prazos por parcela.
 */
export function enrichItemWithBR031Rules(
  item: PendenciaCancelamentoItem,
  referenceDate?: string | Date
): PendenciaCancelamentoItem {
  const isCancelled = item.situacaoContrato === 'cancelada';

  const enrichedParcelas: ParcelaDetalhe[] = (item.parcelas || []).map((p: any) => {
    const installmentNumber = Number(p.installmentNumber ?? p.installment_number ?? 1);
    const dueDate = String(p.dueDate ?? p.due_date ?? '');
    const paidAt = p.paidAt ?? p.paid_at ?? null;
    const status = String(p.status ?? 'pending');
    const amount = Number(p.amount ?? 0);
    const daysOverdue = Number(p.daysOverdue ?? p.days_overdue ?? 0);

    const deadlineResult = calculateCancellationDeadline(dueDate, installmentNumber);
    const pastDeadline = isInstallmentPastCancellationDeadline(
      dueDate,
      installmentNumber,
      referenceDate
    );

    const isPaid = Boolean(
      paidAt ||
      ['paid', 'received', 'confirmed', 'received_in_cash', 'pago', 'recebido', 'confirmado'].includes(
        status.toLowerCase()
      )
    );

    return {
      id: String(p.id ?? ''),
      installmentNumber,
      amount,
      dueDate,
      paidAt,
      status,
      daysOverdue: isPaid ? 0 : daysOverdue,
      cancellationDeadline: deadlineResult.deadlineDate,
      isPastDeadline: isPaid ? false : pastDeadline,
      externalPaymentId: p.externalPaymentId ?? p.external_payment_id ?? null,
      bankSlipUrl: p.bankSlipUrl ?? p.bank_slip_url ?? null,
      pixQrCodeUrl: p.pixQrCodeUrl ?? p.pix_qr_code_url ?? null,
      invoiceUrl: p.invoiceUrl ?? p.invoice_url ?? null,
    };
  });

  item.parcelas = enrichedParcelas;

  if (isCancelled) {
    item.situacaoContrato = 'cancelada';
  } else {
    // Parcela vencida em atraso: não quitada com dias de atraso > 0
    const overdueUnpaid = enrichedParcelas.filter(
      (p) =>
        !Boolean(
          p.paidAt ||
          ['paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled'].includes(
            p.status?.toLowerCase() || ''
          )
        ) && p.daysOverdue > 0
    );

    const hasCritical = overdueUnpaid.some((p) => p.isPastDeadline);
    item.situacaoContrato = hasCritical ? 'em_atraso_critico' : 'em_atraso_tolerancia';

    const criticalDeadlines = overdueUnpaid
      .map((p) => p.cancellationDeadline)
      .filter(Boolean)
      .sort();
    item.dataLimiteCancelamentoMaisCritica = criticalDeadlines.length > 0 ? criticalDeadlines[0] : null;
  }

  // Fallbacks de motivo de cancelamento para contratos cancelados
  if (isCancelled && !item.motivoCancelamento) {
    if (item.qtdParcelasVencidas > 0) {
      item.motivoCancelamento = 'Inadimplência (Regra BR-031)';
    } else {
      item.motivoCancelamento = 'Cancelamento Administrativo';
    }
  }

  return item;
}

/**
 * Consulta unificada para a Central de Pendências e Cancelamentos
 * Reúne cotações e apólices em atraso ou canceladas com deduplicação,
 * cálculo de KPIs e enriquecimento da Regra BR-031.
 */
export async function getPendenciasCancelamentosList(
  access: PartnerAccessContext,
  filtros: PendenciasFiltros = {}
): Promise<PendenciasPaginadasResult> {
  const tab: PendenciaTab = filtros.tab || 'visao_geral';

  // 1. Paginação e parâmetros
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(filtros.pageSize))
    ? Number(filtros.pageSize)
    : DEFAULT_PAGE_SIZE;
  const rawPage = Math.max(1, Number(filtros.page) || 1);
  const offset = (rawPage - 1) * pageSize;

  // 2. Parâmetros de Segurança
  const isInternal = Boolean(access.isInternal);
  const isCorretora = Boolean(access.isCorretoraUser && access.corretoraId);
  const corretoraIdParam = isCorretora ? access.corretoraId : filtros.corretoraId || null;
  const partnerIdParam = !isInternal && !isCorretora ? access.partnerId : filtros.partnerId || null;
  const visibleUserIds = !isInternal && !isCorretora && access.visibleUserIds !== null
    ? access.visibleUserIds
    : null;

  // 3. Parâmetros de Busca e Filtros
  const q = (filtros.q || '').trim();
  const digitsOnly = q.replace(/\D/g, '');
  const managerUserId = filtros.managerUserId || null;
  const vendedorUserId = filtros.vendedorUserId || null;
  const productId = filtros.productId || null;
  const tipoRegistro = filtros.tipoRegistro && filtros.tipoRegistro !== 'todos' ? filtros.tipoRegistro : null;
  const diasAtrasoMin = typeof filtros.diasAtrasoMin === 'number' ? filtros.diasAtrasoMin : null;
  const diasAtrasoMax = typeof filtros.diasAtrasoMax === 'number' ? filtros.diasAtrasoMax : null;
  const vencimentoDe = filtros.vencimentoDe || null;
  const vencimentoAte = filtros.vencimentoAte || null;
  const cancelamentoDe = filtros.cancelamentoDe || null;
  const cancelamentoAte = filtros.cancelamentoAte || null;
  const motivoCancelamento = filtros.motivoCancelamento ? filtros.motivoCancelamento.trim() : null;

  // 4. Ordenação
  const orderBy = filtros.orderBy || null;
  const orderDir = (filtros.orderDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

  // 5. Execução Concorrente de KPIs e Itens Paginados
  const [kpisRows, itemsRows] = await Promise.all([
    // Query 1: Indicadores Consolidados (KPIs) com os mesmos filtros base, exceto filtro da aba
    sql<any[]>`
      WITH valid_installments AS (
        SELECT pi.*
        FROM payment_installments pi
        WHERE NOT (
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
      installments_agg AS (
        SELECT
          pi.cotacao_id,
          COUNT(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN 1
          END)::int AS qtd_parcelas_vencidas,
          COALESCE(SUM(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN pi.amount
            ELSE 0
          END), 0)::numeric AS valor_total_atraso,
          MIN(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN pi.due_date
          END)::text AS data_vencimento_mais_antiga,
          COALESCE(MAX(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN GREATEST(0, (CURRENT_DATE - pi.due_date)::int)
            ELSE 0
          END), 0)::int AS maior_dias_atraso,
          COALESCE(SUM(CASE
            WHEN pi.paid_at IS NOT NULL
              OR LOWER(COALESCE(pi.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash')
            THEN pi.amount
            ELSE 0
          END), 0)::numeric AS valor_recebido_antes_cancelamento
        FROM valid_installments pi
        GROUP BY pi.cotacao_id
      ),
      contratos_base AS (
        SELECT
          c.id AS id,
          c.id AS cotacao_id,
          s.id AS sale_id,
          CASE WHEN s.id IS NOT NULL THEN 'venda' ELSE 'cotacao' END AS tipo_registro,
          s.policy_number,
          c.client_name,
          c.client_cpf_cnpj,
          c.client_email,
          c.client_phone,
          COALESCE(corr.id, s.corretora_id, c.corretora_id, '') AS corretora_id,
          COALESCE(corr.nome_fantasia, corr.razao_social, 'Sem Corretora') AS corretora_nome,
          COALESCE(pt.id, s.partner_id, c.partner_id, '') AS partner_id,
          COALESCE(pt.nome_fantasia, pt.razao_social, 'Sem Parceiro') AS partner_nome,
          pu_gest.id AS manager_user_id,
          pu_gest.name AS manager_nome,
          pu_vend.id AS vendedor_user_id,
          pu_vend.name AS vendedor_nome,
          c.product_id,
          COALESCE(p.name, 'Produto Não Identificado') AS product_name,
          CASE WHEN s.id IS NOT NULL THEN COALESCE(s.premio_total, c.premio_final, 0) ELSE COALESCE(c.premio_final, 0) END AS valor_total_contratacao,
          CASE
            WHEN COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada') THEN 'cancelada'
            ELSE 'em_atraso'
          END AS situacao_raw,
          CASE
            WHEN COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada') THEN
              COALESCE(s.updated_at, c.updated_at)::text
            ELSE NULL
          END AS data_cancelamento,
          COALESCE(agg.valor_recebido_antes_cancelamento, 0) AS valor_recebido_antes_cancelamento,
          COALESCE(agg.qtd_parcelas_vencidas, 0) AS qtd_parcelas_vencidas,
          COALESCE(agg.valor_total_atraso, 0) AS valor_total_atraso,
          agg.data_vencimento_mais_antiga,
          COALESCE(agg.maior_dias_atraso, 0) AS maior_dias_atraso
        FROM cotacoes c
        LEFT JOIN LATERAL (
          SELECT s2.* FROM sales s2 WHERE s2.cotacao_id = c.id ORDER BY s2.created_at DESC LIMIT 1
        ) s ON true
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN corretoras corr ON corr.id = COALESCE(s.corretora_id, c.corretora_id)
        LEFT JOIN partners pt ON pt.id = COALESCE(s.partner_id, c.partner_id)
        LEFT JOIN partner_users pu_vend ON pu_vend.id = c.partner_user_id
        LEFT JOIN partner_users pu_gest ON pu_gest.id = pu_vend.manager_user_id
        LEFT JOIN installments_agg agg ON agg.cotacao_id = c.id
        WHERE (
          (COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada'))
          OR (COALESCE(agg.qtd_parcelas_vencidas, 0) > 0)
        )
      )
      SELECT
        COUNT(CASE WHEN situacao_raw = 'em_atraso' THEN 1 END)::int AS "totalContratacoesEmAtraso",
        COALESCE(SUM(CASE WHEN situacao_raw = 'em_atraso' THEN valor_total_atraso ELSE 0 END), 0)::numeric AS "valorTotalEmAtraso",
        COUNT(CASE WHEN situacao_raw = 'cancelada' THEN 1 END)::int AS "totalContratacoesCanceladas",
        COALESCE(SUM(CASE WHEN situacao_raw = 'cancelada' THEN valor_total_contratacao ELSE 0 END), 0)::numeric AS "valorOriginalTotalCanceladas"
      FROM contratos_base
      WHERE (
        (${corretoraIdParam === null}::boolean = true OR corretora_id = ${corretoraIdParam || ''})
        AND (${partnerIdParam === null}::boolean = true OR partner_id = ${partnerIdParam || ''})
        AND (${visibleUserIds === null}::boolean = true OR vendedor_user_id = ANY(${visibleUserIds || []}))
        AND (
          ${!q}::boolean = true
          OR (
            client_name ILIKE ${'%' + q + '%'}
            OR client_email ILIKE ${'%' + q + '%'}
            OR client_cpf_cnpj ILIKE ${'%' + q + '%'}
            OR regexp_replace(client_cpf_cnpj, '\\D', '', 'g') ILIKE ${'%' + (digitsOnly || q) + '%'}
            OR policy_number ILIKE ${'%' + q + '%'}
            OR id ILIKE ${'%' + q + '%'}
          )
        )
        AND (${managerUserId === null}::boolean = true OR manager_user_id = ${managerUserId || ''})
        AND (${vendedorUserId === null}::boolean = true OR vendedor_user_id = ${vendedorUserId || ''})
        AND (${productId === null}::boolean = true OR product_id = ${productId || ''})
        AND (${tipoRegistro === null}::boolean = true OR tipo_registro = ${tipoRegistro || ''})
        AND (${diasAtrasoMin === null}::boolean = true OR maior_dias_atraso >= ${diasAtrasoMin ?? 0})
        AND (${diasAtrasoMax === null}::boolean = true OR maior_dias_atraso <= ${diasAtrasoMax ?? 999999})
        AND (${vencimentoDe === null}::boolean = true OR data_vencimento_mais_antiga >= ${vencimentoDe || '1970-01-01'})
        AND (${vencimentoAte === null}::boolean = true OR data_vencimento_mais_antiga <= ${vencimentoAte || '9999-12-31'})
        AND (${cancelamentoDe === null}::boolean = true OR data_cancelamento::date >= ${cancelamentoDe || '1970-01-01'}::date)
        AND (${cancelamentoAte === null}::boolean = true OR data_cancelamento::date <= ${cancelamentoAte || '9999-12-31'}::date)
      )
    `,

    // Query 2: Lista de Itens Filtrados e Paginados com Parcelas Estruturadas
    sql<any[]>`
      WITH valid_installments AS (
        SELECT pi.*
        FROM payment_installments pi
        WHERE NOT (
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
      installments_agg AS (
        SELECT
          pi.cotacao_id,
          COUNT(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN 1
          END)::int AS qtd_parcelas_vencidas,
          COALESCE(SUM(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN pi.amount
            ELSE 0
          END), 0)::numeric AS valor_total_atraso,
          MIN(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN pi.due_date
          END)::text AS data_vencimento_mais_antiga,
          COALESCE(MAX(CASE
            WHEN pi.due_date < CURRENT_DATE
              AND pi.paid_at IS NULL
              AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
            THEN GREATEST(0, (CURRENT_DATE - pi.due_date)::int)
            ELSE 0
          END), 0)::int AS maior_dias_atraso,
          COALESCE(SUM(CASE
            WHEN pi.paid_at IS NOT NULL
              OR LOWER(COALESCE(pi.status, '')) IN ('paid', 'received', 'confirmed', 'received_in_cash')
            THEN pi.amount
            ELSE 0
          END), 0)::numeric AS valor_recebido_antes_cancelamento,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id,
                'installmentNumber', pi.installment_number,
                'amount', pi.amount,
                'dueDate', pi.due_date::text,
                'paidAt', pi.paid_at::text,
                'status', pi.status,
                'daysOverdue', CASE
                  WHEN pi.due_date < CURRENT_DATE
                    AND pi.paid_at IS NULL
                    AND LOWER(COALESCE(pi.status, '')) NOT IN ('paid', 'received', 'confirmed', 'received_in_cash', 'refunded', 'cancelled')
                  THEN GREATEST(0, (CURRENT_DATE - pi.due_date)::int)
                  ELSE 0
                END,
                'externalPaymentId', pi.external_payment_id,
                'bankSlipUrl', pi.bank_slip_url,
                'pixQrCodeUrl', pi.pix_qr_code_url,
                'invoiceUrl', pi.invoice_url
              ) ORDER BY pi.installment_number ASC
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) AS parcelas
        FROM valid_installments pi
        GROUP BY pi.cotacao_id
      ),
      contratos_base AS (
        SELECT
          c.id AS id,
          c.id AS cotacao_id,
          s.id AS sale_id,
          CASE WHEN s.id IS NOT NULL THEN 'venda' ELSE 'cotacao' END AS tipo_registro,
          s.policy_number,
          c.client_name,
          c.client_cpf_cnpj,
          c.client_email,
          c.client_phone,
          COALESCE(corr.id, s.corretora_id, c.corretora_id, '') AS corretora_id,
          COALESCE(corr.nome_fantasia, corr.razao_social, 'Sem Corretora') AS corretora_nome,
          COALESCE(pt.id, s.partner_id, c.partner_id, '') AS partner_id,
          COALESCE(pt.nome_fantasia, pt.razao_social, 'Sem Parceiro') AS partner_nome,
          pu_gest.id AS manager_user_id,
          pu_gest.name AS manager_nome,
          pu_vend.id AS vendedor_user_id,
          pu_vend.name AS vendedor_nome,
          c.product_id,
          COALESCE(p.name, 'Produto Não Identificado') AS product_name,
          CASE WHEN s.id IS NOT NULL THEN COALESCE(s.premio_total, c.premio_final, 0) ELSE COALESCE(c.premio_final, 0) END AS valor_total_contratacao,
          CASE
            WHEN COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada') THEN 'cancelada'
            ELSE 'em_atraso'
          END AS situacao_raw,
          CASE
            WHEN COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada') THEN
              CASE
                WHEN COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason', '') != '' THEN
                  CASE
                    WHEN LOWER(COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason')) IN ('delinquency', 'overdue_gt_50') THEN 'Inadimplência (Regra BR-031)'
                    WHEN LOWER(COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason')) IN ('refused', 'recusa') THEN 'Recusa de Assinatura'
                    WHEN LOWER(COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason')) = 'client_request' THEN 'Solicitação do Segurado'
                    WHEN LOWER(COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason')) = 'expired_validity' THEN 'Decurso de Prazo'
                    ELSE COALESCE(s.metadata->>'cancel_reason', c.metadata->>'cancel_reason')
                  END
                WHEN c.notes IS NOT NULL AND TRIM(c.notes) != '' THEN c.notes
                WHEN c.status = 'recusada' THEN 'Recusa de Assinatura'
                WHEN COALESCE(agg.qtd_parcelas_vencidas, 0) > 0 THEN 'Inadimplência (Regra BR-031)'
                ELSE 'Cancelamento Administrativo'
              END
            ELSE NULL
          END AS motivo_cancelamento,
          CASE
            WHEN COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada') THEN
              COALESCE(s.updated_at, c.updated_at)::text
            ELSE NULL
          END AS data_cancelamento,
          COALESCE(agg.valor_recebido_antes_cancelamento, 0) AS valor_recebido_antes_cancelamento,
          COALESCE(agg.qtd_parcelas_vencidas, 0) AS qtd_parcelas_vencidas,
          COALESCE(agg.valor_total_atraso, 0) AS valor_total_atraso,
          agg.data_vencimento_mais_antiga,
          COALESCE(agg.maior_dias_atraso, 0) AS maior_dias_atraso,
          COALESCE(agg.parcelas, '[]'::json) AS parcelas,
          c.created_at AS cotacao_created_at
        FROM cotacoes c
        LEFT JOIN LATERAL (
          SELECT s2.* FROM sales s2 WHERE s2.cotacao_id = c.id ORDER BY s2.created_at DESC LIMIT 1
        ) s ON true
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN corretoras corr ON corr.id = COALESCE(s.corretora_id, c.corretora_id)
        LEFT JOIN partners pt ON pt.id = COALESCE(s.partner_id, c.partner_id)
        LEFT JOIN partner_users pu_vend ON pu_vend.id = c.partner_user_id
        LEFT JOIN partner_users pu_gest ON pu_gest.id = pu_vend.manager_user_id
        LEFT JOIN installments_agg agg ON agg.cotacao_id = c.id
        WHERE (
          (COALESCE(s.status, '') = 'cancelada' OR c.status IN ('cancelada', 'recusada'))
          OR (COALESCE(agg.qtd_parcelas_vencidas, 0) > 0)
        )
      )
      SELECT
        cb.*,
        COUNT(*) OVER()::int AS full_count
      FROM contratos_base cb
      WHERE (
        (${corretoraIdParam === null}::boolean = true OR cb.corretora_id = ${corretoraIdParam || ''})
        AND (${partnerIdParam === null}::boolean = true OR cb.partner_id = ${partnerIdParam || ''})
        AND (${visibleUserIds === null}::boolean = true OR cb.vendedor_user_id = ANY(${visibleUserIds || []}))
        AND (
          ${!q}::boolean = true
          OR (
            cb.client_name ILIKE ${'%' + q + '%'}
            OR cb.client_email ILIKE ${'%' + q + '%'}
            OR cb.client_cpf_cnpj ILIKE ${'%' + q + '%'}
            OR regexp_replace(cb.client_cpf_cnpj, '\\D', '', 'g') ILIKE ${'%' + (digitsOnly || q) + '%'}
            OR cb.policy_number ILIKE ${'%' + q + '%'}
            OR cb.id ILIKE ${'%' + q + '%'}
          )
        )
        AND (${managerUserId === null}::boolean = true OR cb.manager_user_id = ${managerUserId || ''})
        AND (${vendedorUserId === null}::boolean = true OR cb.vendedor_user_id = ${vendedorUserId || ''})
        AND (${productId === null}::boolean = true OR cb.product_id = ${productId || ''})
        AND (${tipoRegistro === null}::boolean = true OR cb.tipo_registro = ${tipoRegistro || ''})
        AND (${diasAtrasoMin === null}::boolean = true OR cb.maior_dias_atraso >= ${diasAtrasoMin ?? 0})
        AND (${diasAtrasoMax === null}::boolean = true OR cb.maior_dias_atraso <= ${diasAtrasoMax ?? 999999})
        AND (${vencimentoDe === null}::boolean = true OR cb.data_vencimento_mais_antiga >= ${vencimentoDe || '1970-01-01'})
        AND (${vencimentoAte === null}::boolean = true OR cb.data_vencimento_mais_antiga <= ${vencimentoAte || '9999-12-31'})
        AND (${cancelamentoDe === null}::boolean = true OR cb.data_cancelamento::date >= ${cancelamentoDe || '1970-01-01'}::date)
        AND (${cancelamentoAte === null}::boolean = true OR cb.data_cancelamento::date <= ${cancelamentoAte || '9999-12-31'}::date)
        AND (${motivoCancelamento === null}::boolean = true OR cb.motivo_cancelamento ILIKE ${'%' + (motivoCancelamento || '') + '%'})
        -- Filtro por Aba
        AND (
          (${tab === 'em_atraso'}::boolean = true AND cb.situacao_raw = 'em_atraso')
          OR (${tab === 'canceladas'}::boolean = true AND cb.situacao_raw = 'cancelada')
          OR (${tab !== 'em_atraso' && tab !== 'canceladas'}::boolean = true)
        )
      )
      ORDER BY
        CASE WHEN ${orderBy === 'vencimento' && orderDir === 'asc'}::boolean THEN cb.data_vencimento_mais_antiga END ASC NULLS LAST,
        CASE WHEN ${orderBy === 'vencimento' && orderDir === 'desc'}::boolean THEN cb.data_vencimento_mais_antiga END DESC NULLS LAST,
        CASE WHEN ${orderBy === 'dias_atraso' && orderDir === 'asc'}::boolean THEN cb.maior_dias_atraso END ASC,
        CASE WHEN ${orderBy === 'dias_atraso' && orderDir === 'desc'}::boolean THEN cb.maior_dias_atraso END DESC,
        CASE WHEN ${orderBy === 'valor' && orderDir === 'asc'}::boolean THEN cb.valor_total_contratacao END ASC,
        CASE WHEN ${orderBy === 'valor' && orderDir === 'desc'}::boolean THEN cb.valor_total_contratacao END DESC,
        CASE WHEN ${orderBy === 'data_cancelamento' && orderDir === 'asc'}::boolean THEN cb.data_cancelamento END ASC NULLS LAST,
        CASE WHEN ${orderBy === 'data_cancelamento' && orderDir === 'desc'}::boolean THEN cb.data_cancelamento END DESC NULLS LAST,
        -- Default: aba canceladas por data de cancelamento DESC; outras abas por maior_dias_atraso DESC, vencimento ASC
        CASE WHEN ${!orderBy && tab === 'canceladas'}::boolean THEN cb.data_cancelamento END DESC NULLS LAST,
        CASE WHEN ${!orderBy && tab !== 'canceladas'}::boolean THEN cb.maior_dias_atraso END DESC,
        CASE WHEN ${!orderBy && tab !== 'canceladas'}::boolean THEN cb.data_vencimento_mais_antiga END ASC NULLS LAST,
        cb.cotacao_created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
  ]);

  // 6. Formatação dos Indicadores de KPIs
  const rawKpis = kpisRows[0] || {};
  const kpis: PendenciasKPIs = {
    totalContratacoesEmAtraso: Number(rawKpis.totalContratacoesEmAtraso || 0),
    valorTotalEmAtraso: Number(rawKpis.valorTotalEmAtraso || 0),
    totalContratacoesCanceladas: Number(rawKpis.totalContratacoesCanceladas || 0),
    valorOriginalTotalCanceladas: Number(rawKpis.valorOriginalTotalCanceladas || 0),
  };

  const total = Number(itemsRows[0]?.full_count || 0);

  // 7. Enriquecimento dos Itens com a Regra BR-031
  const items: PendenciaCancelamentoItem[] = itemsRows.map((row: any) => {
    const item: PendenciaCancelamentoItem = {
      id: row.id,
      cotacaoId: row.cotacao_id,
      saleId: row.sale_id || null,
      tipoRegistro: (row.tipo_registro as TipoRegistro) || (row.sale_id ? 'venda' : 'cotacao'),
      policyNumber: row.policy_number || null,
      clientName: row.client_name || '',
      clientCpfCnpj: row.client_cpf_cnpj || '',
      clientEmail: row.client_email || null,
      clientPhone: row.client_phone || null,
      corretoraId: row.corretora_id || '',
      corretoraNome: row.corretora_nome || 'Sem Corretora',
      partnerId: row.partner_id || '',
      partnerNome: row.partner_nome || 'Sem Parceiro',
      managerUserId: row.manager_user_id || null,
      managerNome: row.manager_nome || null,
      vendedorUserId: row.vendedor_user_id || null,
      vendedorNome: row.vendedor_nome || null,
      productId: row.product_id || '',
      productName: row.product_name || 'Produto Não Identificado',
      valorTotalContratacao: Number(row.valor_total_contratacao || 0),
      situacaoContrato: row.situacao_raw === 'cancelada' ? 'cancelada' : 'em_atraso_tolerancia',
      motivoCancelamento: row.motivo_cancelamento || null,
      dataCancelamento: row.data_cancelamento || null,
      valorRecebidoAntesCancelamento: Number(row.valor_recebido_antes_cancelamento || 0),
      qtdParcelasVencidas: Number(row.qtd_parcelas_vencidas || 0),
      valorTotalAtraso: Number(row.valor_total_atraso || 0),
      dataVencimentoMaisAntiga: row.data_vencimento_mais_antiga || null,
      maiorDiasAtraso: Number(row.maior_dias_atraso || 0),
      dataLimiteCancelamentoMaisCritica: null,
      parcelas: Array.isArray(row.parcelas) ? row.parcelas : [],
    };

    return enrichItemWithBR031Rules(item);
  });

  // 8. Filtro opcional pós-enriquecimento por situação se especificado (ex: tolerância vs crítico)
  let filteredItems = items;
  if (filtros.situacao) {
    filteredItems = items.filter((it) => it.situacaoContrato === filtros.situacao);
  }

  const finalTotal = filtros.situacao ? filteredItems.length : total;
  const totalPages = Math.max(1, Math.ceil(finalTotal / pageSize));

  return {
    items: filteredItems,
    kpis,
    total: finalTotal,
    page: rawPage,
    pageSize,
    totalPages,
  };
}
