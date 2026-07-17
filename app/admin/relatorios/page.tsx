import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getAdminReportData, getRecentMonthOptions } from '@/lib/admin-reporting';

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
  return `/admin/relatorios?month=${value}`;
}

export default async function AdminRelatoriosPage({
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
    getAdminReportData(monthParam),
    Promise.resolve(getRecentMonthOptions(6)),
  ]);

  return (
    <div className="space-y-6">
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">Relatorios</span>
          <h1 className="admin-page-title">Geral detalhado da operacao RC</h1>
          <p className="admin-page-copy">
            Consolidacao de producao, financeiro, cobranca e saude de sincronizacao para {data.period.label}.
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

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Cotacoes por status</h2>
              <p className="admin-section-copy">Entenda onde a producao esta concentrada e o volume financeiro em cada etapa.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Qtde.</th>
                  <th className="px-4 py-3 font-semibold">Premio estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.quoteStatuses.map((row) => (
                  <tr key={row.status} className="table-row">
                    <td className="px-4 py-3 font-semibold">{row.status}</td>
                    <td className="px-4 py-3 text-gray-600">{row.count}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(row.premioTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Cobranca e recebimento</h2>
              <p className="admin-section-copy">Mostra o comportamento das ordens financeiras abertas no periodo.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.paymentStatuses.map((row) => (
              <div key={row.status} className="admin-inline-stat">
                <div>
                  <div className="admin-inline-stat-label">{row.status}</div>
                  <div className="admin-inline-stat-copy">{row.ordersCount} ordens</div>
                </div>
                <div className="text-right">
                  <div className="admin-inline-stat-value">{formatCurrency(row.amountTotal)}</div>
                  <div className="admin-inline-stat-copy">{formatCurrency(row.paidAmount)} recebidos</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card no-hover">
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Parceiros e performance</h2>
            <p className="admin-section-copy">Leitura operacional semelhante a Net4Life, mas focada em RC, premio, cobranca e comissao.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 font-semibold">Parceiro</th>
                <th className="px-4 py-3 font-semibold">Cotacoes</th>
                <th className="px-4 py-3 font-semibold">Vendas</th>
                <th className="px-4 py-3 font-semibold">Premio</th>
                <th className="px-4 py-3 font-semibold">Recebido</th>
                <th className="px-4 py-3 font-semibold">Comissao pendente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.partnerRows.map((row) => (
                <tr key={`${row.partnerId || 'direct'}-${row.partnerName}`} className="table-row">
                  <td className="px-4 py-3 font-semibold">{row.partnerName}</td>
                  <td className="px-4 py-3 text-gray-600">{row.quotesCount}</td>
                  <td className="px-4 py-3 text-gray-600">{row.salesCount}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(row.premiumTotal)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(row.paidAmount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(row.pendingCommission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Pendencias financeiras</h2>
              <p className="admin-section-copy">Casos que exigem cobranca ativa ou revisao operacional.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.overduePayments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">
                Nenhuma pendencia critica encontrada neste momento.
              </div>
            ) : (
              data.overduePayments.map((row) => (
                <div key={`${row.clientName}-${row.dueDate || row.status}`} className="admin-inline-stat">
                  <div>
                    <div className="admin-inline-stat-label">{row.clientName}</div>
                    <div className="admin-inline-stat-copy">{row.partnerName} • {row.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="admin-inline-stat-value">{formatCurrency(row.amountTotal)}</div>
                    <div className="admin-inline-stat-copy">{row.dueDate ? formatDateTime(`${row.dueDate}T12:00:00`) : 'Sem vencimento'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card no-hover">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Falhas de sincronizacao</h2>
              <p className="admin-section-copy">Monitoramento das integracoes externas para manter rastreabilidade operacional.</p>
            </div>
          </div>
          <div className="space-y-3">
            {data.syncErrors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">
                Nenhuma falha registrada nas integracoes deste periodo.
              </div>
            ) : (
              data.syncErrors.map((row) => (
                <div key={`${row.sourceSystem}-${row.createdAt}-${row.eventType}`} className="rounded-2xl border border-[var(--border)] bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--primary)]">
                        {row.sourceSystem} • {row.eventType}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-light)]">
                        {row.entityType}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-light)]">{formatDateTime(row.createdAt)}</div>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    {row.errorMessage || 'Falha sem mensagem detalhada registrada.'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
