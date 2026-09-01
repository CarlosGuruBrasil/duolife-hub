import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trophy, Medal, Award, TrendingUp, Users, Shield, DollarSign, ArrowUpRight } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getAdminRankingData, getRecentMonthOptions, type AdminRankingRow } from '@/lib/admin-reporting';
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

  const [data, monthOptions] = await Promise.all([
    getAdminRankingData(monthParam, startParam, endParam),
    Promise.resolve(getRecentMonthOptions(24)),
  ]);

  const { totals, podium, ranking, period } = data;

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
          <p className="mt-1 text-xs text-gray-500">Prêmios de seguros e serviços</p>
        </div>

        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Apólices Emitidas</span>
            <div className="w-8 h-8 rounded-lg bg-[#0e4a5a]/10 text-[#0e4a5a] flex items-center justify-center">
              <Shield size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{totals.totalSales}</div>
          <p className="mt-1 text-xs text-gray-500">
            De um total de {totals.totalQuotes} cotações geradas
          </p>
        </div>

        <div className="card no-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Parceiros com Venda</span>
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
              ? `${Math.round((totals.totalPartnersProducing / totals.totalPartnersActive) * 100)}% da rede ativa`
              : 'Nenhum parceiro cadastrado'}
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
          </p>
        </div>
      </div>

      {/* Pódio Top 3 (Campeões do Período) */}
      {podium.length > 0 && (podium[0].salesCount > 0 || podium[0].premiumTotal > 0) && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="text-amber-500" size={20} />
            <h2 className="text-base font-bold text-gray-900">Pódio dos Líderes de Produção</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* 1º Lugar */}
            {podium[0] && (
              <div className="card relative overflow-hidden border-2 border-amber-300 bg-gradient-to-b from-amber-50/80 via-white to-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-amber-400/10 rounded-full flex items-center justify-center text-amber-500">
                  <Trophy size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-black tracking-wider uppercase">
                      1º Lugar 🥇
                    </span>
                    {podium[0].partnerCode && (
                      <span className="text-[11px] font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        ref:{podium[0].partnerCode}
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
                      <span className="text-[11px] text-gray-500 block">Apólices</span>
                      <span className="text-base font-black text-gray-900">{podium[0].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[0].conversionRate)}</strong></span>
                  <Link
                    href={`/admin/parceiros/${podium[0].partnerId}`}
                    className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Ver Corretora <ArrowUpRight size={13} />
                  </Link>
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
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-600 text-white text-xs font-black tracking-wider uppercase">
                      2º Lugar 🥈
                    </span>
                    {podium[1].partnerCode && (
                      <span className="text-[11px] font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        ref:{podium[1].partnerCode}
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
                      <span className="text-[11px] text-gray-500 block">Apólices</span>
                      <span className="text-base font-black text-gray-900">{podium[1].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[1].conversionRate)}</strong></span>
                  <Link
                    href={`/admin/parceiros/${podium[1].partnerId}`}
                    className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Ver Corretora <ArrowUpRight size={13} />
                  </Link>
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
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-700 text-white text-xs font-black tracking-wider uppercase">
                      3º Lugar 🥉
                    </span>
                    {podium[2].partnerCode && (
                      <span className="text-[11px] font-mono text-amber-900 bg-orange-100 px-2 py-0.5 rounded">
                        ref:{podium[2].partnerCode}
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
                      <span className="text-[11px] text-gray-500 block">Apólices</span>
                      <span className="text-base font-black text-gray-900">{podium[2].salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Conversão: <strong className="text-gray-800">{formatPercent(podium[2].conversionRate)}</strong></span>
                  <Link
                    href={`/admin/parceiros/${podium[2].partnerId}`}
                    className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Ver Corretora <ArrowUpRight size={13} />
                  </Link>
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
              Listagem ordenada por volume em prêmios emitidos no período selecionado.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full self-start md:self-auto">
            {ranking.length} corretoras avaliadas
          </span>
        </div>

        {ranking.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Nenhum parceiro encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold text-center w-14">#</th>
                  <th className="px-4 py-3 font-semibold">Parceiro / Corretora</th>
                  <th className="px-4 py-3 font-semibold text-center">Cotações</th>
                  <th className="px-4 py-3 font-semibold text-center">Apólices</th>
                  <th className="px-4 py-3 font-semibold text-center">Conversão</th>
                  <th className="px-4 py-3 font-semibold text-right">Volume Emitido</th>
                  <th className="px-4 py-3 font-semibold text-right">Comissões</th>
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
                      key={row.partnerId}
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
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                          <span>{row.partnerName}</span>
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {row.personType}
                          </span>
                          {row.partnerCode && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
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
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          row.salesCount > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-gray-500'
                        }`}>
                          {row.salesCount}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs font-semibold text-gray-600">
                        {formatPercent(row.conversionRate)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                        {formatCurrency(row.premiumTotal)}
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs font-medium text-gray-600">
                        {formatCurrency(row.commissionTotal)}
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs text-gray-600">
                        {formatCurrency(row.ticketMedio)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <Link
                          href={`/admin/parceiros/${row.partnerId}`}
                          className="btn btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                        >
                          Detalhes
                        </Link>
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
