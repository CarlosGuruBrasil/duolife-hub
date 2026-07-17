import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getAdminDashboardData, getRecentMonthOptions } from '@/lib/admin-reporting';

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
  const tone = status === 'ativa' || status === 'aprovada' || status === 'paga'
    ? 'is-success'
    : status === 'pendente' || status === 'pagamento_gerado' || status === 'contrato_gerado'
      ? 'is-warning'
      : 'is-neutral';
  return `admin-status-badge ${tone}`;
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
  const [data, monthOptions] = await Promise.all([
    getAdminDashboardData(monthParam),
    Promise.resolve(getRecentMonthOptions(6)),
  ]);
  const funnelMax = Math.max(...data.funnel.map((item) => item.count), 1);

  return (
    <div className="space-y-6">
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">Dashboard</span>
          <h1 className="admin-page-title">Painel operacional RC de {user.name.split(' ')[0]}</h1>
          <p className="admin-page-copy">
            Mesmo teor de gestao da Net4Life, mas focado em cotacoes, emissao, cobranca, comissao e sincronizacao da DuoLife.
          </p>
        </div>
        <div className="admin-pill-row">
          {monthOptions.map((option) => (
            <Link
              key={option.value}
              href={monthHref(option.value)}
              className={`admin-filter-pill ${option.value === data.period.monthKey ? 'is-active' : ''}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.metricCards.map((card) => (
          <div key={card.title} className={`admin-metric-card tone-${card.tone}`}>
            <div className="admin-metric-label">{card.title}</div>
            <div className="admin-metric-value">{card.value}</div>
            <div className="admin-metric-hint">{card.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Funil comercial do periodo</h2>
              <p className="admin-section-copy">Ajuda a enxergar travas de assinatura, cobranca e conversao para emissao.</p>
            </div>
            <Link href="/admin/relatorios" className="btn-outline px-4 py-2">
              Abrir relatorio completo
            </Link>
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
        </div>

        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Acoes rapidas</h2>
              <p className="admin-section-copy">Entradas de operacao que o time usa todos os dias.</p>
            </div>
          </div>
          <div className="grid gap-3">
            <Link href="/admin/cotacoes" className="admin-action-link">
              <span>Producao comercial</span>
              <small>Ver cotacoes, assinatura e cobranca</small>
            </Link>
            <Link href="/admin/vendas" className="admin-action-link">
              <span>Apolices emitidas</span>
              <small>Acompanhar premio, vigencia e volume</small>
            </Link>
            <Link href="/admin/comissoes" className="admin-action-link">
              <span>Comissoes</span>
              <small>Validar pendencias e pagamentos</small>
            </Link>
            <Link href="/admin/sync" className="admin-action-link">
              <span>Sincronizacao Wix</span>
              <small>Monitorar espelhamento e historico</small>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Performance por produto</h2>
              <p className="admin-section-copy">Pronto para crescer alem do RC sem perder a leitura consolidada.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 font-semibold">Cotacoes</th>
                  <th className="px-4 py-3 font-semibold">Vendas</th>
                  <th className="px-4 py-3 font-semibold">Premio</th>
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
              <h2 className="admin-section-title">Parceiros em destaque</h2>
              <p className="admin-section-copy">Quem esta puxando a producao e onde ha comissao represada.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.partnerPerformance.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">
                Ainda nao ha movimento de parceiros neste periodo.
              </div>
            ) : (
              data.partnerPerformance.map((row) => (
                <div key={`${row.partnerId || 'direct'}-${row.partnerName}`} className="admin-inline-stat">
                  <div>
                    <div className="admin-inline-stat-label">{row.partnerName}</div>
                    <div className="admin-inline-stat-copy">
                      {row.quotesCount} cotacoes • {row.salesCount} vendas
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="admin-inline-stat-value">{formatCurrency(row.premiumTotal)}</div>
                    <div className="admin-inline-stat-copy">{formatCurrency(row.commissionPending)} em comissao pendente</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Ultimos eventos operacionais</h2>
              <p className="admin-section-copy">Linha de atividade semelhante ao ritmo do dashboard da Net4Life.</p>
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
                  <div className={statusBadge(event.status)}>{event.status}</div>
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
              <h2 className="admin-section-title">Saude das integracoes</h2>
              <p className="admin-section-copy">Wix, CRM e demais trilhas externas monitoradas no mesmo painel.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.syncHealth.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">
                Nenhum evento de sync registrado no periodo selecionado.
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
                      {row.lastEventAt ? formatDateTime(row.lastEventAt) : 'Sem execucao'}
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
