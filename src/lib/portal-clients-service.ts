import { sql } from '@/lib/pg';
import { PartnerAccessContext } from '@/lib/auth';
import {
  PageSizeOption,
  PeriodPreset,
  PortalClientRow,
  PortalClientsFilterParams,
  PortalClientSortField,
  SortDirection,
  PaginatedPortalClientsResult,
} from '@/types/portal-clients';

const ALLOWED_PAGE_SIZES: PageSizeOption[] = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE: PageSizeOption = 20;

function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

function resolveDateRange(preset?: string, startDate?: string, endDate?: string) {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (preset === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (startDate || endDate) {
    const start = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : null;
    return { start, end };
  }
  return { start: null, end: null };
}

export async function getPortalClientsList(
  access: PartnerAccessContext,
  rawParams: PortalClientsFilterParams = {}
): Promise<PaginatedPortalClientsResult> {
  // 1. Paginação
  const pageSize: PageSizeOption = ALLOWED_PAGE_SIZES.includes(Number(rawParams.pageSize) as PageSizeOption)
    ? (Number(rawParams.pageSize) as PageSizeOption)
    : DEFAULT_PAGE_SIZE;
  const rawPage = Math.max(1, Number(rawParams.page) || 1);

  // 2. Ordenação
  const sortDirection: SortDirection = rawParams.direction?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortField: PortalClientSortField = rawParams.sort && [
    'created_at',
    'full_name',
    'document_number',
    'email',
    'phone',
    'products_count',
    'cotacoes_count',
    'paid_installments',
    'last_payment_status',
    'last_quote_status',
    'last_signature_status',
    'updated_at',
  ].includes(rawParams.sort)
    ? rawParams.sort
    : 'updated_at';

  // 3. Montagem do Escopo de Segurança por Perfil
  const isCorretora = Boolean(access.isCorretoraUser && access.corretoraId);
  const hasVisibleUsers = access.visibleUserIds !== null && access.visibleUserIds.length > 0;

  const scopeCondition = isCorretora
    ? sql`EXISTS (
        SELECT 1 FROM cotacoes c_scope
        WHERE c_scope.client_id = ic.id
          AND c_scope.corretora_id = ${access.corretoraId}
      )`
    : access.visibleUserIds === null
    ? sql`EXISTS (
        SELECT 1 FROM cotacoes c_scope
        WHERE c_scope.client_id = ic.id
          AND c_scope.partner_id = ${access.partnerId}
      )`
    : hasVisibleUsers
    ? sql`EXISTS (
        SELECT 1 FROM cotacoes c_scope
        WHERE c_scope.client_id = ic.id
          AND c_scope.partner_id = ${access.partnerId}
          AND (c_scope.partner_user_id IN ${sql(access.visibleUserIds)} OR c_scope.partner_user_id IS NULL)
      )`
    : sql`EXISTS (
        SELECT 1 FROM cotacoes c_scope
        WHERE c_scope.client_id = ic.id
          AND c_scope.partner_id = ${access.partnerId}
          AND c_scope.partner_user_id IS NULL
      )`;

  const conditions = [scopeCondition];

  // 4. Busca Textual em Tempo Real (Nome, CPF/CNPJ, E-mail, Telefone)
  const q = (rawParams.q || '').trim().slice(0, 100);
  if (q) {
    const textLike = `%${escapeLike(q)}%`;
    const digitsOnly = q.replace(/\D/g, '');

    if (digitsOnly.length >= 3) {
      const digitsLike = `%${escapeLike(digitsOnly)}%`;
      conditions.push(sql`(
        ic.full_name ILIKE ${textLike}
        OR ic.email ILIKE ${textLike}
        OR ic.document_number ILIKE ${textLike}
        OR regexp_replace(ic.document_number, '\\D', '', 'g') ILIKE ${digitsLike}
        OR ic.phone ILIKE ${textLike}
        OR regexp_replace(ic.phone, '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        ic.full_name ILIKE ${textLike}
        OR ic.email ILIKE ${textLike}
        OR ic.document_number ILIKE ${textLike}
        OR ic.phone ILIKE ${textLike}
      )`);
    }
  }

  // 5. Filtro por Produto
  if (rawParams.productId) {
    if (isCorretora) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM cotacoes c_p
        WHERE c_p.client_id = ic.id
          AND c_p.product_id = ${rawParams.productId}
          AND c_p.corretora_id = ${access.corretoraId}
      )`);
    } else if (access.visibleUserIds === null) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM cotacoes c_p
        WHERE c_p.client_id = ic.id
          AND c_p.product_id = ${rawParams.productId}
          AND c_p.partner_id = ${access.partnerId}
      )`);
    } else if (hasVisibleUsers) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM cotacoes c_p
        WHERE c_p.client_id = ic.id
          AND c_p.product_id = ${rawParams.productId}
          AND c_p.partner_id = ${access.partnerId}
          AND (c_p.partner_user_id IN ${sql(access.visibleUserIds)} OR c_p.partner_user_id IS NULL)
      )`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM cotacoes c_p
        WHERE c_p.client_id = ic.id
          AND c_p.product_id = ${rawParams.productId}
          AND c_p.partner_id = ${access.partnerId}
          AND c_p.partner_user_id IS NULL
      )`);
    }
  }

  // 6. Filtro por Assinatura
  if (rawParams.signatureStatus) {
    conditions.push(sql`(
      EXISTS (
        SELECT 1 FROM signature_documents sd_st
        WHERE sd_st.client_id = ic.id AND sd_st.status = ${rawParams.signatureStatus}
      )
      OR EXISTS (
        SELECT 1 FROM cotacoes c_sig
        WHERE c_sig.client_id = ic.id AND c_sig.status = ${rawParams.signatureStatus}
      )
    )`);
  }

  // 7. Filtro por Situação das Parcelas / Pagamento
  if (rawParams.paymentStatus) {
    if (rawParams.paymentStatus === 'paid') {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM payment_orders po_st
        WHERE po_st.client_id = ic.id
          AND po_st.status IN ('paid', 'confirmed', 'received')
      )`);
    } else if (rawParams.paymentStatus === 'overdue') {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM payment_orders po_st
        WHERE po_st.client_id = ic.id
          AND (po_st.status = 'overdue' OR (po_st.status = 'pending' AND po_st.due_date < CURRENT_DATE))
      )`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM payment_orders po_st
        WHERE po_st.client_id = ic.id
          AND po_st.status = ${rawParams.paymentStatus}
      )`);
    }
  }

  // 8. Filtro por Período de Cadastro / Datas
  const { start, end } = resolveDateRange(rawParams.periodPreset, rawParams.startDate, rawParams.endDate);
  if (start) {
    conditions.push(sql`ic.created_at >= ${start}::timestamptz`);
  }
  if (end) {
    conditions.push(sql`ic.created_at <= ${end}::timestamptz`);
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  // 9. Total de Registros e Produtos Disponíveis
  const productsQuery = isCorretora
    ? sql<{ id: string; name: string; code: string }[]>`
        SELECT DISTINCT p.id, p.name, p.code
        FROM products p
        JOIN cotacoes c ON c.product_id = p.id
        WHERE c.corretora_id = ${access.corretoraId}
        ORDER BY p.name ASC
      `
    : sql<{ id: string; name: string; code: string }[]>`
        SELECT DISTINCT p.id, p.name, p.code
        FROM products p
        JOIN cotacoes c ON c.product_id = p.id
        WHERE c.partner_id = ${access.partnerId}
        ORDER BY p.name ASC
      `;

  const [countResult, availableProducts] = await Promise.all([
    sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM insurance_clients ic
      WHERE ${whereClause}
    `,
    productsQuery,
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, totalPages);
  const offset = (page - 1) * pageSize;

  if (total === 0) {
    return {
      items: [],
      pagination: {
        page: 1,
        pageSize,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
      filters: {
        availableProducts,
      },
    };
  }

  // 10. Mapeamento Seguro do ORDER BY
  const sortExpression = (() => {
    switch (sortField) {
      case 'full_name':
        return sortDirection === 'asc' ? sql`ic.full_name ASC` : sql`ic.full_name DESC`;
      case 'document_number':
        return sortDirection === 'asc' ? sql`ic.document_number ASC` : sql`ic.document_number DESC`;
      case 'email':
        return sortDirection === 'asc' ? sql`ic.email ASC NULLS LAST` : sql`ic.email DESC NULLS LAST`;
      case 'phone':
        return sortDirection === 'asc' ? sql`ic.phone ASC NULLS LAST` : sql`ic.phone DESC NULLS LAST`;
      case 'products_count':
        return sortDirection === 'asc' ? sql`products_count ASC` : sql`products_count DESC`;
      case 'cotacoes_count':
        return sortDirection === 'asc' ? sql`cotacoes_count ASC` : sql`cotacoes_count DESC`;
      case 'paid_installments':
        return sortDirection === 'asc' ? sql`paid_installments ASC` : sql`paid_installments DESC`;
      case 'last_payment_status':
        return sortDirection === 'asc' ? sql`last_payment_status ASC NULLS LAST` : sql`last_payment_status DESC NULLS LAST`;
      case 'last_quote_status':
        return sortDirection === 'asc' ? sql`last_quote_status ASC NULLS LAST` : sql`last_quote_status DESC NULLS LAST`;
      case 'last_signature_status':
        return sortDirection === 'asc' ? sql`last_signature_status ASC NULLS LAST` : sql`last_signature_status DESC NULLS LAST`;
      case 'created_at':
        return sortDirection === 'asc' ? sql`ic.created_at ASC` : sql`ic.created_at DESC`;
      case 'updated_at':
      default:
        return sortDirection === 'asc' ? sql`updated_at ASC` : sql`updated_at DESC`;
    }
  })();

  // 11. Consulta Principal Paginada e Otimizada
  const items = isCorretora
    ? await sql<PortalClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          ic.created_at::text,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.corretora_id = ${access.corretoraId}
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT sd.status
            FROM signature_documents sd
            WHERE sd.client_id = ic.id
            ORDER BY sd.created_at DESC
            LIMIT 1
          ) AS last_signature_status,
          (
            SELECT po.status
            FROM payment_orders po
            JOIN cotacoes c3 ON c3.id = po.cotacao_id
            WHERE po.client_id = ic.id
              AND c3.corretora_id = ${access.corretoraId}
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.corretora_id = ${access.corretoraId}
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.cotacao_id = c.id
        WHERE ${whereClause}
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone, ic.created_at
        ORDER BY ${sortExpression}
        LIMIT ${pageSize} OFFSET ${offset}
      `
    : access.visibleUserIds === null
    ? await sql<PortalClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          ic.created_at::text,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.partner_id = ${access.partnerId}
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT sd.status
            FROM signature_documents sd
            WHERE sd.client_id = ic.id
            ORDER BY sd.created_at DESC
            LIMIT 1
          ) AS last_signature_status,
          (
            SELECT po.status
            FROM payment_orders po
            WHERE po.client_id = ic.id
              AND po.partner_id = ${access.partnerId}
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.partner_id = ${access.partnerId}
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.partner_id = ${access.partnerId}
         AND po.cotacao_id = c.id
        WHERE ${whereClause}
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone, ic.created_at
        ORDER BY ${sortExpression}
        LIMIT ${pageSize} OFFSET ${offset}
      `
    : hasVisibleUsers
    ? await sql<PortalClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          ic.created_at::text,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.partner_id = ${access.partnerId}
              AND (c2.partner_user_id IN ${sql(access.visibleUserIds)} OR c2.partner_user_id IS NULL)
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT sd.status
            FROM signature_documents sd
            WHERE sd.client_id = ic.id
            ORDER BY sd.created_at DESC
            LIMIT 1
          ) AS last_signature_status,
          (
            SELECT po.status
            FROM payment_orders po
            JOIN cotacoes c3 ON c3.id = po.cotacao_id
            WHERE po.client_id = ic.id
              AND po.partner_id = ${access.partnerId}
              AND (c3.partner_user_id IN ${sql(access.visibleUserIds)} OR c3.partner_user_id IS NULL)
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.partner_id = ${access.partnerId}
         AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL)
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.partner_id = ${access.partnerId}
         AND po.cotacao_id = c.id
        WHERE ${whereClause}
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone, ic.created_at
        ORDER BY ${sortExpression}
        LIMIT ${pageSize} OFFSET ${offset}
      `
    : await sql<PortalClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          ic.created_at::text,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.partner_id = ${access.partnerId}
              AND c2.partner_user_id IS NULL
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT sd.status
            FROM signature_documents sd
            WHERE sd.client_id = ic.id
            ORDER BY sd.created_at DESC
            LIMIT 1
          ) AS last_signature_status,
          (
            SELECT po.status
            FROM payment_orders po
            JOIN cotacoes c3 ON c3.id = po.cotacao_id
            WHERE po.client_id = ic.id
              AND po.partner_id = ${access.partnerId}
              AND c3.partner_user_id IS NULL
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.partner_id = ${access.partnerId}
         AND c.partner_user_id IS NULL
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.partner_id = ${access.partnerId}
         AND po.cotacao_id = c.id
        WHERE ${whereClause}
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone, ic.created_at
        ORDER BY ${sortExpression}
        LIMIT ${pageSize} OFFSET ${offset}
      `;

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    filters: {
      availableProducts,
    },
  };
}
