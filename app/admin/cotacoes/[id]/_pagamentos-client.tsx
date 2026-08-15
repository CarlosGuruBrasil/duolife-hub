'use client';

import { useEffect, useState } from 'react';

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

function formatCurrency(value: string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PagamentosPanel({ cotacaoId }: { cotacaoId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [installments, setInstallments] = useState<Installment[] | null>(null);
  const [error, setError] = useState('');

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

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!orders) return <p className="text-sm text-gray-500">Carregando pagamentos...</p>;

  if (orders.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma cobrança gerada para esta cotação ainda.</p>;
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order.id} className="text-sm text-gray-700">
          Cobrança <strong>{order.billing_type}</strong> — {formatCurrency(order.amount_total)} em {order.installment_count}x — status <strong>{order.status}</strong>
        </div>
      ))}
      {installments && installments.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-500">
              <th className="py-2">Parcela</th>
              <th className="py-2">Valor</th>
              <th className="py-2">Vencimento</th>
              <th className="py-2">Status</th>
              <th className="py-2">Boleto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {installments.map((inst) => (
              <tr key={inst.id}>
                <td className="py-2">{inst.installment_number}</td>
                <td className="py-2">{formatCurrency(inst.amount)}</td>
                <td className="py-2">{new Date(inst.due_date).toLocaleDateString('pt-BR')}</td>
                <td className="py-2">{inst.status}</td>
                <td className="py-2">
                  {inst.bank_slip_url ? (
                    <a href={inst.bank_slip_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                      Ver boleto
                    </a>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
