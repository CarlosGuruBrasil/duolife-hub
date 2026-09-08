import { sql } from '@/lib/pg';
import {
  AdminClientsFilterParams,
  AdminClientRow,
  PaginatedClientsResult,
  PageSizeOption,
  ClientSortField,
  SortDirection,
} from '@/types/admin-clients';

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

export async function getAdminClientsList(
  rawParams: AdminClientsFilterParams = {}
): Promise<PaginatedClientsResult> {
  // 1. Sanitização de Paginação
  const pageSize: PageSizeOption = ALLOWED_PAGE_SIZES.includes(Number(rawParams.pageSize) as PageSizeOption)
    ? (Number(rawParams.pageSize) as PageSizeOption)
    : DEFAULT_PAGE_SIZE;
  const rawPage = Math.max(1, Number(rawParams.page) || 1);

  // 2. Sanitização de Ordenação
  const sortDirection: SortDirection = rawParams.direction?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortField: ClientSortField = rawParams.sort && [
    'created_at',
    'full_name',
    'document_number',
    'email',
    'phone',
    'partner_names',
    'products_count',
    'cotacoes_count',
    'paid_installments',
    'last_payment_status',
    'last_quote_status',
    'last_signature_status',
    'updated_at',
  ].includes(rawParams.sort)
    ? rawParams.sort
    : 'created_at';

  // 3. Montagem dos Predicados WHERE
  const conditions = [];

  // Busca Textual (Nome, CPF/CNPJ, E-mail, Telefone) com e sem pontuação
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

  // Filtro por Produto
  if (rawParams.productId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM cotacoes c_p
      WHERE c_p.client_id = ic.id AND c_p.product_id = ${rawParams.productId}
    )`);
  }

  // Filtro por Cotações (Presença)
  if (rawParams.quotesFilter === 'with_quotes') {
    conditions.push(sql`EXISTS (SELECT 1 FROM cotacoes c_has WHERE c_has.client_id = ic.id)`);
  } else if (rawParams.quotesFilter === 'without_quotes') {
    conditions.push(sql`NOT EXISTS (SELECT 1 FROM cotacoes c_none WHERE c_none.client_id = ic.id)`);
  } else if (rawParams.quotesFilter === 'multiple') {
    conditions.push(sql`(
      SELECT COUNT(c_m.id) FROM cotacoes c_m WHERE c_m.client_id = ic.id
    ) >= 2`);
  }

  // Filtro por Status da Cotação
  if (rawParams.quoteStatus) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM cotacoes c_st
      WHERE c_st.client_id = ic.id AND c_st.status = ${rawParams.quoteStatus}
    )`);
  }

  // Filtro por Assinatura
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

  // Filtro por Status de Pagamento
  if (rawParams.paymentStatus) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM payment_orders po_st
      WHERE po_st.client_id = ic.id AND po_st.status = ${rawParams.paymentStatus}
    )`);
  }

  // Filtro por Parceiro
  if (rawParams.partnerId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM cotacoes c_part
      WHERE c_part.client_id = ic.id AND c_part.partner_id = ${rawParams.partnerId}
    )`);
  }

  // Filtro por Período de Cadastro
  const { start, end } = resolveDateRange(rawParams.periodPreset, rawParams.startDate, rawParams.endDate);
  if (start) {
    conditions.push(sql`ic.created_at >= ${start}::timestamptz`);
  }
  if (end) {
    conditions.push(sql`ic.created_at <= ${end}::timestamptz`);
  }

  const whereClause = conditions.length
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  // 4. Mapeamento Seguro do ORDER BY
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
      case 'partner_names':
        return sortDirection === 'asc' ? sql`partner_names ASC NULLS LAST` : sql`partner_names DESC NULLS LAST`;
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
      case 'updated_at':
        return sortDirection === 'asc' ? sql`updated_at ASC` : sql`updated_at DESC`;
      case 'created_at':
      default:
        // Padrão solicitado: data de cadastro com mais recentes no topo
        return sortDirection === 'asc' ? sql`ic.created_at ASC` : sql`ic.created_at DESC`;
    }
  })();

  // 5. Execução em Paralelo: Total Count + Listas de Filtros
  const [countResult, productsList, partnersList] = await Promise.all([
    sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM insurance_clients ic
      WHERE ${whereClause}
    `,
    sql<{ id: string; name: string; code: string }[]>`
      SELECT id, name, code
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, COALESCE(nome_fantasia, razao_social) AS name
      FROM partners
      ORDER BY name ASC
    `,
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(rawPage, totalPages);
  const offset = (page - 1) * pageSize;

  // 6. Query Principal Paginada e Otimizada
  const items = total === 0 ? [] : await sql<AdminClientRow[]>`
    SELECT
      ic.id,
      ic.full_name,
      ic.document_number,
      ic.email,
      ic.phone,
      ic.created_at::text,
      (
        SELECT string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razao_social), ', ')
        FROM cotacoes c
        JOIN partners p ON p.id = c.partner_id
        WHERE c.client_id = ic.id
      ) AS partner_names,
      (
        SELECT COUNT(DISTINCT c.product_id)::int
        FROM cotacoes c
        WHERE c.client_id = ic.id
      ) AS products_count,
      (
        SELECT COUNT(c.id)::int
        FROM cotacoes c
        WHERE c.client_id = ic.id
      ) AS cotacoes_count,
      (
        SELECT c2.status
        FROM cotacoes c2
        WHERE c2.client_id = ic.id
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
        ORDER BY po.created_at DESC
        LIMIT 1
      ) AS last_payment_status,
      COALESCE(po_agg.paid_installments, 0)::int AS paid_installments,
      COALESCE(po_agg.installment_count, 0)::int AS total_installments,
      GREATEST(
        ic.updated_at,
        COALESCE(po_agg.max_updated, ic.updated_at),
        COALESCE(c_agg.max_updated, ic.updated_at)
      )::text AS updated_at
    FROM insurance_clients ic
    LEFT JOIN LATERAL (
      SELECT
        SUM(paid_installments)::int AS paid_installments,
        SUM(installment_count)::int AS installment_count,
        MAX(updated_at) AS max_updated
      FROM payment_orders
      WHERE client_id = ic.id
    ) po_agg ON true
    LEFT JOIN LATERAL (
      SELECT MAX(updated_at) AS max_updated
      FROM cotacoes
      WHERE client_id = ic.id
    ) c_agg ON true
    WHERE ${whereClause}
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
      availableProducts: productsList,
      availablePartners: partnersList,
    },
  };
}
