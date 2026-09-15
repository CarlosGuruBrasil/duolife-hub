import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Play, Search, FileText } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';
import { formatCurrency, formatDate } from '@/lib/format';
import { PortalCotacoesFilterSection } from './_components/PortalCotacoesFilterSection';
import { PortalCotacoesPagination } from './_components/PortalCotacoesPagination';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';

export const dynamic = 'force-dynamic';

interface CotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  importancia_segurada: string | null;
  premio_final: string | null;
  status: string;
  created_at: string;
  product_id: string;
  product_name: string;
  partner_name?: string | null;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Emitida',
  contrato_gerado: 'Aguardando Assinatura',
  assinado: 'Contrato Assinado',
  pagamento_gerado: 'Fatura Gerada',
};

const statusColor: Record<string, string> = {
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  aprovada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
  emitida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assinado: 'bg-purple-50 text-purple-700 border-purple-200',
  pagamento_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
};

export default async function CotacoesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();
  await seedInitialData();

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
    conditions.push(sql`c.corretora_id = ${access.corretoraId}`);
  } else if (access.visibleUserIds === null) {
    conditions.push(sql`c.partner_id = ${access.partnerId}`);
  } else if (access.visibleUserIds.length > 0) {
    conditions.push(sql`(c.partner_id = ${access.partnerId} AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL))`);
  } else {
    conditions.push(sql`(c.partner_id = ${access.partnerId} AND c.partner_user_id IS NULL)`);
  }

  // Filtros dinâmicos
  if (status) {
    conditions.push(sql`c.status = ${status}`);
  }
  if (productId) {
    conditions.push(sql`c.product_id = ${productId}`);
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

  const where = conditions.length > 0
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  const [countResult, productsList] = await Promise.all([
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM cotacoes c
      WHERE ${where}
    `,
    sql<{ id: string; name: string }[]>`
      SELECT id, name
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `,
  ]);

  const totalRecords = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalRecords / pageSize);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const offset = (safePage - 1) * pageSize;

  const cotacoes = await sql<CotacaoRow[]>`
    SELECT
      c.id,
      c.client_name,
      c.client_cpf_cnpj,
      c.importancia_segurada,
      c.premio_final,
      c.status,
      c.created_at,
      c.product_id,
      p.name AS product_name,
      pt.razao_social AS partner_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN partners pt ON pt.id = c.partner_id
    WHERE ${where}
    ORDER BY c.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const hasActiveFilters = Boolean(q || status || productId || (periodPreset && periodPreset !== 'all'));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Cotações</h1>
          <p className="muted mt-1 text-sm">
            {isCorretora
              ? 'Acompanhe as propostas e rascunhos de todos os vendedores da sua corretora.'
              : 'Acompanhe os rascunhos e propostas dos seus produtos e serviços.'}
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

      {/* Barra de Filtros Reativa e Inteligente */}
      <PortalCotacoesFilterSection
        products={productsList.map((p) => ({ id: p.id, name: p.name }))}
        statusLabels={statusLabel}
        pageSize={pageSize}
      />

      {/* Listagem */}
      <div className="card overflow-hidden p-0 border border-gray-200 shadow-xs bg-white">
        {cotacoes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              {hasActiveFilters ? <Search size={28} /> : <FileText size={28} />}
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {hasActiveFilters ? 'Nenhuma cotação encontrada' : 'Nenhuma cotação cadastrada'}
            </h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm text-gray-500">
              {hasActiveFilters
                ? 'Tente ajustar ou limpar os filtros para encontrar o que procura.'
                : 'Crie a primeira cotação para registrar o cliente e iniciar o atendimento com a DuoLife.'}
            </p>
            {hasActiveFilters ? (
              <Link
                href="/portal/cotacoes"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-gray-800"
              >
                Limpar todos os filtros
              </Link>
            ) : (
              <Link href="/portal/cotacoes/nova" className="btn-accent mt-6 inline-flex">
                Criar cotação
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/75 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-5 py-3.5">Cliente</th>
                    {isCorretora && <th className="px-5 py-3.5">Corretor</th>}
                    <th className="px-5 py-3.5">Produto</th>
                    <th className="px-5 py-3.5">Importância</th>
                    <th className="px-5 py-3.5">Prêmio</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Criada em</th>
                    <th className="px-5 py-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {cotacoes.map((cotacao) => (
                    <tr key={cotacao.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="px-5 py-4">
                        <Link
                          href={`/portal/cotacoes/${cotacao.id}`}
                          className="font-semibold text-gray-900 hover:text-[#0e4a5a] hover:underline block"
                        >
                          {cotacao.client_name}
                        </Link>
                        <div className="text-xs text-gray-500">{cotacao.client_cpf_cnpj}</div>
                      </td>
                      {isCorretora && (
                        <td className="px-5 py-4 text-xs font-semibold text-gray-700">
                          {cotacao.partner_name || 'Corretora'}
                        </td>
                      )}
                      <td className="px-5 py-4 text-gray-600 font-medium">{cotacao.product_name}</td>
                      <td className="px-5 py-4 text-gray-600">{formatCurrency(cotacao.importancia_segurada)}</td>
                      <td className="px-5 py-4 text-gray-900 font-semibold">{formatCurrency(cotacao.premio_final)}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border ${
                            statusColor[cotacao.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {statusLabel[cotacao.status] || cotacao.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(cotacao.created_at)}</td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {cotacao.status === 'rascunho' && (
                            <Link
                              href={`/portal/cotacoes/nova?product=${encodeURIComponent(cotacao.product_id)}&cotacaoId=${cotacao.id}`}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90 shadow-xs"
                              style={{ background: 'var(--primary)' }}
                              title="Dar continuidade a este rascunho"
                            >
                              <Play size={12} className="fill-current" /> Continuar
                            </Link>
                          )}
                          <Link
                            href={`/portal/cotacoes/${cotacao.id}`}
                            className="text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            {cotacao.status === 'rascunho' ? 'Detalhes' : 'Ver / Editar'}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PortalCotacoesPagination
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
