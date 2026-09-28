import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getAdminDashboardData, getRecentMonthOptions } from '@/lib/admin-reporting';
import { formatStatusLabel } from '@/lib/format';
import AdminPeriodFilterBar from './_components/AdminPeriodFilterBar';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function monthHref(value: string) {
  return `/admin?month=${value}`;
}

function statusBadge(status: string) {
  const s = String(status || '').toLowerCase();
  const tone = ['ativa', 'active', 'aprovada', 'approved', 'paga', 'pago', 'paid', 'assinado', 'signed', 'confirmado', 'confirmed', 'recebido', 'received'].includes(s)
    ? 'is-success'
    : ['pendente', 'pending', 'pagamento_gerado', 'contrato_gerado', 'waiting_signatures'].includes(s)
      ? 'is-warning'
      : 'is-neutral';
  return `admin-status-badge ${tone}`;
}

function buildRankingHref(monthParam?: string, startParam?: string, endParam?: string) {
  const p = new URLSearchParams();
  if (monthParam) p.set('month', monthParam);
  if (startParam) p.set('start', startParam);
  if (endParam) p.set('end', endParam);
  const q = p.toString();
  return `/admin/ranking${q ? `?${q}` : ''}`;
}

export default async function AdminDashboard({
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
    getAdminDashboardData(monthParam, startParam, endParam),
    Promise.resolve(getRecentMonthOptions(24)),
  ]);
  const funnelMax = Math.max(...data.funnel.map((item) => item.count), 1);

  return (
    <div className="space-y-6 font-sans">
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">DASHBOARD</span>
          <h1 className="admin-page-title">Visão geral</h1>
          <p className="admin-page-copy">
            Acompanhe cotações, emissões, cobranças, comissões e a operação da DuoLife em tempo real.
          </p>
        </div>
      </section>

      {/* Bar de Filtros Escalável de Período */}
      <AdminPeriodFilterBar
        currentMonthKey={data.period.monthKey}
        monthOptions={monthOptions}
        baseUrl="/admin"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.metricCards.map((card) => (
          <div key={card.title} className={`admin-metric-card tone-${card.tone}`}>
            <div className="admin-metric-label">{card.title}</div>
            <div className="admin-metric-value">{card.value}</div>
            <div className="admin-metric-hint">{card.hint}</div>
          </div>
        ))}
      </section>

      <section className="card no-hover">
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Funil comercial do período</h2>
            <p className="admin-section-copy">Acompanhe travas de assinatura, cobrança e conversão em emissão.</p>
          </div>
        </div>
        <div className="space-y-4">
          {data.funnel.map((stage) => (
            <div key={stage.status}>
              <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-[var(--primary)]">{stage.label}</span>
                <span className="text-[var(--text-secondary)]">{stage.count}</span>
              </div>
              <div className="admin-progress-track">
                <div
                  className="admin-progress-bar"
                  style={{ width: `${Math.max((stage.count / funnelMax) * 100, stage.count > 0 ? 12 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Performance por produto</h2>
              <p className="admin-section-copy">Leitura consolidada por produto.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 font-semibold">Cotações</th>
                  <th className="px-4 py-3 font-semibold">Vendas</th>
                  <th className="px-4 py-3 font-semibold">Prêmio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.productPerformance.map((row) => (
                  <tr key={row.productName} className="table-row">
                    <td className="px-4 py-3 font-semibold">{row.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{row.quotesCount}</td>
                    <td className="px-4 py-3 text-gray-600">{row.salesCount}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(row.premiumTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="admin-section-title">Parceiros em destaque</h2>
                <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {data.period.label}
                </span>
              </div>
              <p className="admin-section-copy">Produção de vendas e cotações fechadas no período filtrado.</p>
            </div>
            <Link
              href={buildRankingHref(monthParam, startParam, endParam)}
              className="text-xs font-bold text-[#0e4a5a] hover:text-[#00a0af] transition-colors flex items-center gap-1 shrink-0"
            >
              Ranking completo &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {data.partnerPerformance.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-500">
                Ainda não há movimento de parceiros no período selecionado ({data.period.label}).
              </div>
            ) : (
              data.partnerPerformance.map((row, index) => {
                const rank = index + 1;
                const badgeStyle =
                  rank === 1
                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                    : rank === 2
                    ? 'bg-slate-100 text-slate-800 border-slate-300 font-bold'
                    : rank === 3
                    ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                    : 'bg-gray-50 text-gray-600 border-gray-200 font-medium';

                return (
                  <div
                    key={`${row.partnerId || 'direct'}-${row.partnerName}`}
                    className="admin-inline-stat hover:border-gray-300 transition-all p-3 rounded-xl border border-gray-100 bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs border ${badgeStyle} shrink-0`}
                        title={`${rank}º lugar em produção no período`}
                      >
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}º`}
                      </span>
                      <div className="min-w-0">
                        {row.partnerId ? (
                          <Link
                            href={`/admin/parceiros/${row.partnerId}`}
                            className="admin-inline-stat-label hover:text-[#00a0af] transition-colors hover:underline truncate block"
                          >
                            {row.partnerName}
                          </Link>
                        ) : (
                          <div className="admin-inline-stat-label truncate">{row.partnerName}</div>
                        )}
                        <div className="admin-inline-stat-copy">
                          {row.quotesCount} {row.quotesCount === 1 ? 'cotação' : 'cotações'} •{' '}
                          <span className="font-semibold text-gray-700">
                            {row.salesCount} {row.salesCount === 1 ? 'venda' : 'vendas'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="admin-inline-stat-value font-black text-[#0e4a5a]">
                        {formatCurrency(row.premiumTotal)}
                      </div>
                      <div className="admin-inline-stat-copy">
                        {formatCurrency(row.commissionPending)} em comissão
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Últimos eventos operacionais</h2>
              <p className="admin-section-copy">Atividades recentes da operação.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.recentEvents.map((event) => (
              <div key={`${event.type}-${event.id}`} className="admin-event-row">
                <div>
                  <div className="admin-inline-stat-label">{event.title}</div>
                  <div className="admin-inline-stat-copy">{event.subtitle}</div>
                </div>
                <div className="text-right">
                  <div className={statusBadge(event.status)}>{formatStatusLabel(event.status)}</div>
                  <div className="mt-1 text-xs text-[var(--text-light)]">{formatDateTime(event.createdAt)}</div>
                  {event.amount !== null && (
                    <div className="mt-1 text-sm font-semibold text-[var(--primary)]">{formatCurrency(event.amount)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Saúde das integrações</h2>
              <p className="admin-section-copy">Eventos recentes das integrações externas.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.syncHealth.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">
                Nenhum evento de sincronização registrado no período selecionado.
              </div>
            ) : (
              data.syncHealth.map((row) => (
                <div key={row.sourceSystem} className="admin-inline-stat">
                  <div>
                    <div className="admin-inline-stat-label">{row.sourceSystem}</div>
                    <div className="admin-inline-stat-copy">
                      {row.successCount} sucessos • {row.failedCount} falhas
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="admin-inline-stat-value">{row.total}</div>
                    <div className="admin-inline-stat-copy">
                      {row.lastEventAt ? formatDateTime(row.lastEventAt) : 'Sem execução'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
