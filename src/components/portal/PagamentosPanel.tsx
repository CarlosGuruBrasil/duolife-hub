'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';

interface Installment {
  id: string;
  installment_number: number;
  status: string;
  amount: string;
  due_date: string;
  bank_slip_url: string | null;
}

interface Order {
  id: string;
  status: string;
  amount_total: string;
  installment_count: number;
  billing_type: string;
}

interface AsaasCharge {
  id: string;
  installment: string | null;
  installmentNumber: number | null;
  description: string | null;
  billingType: string;
  status: string;
  value: number;
  netValue: number | null;
  dueDate: string | null;
  paymentDate: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
  deleted: boolean;
}

interface AsaasLookup {
  ok: boolean;
  error?: string;
  customerIds: string[];
  charges: AsaasCharge[];
  truncated: boolean;
  currentIds: string[];
}

const statusLabel: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  received: 'Recebido',
  confirmed: 'Confirmado',
  partially_paid: 'Parcialmente pago',
  overdue: 'Vencido',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

const billingTypeLabel: Record<string, string> = {
  boleto: 'boleto',
  BOLETO: 'boleto',
  pix: 'Pix',
  PIX: 'Pix',
  credit_card: 'cartão de crédito',
  CREDIT_CARD: 'cartão de crédito',
  UNDEFINED: 'não definido',
};

const asaasStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  RECEIVED: 'Recebida',
  CONFIRMED: 'Confirmada',
  OVERDUE: 'Vencida',
  REFUNDED: 'Estornada',
  RECEIVED_IN_CASH: 'Recebida em dinheiro',
  REFUND_REQUESTED: 'Estorno solicitado',
  REFUND_IN_PROGRESS: 'Estorno em andamento',
  CHARGEBACK_REQUESTED: 'Chargeback solicitado',
  CHARGEBACK_DISPUTE: 'Chargeback em disputa',
  AWAITING_CHARGEBACK_REVERSAL: 'Aguardando reversão',
  DUNNING_REQUESTED: 'Em negativação',
  DUNNING_RECEIVED: 'Negativação recebida',
  AWAITING_RISK_ANALYSIS: 'Em análise de risco',
  PAYMENT_DELETED: 'Removida',
};

const asaasStatusTone: Record<string, string> = {
  RECEIVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  RECEIVED_IN_CASH: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  AWAITING_RISK_ANALYSIS: 'bg-amber-50 text-amber-800 border-amber-200',
  OVERDUE: 'bg-rose-50 text-rose-800 border-rose-200',
  DUNNING_REQUESTED: 'bg-rose-50 text-rose-800 border-rose-200',
  REFUNDED: 'bg-gray-100 text-gray-700 border-gray-200',
  PAYMENT_DELETED: 'bg-gray-100 text-gray-700 border-gray-200',
};

function chargeLabel(charge: AsaasCharge): string {
  if (charge.installmentNumber) return `Parcela ${charge.installmentNumber}`;
  if (charge.description) return charge.description;
  return charge.id;
}

export function PagamentosPanel({
  cotacaoId,
  liveAsaas = false,
}: {
  cotacaoId: string;
  /** Admin: consulta as cobranças do cliente direto na API do Asaas. */
  liveAsaas?: boolean;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [installments, setInstallments] = useState<Installment[] | null>(null);
  const [error, setError] = useState('');

  const [asaas, setAsaas] = useState<AsaasLookup | null>(null);
  const [asaasLoading, setAsaasLoading] = useState(liveAsaas);
  const [asaasError, setAsaasError] = useState('');

  useEffect(() => {
    fetch(`/api/portal/cotacoes/${cotacaoId}/pagamentos`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || 'Erro ao carregar pagamentos');
          return;
        }
        setOrders(data.orders);
        setInstallments(data.installments);
      })
      .catch(() => setError('Erro ao carregar pagamentos'));
  }, [cotacaoId]);

  const loadAsaas = useCallback(() => {
    setAsaasLoading(true);
    setAsaasError('');
    fetch(`/api/admin/cotacoes/${cotacaoId}/asaas-cobrancas`)
      .then((res) => res.json())
      .then((data: AsaasLookup) => {
        if (!data.ok) {
          setAsaasError(data.error || 'Não foi possível consultar o Asaas.');
          return;
        }
        setAsaas(data);
        if (data.error) setAsaasError(data.error);
      })
      .catch(() => setAsaasError('Não foi possível consultar o Asaas.'))
      .finally(() => setAsaasLoading(false));
  }, [cotacaoId]);

  useEffect(() => {
    if (liveAsaas) loadAsaas();
  }, [liveAsaas, loadAsaas]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!orders) return <p className="text-sm text-gray-500">Carregando pagamentos...</p>;

  const hasLiveCharges = !!asaas && asaas.charges.length > 0;

  return (
    <div className="space-y-5">
      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma cobrança gerada para esta cotação ainda.</p>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="text-sm text-gray-700">
            Cobrança por <strong>{billingTypeLabel[order.billing_type] || order.billing_type}</strong> — {formatCurrency(order.amount_total)} em {order.installment_count}x — status <strong>{statusLabel[order.status] || order.status}</strong>
          </div>
        ))
      )}

      {liveAsaas && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Cobranças do cliente no Asaas
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Consulta em tempo real — os links abaixo são gerados agora e não expiram como os importados.
                {asaas && asaas.customerIds.length > 0 && (
                  <> Cliente: <span className="font-mono">{asaas.customerIds.join(', ')}</span></>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={loadAsaas}
              disabled={asaasLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors min-h-[36px]"
            >
              <RefreshCw size={13} className={asaasLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          {asaasError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3">
              {asaasError}
            </div>
          )}

          {asaasLoading && !asaas && (
            <p className="text-sm text-gray-500">Consultando o Asaas...</p>
          )}

          {hasLiveCharges && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-500">
                      <th className="py-2 pr-3">Cobrança</th>
                      <th className="py-2 pr-3">Tipo</th>
                      <th className="py-2 pr-3">Valor</th>
                      <th className="py-2 pr-3">Vencimento</th>
                      <th className="py-2 pr-3">Pagamento</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {asaas!.charges.map((charge) => {
                      const isCurrent =
                        asaas!.currentIds.includes(charge.id) ||
                        (!!charge.installment && asaas!.currentIds.includes(charge.installment));
                      const invoice = safeExternalUrl(charge.invoiceUrl);
                      const slip = safeExternalUrl(charge.bankSlipUrl);
                      const receipt = safeExternalUrl(charge.transactionReceiptUrl);

                      return (
                        <tr key={charge.id} className={isCurrent ? 'bg-emerald-50/60' : undefined}>
                          <td className="py-2 pr-3">
                            <span className="font-semibold text-gray-900">{chargeLabel(charge)}</span>
                            {isCurrent && (
                              <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                                esta cotação
                              </span>
                            )}
                            <span className="block font-mono text-[10px] text-gray-400">{charge.id}</span>
                          </td>
                          <td className="py-2 pr-3 text-gray-700">
                            {billingTypeLabel[charge.billingType] || charge.billingType}
                          </td>
                          <td className="py-2 pr-3 text-gray-900">{formatCurrency(charge.value)}</td>
                          <td className="py-2 pr-3 text-gray-700">{formatDate(charge.dueDate)}</td>
                          <td className="py-2 pr-3 text-gray-700">{formatDate(charge.paymentDate)}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${
                                asaasStatusTone[charge.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {asaasStatusLabel[charge.status] || charge.status}
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {invoice && (
                                <a href={invoice} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold hover:underline">
                                  Fatura
                                </a>
                              )}
                              {slip && (
                                <a href={slip} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold hover:underline">
                                  Boleto
                                </a>
                              )}
                              {receipt && (
                                <a href={receipt} target="_blank" rel="noreferrer" className="text-gray-600 hover:underline">
                                  Comprovante
                                </a>
                              )}
                              {!invoice && !slip && !receipt && <span className="text-gray-400">-</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {asaas!.truncated && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Listagem truncada — o cliente tem mais cobranças do que o limite consultado.
                </p>
              )}
            </>
          )}

          {asaas && asaas.charges.length === 0 && !asaasError && (
            <p className="text-sm text-gray-500">Nenhuma cobrança encontrada no Asaas para este cliente.</p>
          )}
        </div>
      )}

      {installments && installments.length > 0 && (
        <details className="group" open={!hasLiveCharges}>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-600 hover:text-gray-900">
            Parcelas registradas no DuoLife ({installments.length})
          </summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500">
                  <th className="py-2 pr-3">Parcela</th>
                  <th className="py-2 pr-3">Valor</th>
                  <th className="py-2 pr-3">Vencimento</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Boleto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {installments.map((inst) => (
                  <tr key={inst.id}>
                    <td className="py-2 pr-3 text-gray-900">{inst.installment_number}</td>
                    <td className="py-2 pr-3 text-gray-900">{formatCurrency(inst.amount)}</td>
                    <td className="py-2 pr-3 text-gray-700">{formatDate(inst.due_date)}</td>
                    <td className="py-2 pr-3 text-gray-700">{statusLabel[inst.status] || inst.status}</td>
                    <td className="py-2">
                      {safeExternalUrl(inst.bank_slip_url) ? (
                        <a
                          href={safeExternalUrl(inst.bank_slip_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-600 hover:underline"
                          title="Link gravado na importação — pode ter expirado"
                        >
                          Link salvo
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
