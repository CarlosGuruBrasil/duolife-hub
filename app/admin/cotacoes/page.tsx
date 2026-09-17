import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ExternalLink, FileText, Search, Play } from 'lucide-react';
import { verifyAuth, isInternalUser, isDevUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { RecusarCotacaoButton } from './_recusar-button';
import { GerarBoletoButton } from './_gerar-boleto-button';
import { ExcluirCotacaoButton } from '@/components/dev';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { formatCurrency, formatDateTime, formatStatusLabel } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';

import { CotacoesFilterSection } from './_components/CotacoesFilterSection';
import { CotacoesPagination } from './_components/CotacoesPagination';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import TransferirParceiroCotacaoButton from '@/components/modals/TransferirParceiroCotacaoButton';

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
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando Assinatura',
  assinado: 'Contrato Assinado',
  signed: 'Contrato Assinado',
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
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 120);
  const productId = typeof params.productId === 'string' ? params.productId : '';
  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : '';
  const periodPreset = typeof params.periodPreset === 'string' ? (params.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
  const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
  const pageSize = [10, 25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const conditions = [];
  if (status) conditions.push(sql`c.status = ${status}`);
  if (productId) conditions.push(sql`c.product_id = ${productId}`);
  if (partnerId) conditions.push(sql`c.partner_id = ${partnerId}`);

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

  const [countResult, productsList, partnersList] = await Promise.all([
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
    sql<{ id: string; name: string }[]>`
      SELECT id, COALESCE(nome_fantasia, razao_social) AS name FROM partners ORDER BY name ASC
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
      pu.name AS partner_user_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    LEFT JOIN partner_users pu ON pu.id = c.partner_user_id
    WHERE ${where}
    ORDER BY c.created_at DESC
    LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}
  `;

  const hasFilters = Boolean(
    status ||
    q ||
    productId ||
    partnerId ||
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
        <Link
          href="/admin/cotacoes/nova"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova Cotação
        </Link>
      </section>

      {/* Seção de Filtros Reativos */}
      <CotacoesFilterSection
        products={productsList}
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
                  <th className="px-6 py-4 border-b border-slate-200">Parceiro / Vendedor</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Valor Total</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center">Situação / Status</th>
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
                  const linkBoleto = safeExternalUrl(clientData.linkBoleto);
                  const signUrl = safeExternalUrl(clientData.signUrl);
                  const oab = String(clientData.oab || '');

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

                      <td className="px-6 py-4 text-right border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-900 block">{getDisplayPrice(cotacao)}</span>
                        {clientData.parcela && Number(clientData.parcela) > 1 && (
                          <span className="text-[11px] text-slate-500 font-normal block">{clientData.parcela}x parcelado</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center border-b border-slate-100">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor[cotacao.status?.toLowerCase()] || statusColor[cotacao.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {statusLabel[cotacao.status?.toLowerCase()] || formatStatusLabel(cotacao.status)}
                        </span>
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
                          ) : cotacao.status === 'assinado' ? (
                            <GerarBoletoButton id={cotacao.id} clientName={cotacao.client_name} variant="table" />
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
