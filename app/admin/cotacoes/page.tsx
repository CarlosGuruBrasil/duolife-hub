import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ExternalLink, FileText, Search } from 'lucide-react';
import { verifyAuth, isInternalUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { RecusarCotacaoButton } from './_recusar-button';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface AdminCotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  client_email: string | null;
  client_phone: string | null;
  importancia_segurada: string | null;
  premio_final: string | null;
  premio_calculado: string | null;
  status: string;
  created_at: string;
  client_data: unknown;
  product_name: string;
  partner_name: string;
}

const statusLabel: Record<string, string> = {
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

const statusColor: Record<string, string> = {
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  aprovada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
  emitida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assinado: 'bg-purple-50 text-purple-700 border-purple-200',
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

function buildQueryString(params: { status: string; q: string; page: number }) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
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

  const params = searchParams ? await searchParams : {};
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  // Status vem da URL: só aceita valor conhecido, senão o filtro vira ruído silencioso.
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const conditions = [];
  if (status) conditions.push(sql`c.status = ${status}`);
  if (q) {
    // `%` e `_` do usuário são literais na busca, não coringas do ILIKE.
    const like = `%${q.replace(/([\\%_])/g, '\\$1')}%`;
    conditions.push(sql`(c.client_name ILIKE ${like} OR c.client_cpf_cnpj ILIKE ${like} OR c.client_email ILIKE ${like})`);
  }
  const where = conditions.length
    ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
    : sql`TRUE`;

  const [{ total }] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    WHERE ${where}
  `;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
      p.name AS product_name,
      part.nome_fantasia AS partner_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    WHERE ${where}
    ORDER BY c.created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(currentPage - 1) * PAGE_SIZE}
  `;

  const hasFilters = Boolean(status || q);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = (currentPage - 1) * PAGE_SIZE + cotacoes.length;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">COTAÇÕES & PROPOSTAS</span>
          <h1 className="admin-page-title">Cotações Gerais</h1>
          <p className="admin-page-copy">Gerencie cotações, faturas do Asaas, assinaturas do ZapSign e vendas finalizadas.</p>
        </div>
        <Link
          href="/admin/cotacoes/nova"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova Cotação
        </Link>
      </section>

      {/* Filtros — form GET nativo, sem JS de cliente */}
      <form
        method="GET"
        className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, CPF/CNPJ ou e-mail"
            aria-label="Buscar cotações"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
          />
        </div>

        <select
          name="status"
          defaultValue={status}
          aria-label="Filtrar por situação"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer transition-all"
        >
          <option value="">Todas as situações</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#072a33] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#00d4e0] hover:bg-[#0e4a5a] transition-all shadow-xs"
          >
            Filtrar
          </button>
          {hasFilters && (
            <Link
              href="/admin/cotacoes"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 px-3 py-2 transition-colors"
            >
              Limpar
            </Link>
          )}
        </div>
      </form>

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
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Cliente / CPF</th>
                  <th className="px-6 py-4">Plano / Cobertura</th>
                  <th className="px-6 py-4">Parceiro / Vendedor</th>
                  <th className="px-6 py-4 text-right">Valor Total</th>
                  <th className="px-6 py-4 text-center">Situação / Status</th>
                  <th className="px-6 py-4 text-center">Fatura & Contrato</th>
                  <th className="px-6 py-4 text-right">Data</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cotacoes.map((cotacao) => {
                  const clientData = parseClientData(cotacao.client_data);
                  const planoNome = String(clientData.nomePlano || clientData.tipoDePlano || cotacao.product_name || 'RC Advogados');
                  const cobertura = String(clientData.valorCobertura || (cotacao.importancia_segurada ? formatCurrency(cotacao.importancia_segurada) : ''));
                  const linkBoleto = safeExternalUrl(clientData.linkBoleto);
                  const signUrl = safeExternalUrl(clientData.signUrl);
                  const oab = String(clientData.oab || '');

                  return (
                    <tr key={cotacao.id} className="hover:bg-slate-50/60 transition-colors duration-150 group">
                      <td className="px-6 py-4">
                        <Link href={`/admin/cotacoes/${cotacao.id}`} className="font-semibold text-slate-900 hover:text-emerald-600 hover:underline block">
                          {cotacao.client_name}
                        </Link>
                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                          {cotacao.client_cpf_cnpj} {oab ? `· OAB ${oab}` : ''}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-900 block">{planoNome}</span>
                        {cobertura && <span className="text-xs text-slate-500 font-normal block">{cobertura}</span>}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                            {(cotacao.partner_name || 'DL').substring(0, 2)}
                          </div>
                          {cotacao.partner_name || 'DuoLife'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-900 block">{getDisplayPrice(cotacao)}</span>
                        {clientData.parcela && Number(clientData.parcela) > 1 && (
                          <span className="text-[11px] text-slate-500 font-normal block">{clientData.parcela}x parcelado</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor[cotacao.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {statusLabel[cotacao.status] || cotacao.status}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center">
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

                          {signUrl && (
                            <a
                              href={signUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-2.5 py-1 rounded-lg transition-colors"
                              title="Ver Contrato ZapSign"
                            >
                              ✍️ Contrato <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-500 text-xs text-right font-medium">
                        {formatDateTime(cotacao.created_at)}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/admin/cotacoes/${cotacao.id}`}
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Detalhes
                          </Link>
                          {!ESTADOS_TERMINAIS.includes(cotacao.status) && (
                            <RecusarCotacaoButton id={cotacao.id} clientName={cotacao.client_name} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-xs font-medium text-slate-500">
            <span>
              Exibindo <strong className="text-slate-800">{firstItem}–{lastItem}</strong> de{' '}
              <strong className="text-slate-800">{total}</strong> cotações
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/cotacoes${buildQueryString({ status, q, page: currentPage - 1 })}`}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Anterior
                  </Link>
                )}
                <span className="text-slate-500">Página {currentPage} de {totalPages}</span>
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/cotacoes${buildQueryString({ status, q, page: currentPage + 1 })}`}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Próxima
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
