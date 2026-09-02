import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Users,
  Shield,
  DollarSign,
  ArrowUpRight,
  ExternalLink,
  PlusCircle,
  Database,
  Layers,
  Sparkles,
  Clock,
} from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import {
  getAdminRankingData,
  getRecentMonthOptions,
  type AdminRankingRow,
  type RankingSource,
} from '@/lib/admin-reporting';
import AdminPeriodFilterBar from '../_components/AdminPeriodFilterBar';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export default async function AdminRankingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const params = searchParams ? await searchParams : {};
  const monthParam = typeof params.month === 'string' ? params.month : undefined;
  const startParam = typeof params.start === 'string' ? params.start : undefined;
  const endParam = typeof params.end === 'string' ? params.end : undefined;
  const sourceParam = typeof params.source === 'string' ? params.source : 'duolife';

  const [data, monthOptions] = await Promise.all([
    getAdminRankingData(monthParam, startParam, endParam, sourceParam),
    Promise.resolve(getRecentMonthOptions(24)),
  ]);

  const { totals, podium, ranking, period, source } = data;

  function buildUrlWithSource(newSource: RankingSource) {
    const q = new URLSearchParams();
    if (newSource !== 'duolife') q.set('source', newSource);
    if (monthParam) q.set('month', monthParam);
    if (startParam) q.set('start', startParam);
    if (endParam) q.set('end', endParam);
    const qStr = q.toString();
    return `/admin/ranking${qStr ? `?${qStr}` : ''}`;
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">REDE DE PARCEIROS & PERFORMANCE</span>
          <h1 className="admin-page-title">Ranking de Produtores</h1>
          <p className="admin-page-copy">
            Classificação geral de desempenho comercial, apólices emitidas e faturamento por corretora para {period.label}.
          </p>
        </div>
      </section>

      {/* Seletor de Origem dos Dados (DuoLife vs Wix Import1 vs Consolidado) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-1 flex items-center gap-1.5">
            <Database size={14} className="text-[#0e4a5a]" /> Origem:
          </span>
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-medium">
            <Link
              href={buildUrlWithSource('duolife')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                source === 'duolife'
                  ? 'bg-white text-[#0e4a5a] font-bold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Produção Atual (DuoLife)
            </Link>
            <Link
              href={buildUrlWithSource('wix')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                source === 'wix'
                  ? 'bg-white text-[#0e4a5a] font-bold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Histórico Wix (Import1 / CodigoVenda)
            </Link>
            <Link
              href={buildUrlWithSource('consolidated')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                source === 'consolidated'
                  ? 'bg-white text-[#0e4a5a] font-bold shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Consolidado (DuoLife + Wix)
            </Link>
          </div>
        </div>

        <div className="text-xs text-gray-500 flex items-center gap-1.5">
          {source === 'duolife' && (
            <span>
              Exibindo cotações e apólices emitidas diretamente no novo sistema DuoLife.
            </span>
          )}
          {source === 'wix' && (
            <span>
              Recalculado sobre a base de 1.373 propostas do Wix Import1 agrupadas pelo <strong>CodigoVenda</strong> (slug do parceiro).
            </span>
          )}
          {source === 'consolidated' && (
            <span>
              Unificando a produção nativa do DuoLife com o histórico do Wix para cada corretor.
            </span>
          )}
        </div>
      </div>

      {/* Barra de Filtros de Período */}
      <AdminPeriodFilterBar
        currentMonthKey={period.monthKey}
        monthOptions={monthOptions}
        baseUrl="/admin/ranking"
      />

      {/* Cards de Métricas Consolidadas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Volume Total Emitido</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(totals.totalPremium)}</div>
          <p className="mt-1 text-xs text-gray-500">Prêmios de seguros e serviços fechados</p>
        </div>

        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {source === 'duolife' ? 'Apólices Emitidas' : 'Negócios Fechados'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#0e4a5a]/10 text-[#0e4a5a] flex items-center justify-center">
              <Shield size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{totals.totalSales}</div>
          <p className="mt-1 text-xs text-gray-500">
            De um total de {totals.totalQuotes} cotações/propostas geradas
          </p>
        </div>

        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {source === 'duolife' ? 'Parceiros com Venda' : 'Produtores com Venda'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">
            {totals.totalPartnersProducing}{' '}
            <span className="text-sm font-normal text-gray-500">/ {totals.totalPartnersActive}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {totals.totalPartnersActive > 0
              ? `${Math.round((totals.totalPartnersProducing / totals.totalPartnersActive) * 100)}% dos produtores com fechamento`
              : 'Nenhum produtor no período'}
          </p>
        </div>

        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ticket Médio</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(totals.averageTicket)}</div>
          <p className="mt-1 text-xs text-gray-500">
            Conversão geral: {formatPercent(totals.overallConversionRate)}
            {totals.totalPending > 0 && ` • ${totals.totalPending} pendentes`}
          </p>
        </div>
      </div>

      {/* Pódio Top 3 (Campeões do Período) */}
      {podium.length > 0 && (podium[0].salesCount > 0 || podium[0].premiumTotal > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="text-amber-500" size={20} />
              <h2 className="text-base font-bold text-gray-900">
                Pódio dos Líderes de Produção ({source === 'duolife' ? 'DuoLife' : source === 'wix' ? 'Wix Import1' : 'Consolidado'})
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* 1º Lugar */}
            {podium[0] && (
              <div className="card relative overflow-hidden border-2 border-amber-300 bg-gradient-to-b from-amber-50/80 via-white to-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-amber-400/10 rounded-full flex items-center justify-center text-amber-500">
                  <Trophy size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-black tracking-wider uppercase">
                      1º Lugar 🥇
                    </span>
                    {podium[0].partnerCode && (
                      <span className="text-[11px] font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        ref:{podium[0].partnerCode}
                      </span>
                    )}
                    {!podium[0].isLinkedToDuoLife && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                        Wix
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-black text-gray-900 line-clamp-1">{podium[0].partnerName}</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{podium[0].razaoSocial}</p>

                  <div className="mt-4 pt-4 border-t border-amber-200/60 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-gray-500 block">Volume Total</span>
                      <span className="text-base font-black text-gray-900">{formatCurrency(podium[0].premiumTotal)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Negócios Fechados</span>
                      <span className="text-base font-black text-gray-900">{podium[0].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[0].conversionRate)}</strong></span>
                  {podium[0].partnerId ? (
                    <Link
                      href={`/admin/parceiros/${podium[0].partnerId}`}
                      className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      Ver Corretora <ArrowUpRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-gray-400 text-[11px]">Origem Wix Import1</span>
                  )}
                </div>
              </div>
            )}

            {/* 2º Lugar */}
            {podium[1] && (
              <div className="card relative overflow-hidden border border-slate-300 bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-slate-300/20 rounded-full flex items-center justify-center text-slate-400">
                  <Medal size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-600 text-white text-xs font-black tracking-wider uppercase">
                      2º Lugar 🥈
                    </span>
                    {podium[1].partnerCode && (
                      <span className="text-[11px] font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        ref:{podium[1].partnerCode}
                      </span>
                    )}
                    {!podium[1].isLinkedToDuoLife && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                        Wix
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-black text-gray-900 line-clamp-1">{podium[1].partnerName}</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{podium[1].razaoSocial}</p>

                  <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-gray-500 block">Volume Total</span>
                      <span className="text-base font-black text-gray-900">{formatCurrency(podium[1].premiumTotal)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Negócios Fechados</span>
                      <span className="text-base font-black text-gray-900">{podium[1].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[1].conversionRate)}</strong></span>
                  {podium[1].partnerId ? (
                    <Link
                      href={`/admin/parceiros/${podium[1].partnerId}`}
                      className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      Ver Corretora <ArrowUpRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-gray-400 text-[11px]">Origem Wix Import1</span>
                  )}
                </div>
              </div>
            )}

            {/* 3º Lugar */}
            {podium[2] && (
              <div className="card relative overflow-hidden border border-amber-200 bg-gradient-to-b from-orange-50/50 via-white to-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-amber-600/10 rounded-full flex items-center justify-center text-amber-700">
                  <Award size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-700 text-white text-xs font-black tracking-wider uppercase">
                      3º Lugar 🥉
                    </span>
                    {podium[2].partnerCode && (
                      <span className="text-[11px] font-mono text-amber-900 bg-orange-100 px-2 py-0.5 rounded">
                        ref:{podium[2].partnerCode}
                      </span>
                    )}
                    {!podium[2].isLinkedToDuoLife && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                        Wix
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-black text-gray-900 line-clamp-1">{podium[2].partnerName}</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{podium[2].razaoSocial}</p>

                  <div className="mt-4 pt-4 border-t border-orange-200 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-gray-500 block">Volume Total</span>
                      <span className="text-base font-black text-gray-900">{formatCurrency(podium[2].premiumTotal)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500 block">Negócios Fechados</span>
                      <span className="text-base font-black text-gray-900">{podium[2].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[2].conversionRate)}</strong></span>
                  {podium[2].partnerId ? (
                    <Link
                      href={`/admin/parceiros/${podium[2].partnerId}`}
                      className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      Ver Corretora <ArrowUpRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-gray-400 text-[11px]">Origem Wix Import1</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tabela Completa de Classificação */}
      <section className="card no-hover p-0 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">Classificação Geral da Rede</h2>
            <p className="admin-section-copy">
              Listagem ordenada por volume em prêmios fechados no período selecionado.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full self-start md:self-auto">
            {ranking.length} produtores analisados
          </span>
        </div>

        {ranking.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <p>Nenhum registro de produção encontrado para os filtros selecionados.</p>
            {source === 'wix' && period.monthKey !== 'all' && (
              <p className="text-xs text-amber-700">
                Dica: O banco histórico do Wix abrange os anos anteriores. Tente selecionar <strong>&quot;Todo o Histórico&quot;</strong> no filtro de período acima.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold text-center w-14">#</th>
                  <th className="px-4 py-3 font-semibold">Parceiro / CodigoVenda</th>
                  <th className="px-4 py-3 font-semibold text-center">Cotações / Propostas</th>
                  <th className="px-4 py-3 font-semibold text-center">Fechados</th>
                  <th className="px-4 py-3 font-semibold text-center">Pendentes</th>
                  <th className="px-4 py-3 font-semibold text-center">Conversão</th>
                  <th className="px-4 py-3 font-semibold text-right">Volume Emitido</th>
                  {source === 'duolife' && (
                    <th className="px-4 py-3 font-semibold text-right">Comissões</th>
                  )}
                  {source === 'consolidated' && (
                    <th className="px-4 py-3 font-semibold text-center">Detalhamento</th>
                  )}
                  <th className="px-4 py-3 font-semibold text-right">Ticket Médio</th>
                  <th className="px-4 py-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranking.map((row: AdminRankingRow) => {
                  const isTop1 = row.posicao === 1 && (row.salesCount > 0 || row.premiumTotal > 0);
                  const isTop2 = row.posicao === 2 && (row.salesCount > 0 || row.premiumTotal > 0);
                  const isTop3 = row.posicao === 3 && (row.salesCount > 0 || row.premiumTotal > 0);

                  return (
                    <tr
                      key={`${row.partnerCode}-${row.partnerId || row.partnerName}`}
                      className={`table-row ${
                        isTop1
                          ? 'bg-amber-50/30'
                          : isTop2
                          ? 'bg-slate-50/40'
                          : isTop3
                          ? 'bg-orange-50/20'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 text-center">
                        {isTop1 ? (
                          <span className="w-7 h-7 rounded-full bg-amber-400 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">
                            1
                          </span>
                        ) : isTop2 ? (
                          <span className="w-7 h-7 rounded-full bg-slate-500 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">
                            2
                          </span>
                        ) : isTop3 ? (
                          <span className="w-7 h-7 rounded-full bg-amber-700 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">
                            3
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-gray-500">{row.posicao}º</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                          <span>{row.partnerName}</span>
                          {row.isLinkedToDuoLife ? (
                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              DuoLife
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Wix Import1
                            </span>
                          )}
                          {row.partnerCode && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              ref:{row.partnerCode}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1">{row.razaoSocial}</div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-medium text-gray-700">
                        {row.quotesCount}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                            row.salesCount > 0
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'text-gray-500'
                          }`}
                        >
                          {row.salesCount}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs font-medium text-gray-600">
                        {row.pendingCount > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            {row.pendingCount}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs font-semibold text-gray-600">
                        {formatPercent(row.conversionRate)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                        {formatCurrency(row.premiumTotal)}
                      </td>

                      {source === 'duolife' && (
                        <td className="px-4 py-3.5 text-right text-xs font-medium text-gray-600">
                          {formatCurrency(row.commissionTotal)}
                        </td>
                      )}

                      {source === 'consolidated' && (
                        <td className="px-4 py-3.5 text-center text-[11px] text-gray-500">
                          <div className="inline-flex flex-col text-left">
                            <span>DuoLife: <strong>{row.duolifeSalesCount || 0}</strong> ({formatCurrency(row.duolifePremiumTotal || 0)})</span>
                            <span>Wix: <strong>{row.wixSalesCount || 0}</strong> ({formatCurrency(row.wixPremiumTotal || 0)})</span>
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-3.5 text-right text-xs text-gray-600">
                        {formatCurrency(row.ticketMedio)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {row.partnerId ? (
                          <Link
                            href={`/admin/parceiros/${row.partnerId}`}
                            className="btn btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                          >
                            Detalhes
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/parceiros?novo=1&codigo=${encodeURIComponent(row.partnerCode)}`}
                            className="btn btn-outline py-1 px-2.5 text-xs inline-flex items-center gap-1 text-[#0e4a5a]"
                            title="Cadastrar corretora no DuoLife com este código de indicação"
                          >
                            <PlusCircle size={12} /> Cadastrar
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
