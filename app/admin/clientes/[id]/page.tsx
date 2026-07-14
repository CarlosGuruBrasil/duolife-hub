import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { verifyAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';

function formatCurrency(value: string | number | null) {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando assinatura',
  assinado: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  paid: 'Pago',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  pending: 'Pendente',
  refunded: 'Estornado',
  confirmed: 'Confirmado',
  received: 'Recebido',
};

export default async function AdminClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth();
  if (!user || (user.role !== 'duolife_admin' && user.role !== 'duolife_staff')) {
    redirect('/login');
  }

  await ensureSchema();
  const { id } = await params;

  const [client] = await sql`
    SELECT id, full_name, document_number, email, phone
    FROM insurance_clients
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!client) notFound();

  const quotes = await sql`
    SELECT
      c.id,
      c.status,
      c.created_at,
      c.premio_final,
      c.importancia_segurada,
      p.name AS product_name,
      pr.nome_fantasia AS partner_name,
      po.status AS payment_status,
      po.installment_count,
      po.paid_installments,
      sd.status AS signature_status,
      sd.signed_file_url
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners pr ON pr.id = c.partner_id
    LEFT JOIN payment_orders po ON po.cotacao_id = c.id
    LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
    WHERE c.client_id = ${id}
    ORDER BY c.created_at DESC
  `;

  const installments = await sql`
    SELECT
      pi.id,
      pi.cotacao_id,
      pi.installment_number,
      pi.status,
      pi.amount,
      pi.due_date,
      pi.paid_at,
      pi.bank_slip_url,
      pi.invoice_url,
      p.name AS product_name,
      pr.nome_fantasia AS partner_name
    FROM payment_installments pi
    JOIN cotacoes c ON c.id = pi.cotacao_id
    JOIN products p ON p.id = c.product_id
    JOIN partners pr ON pr.id = c.partner_id
    WHERE pi.client_id = ${id}
    ORDER BY pi.due_date ASC NULLS LAST, pi.installment_number ASC
  `;

  return (
    <div className="bg-[#F9FAFB] min-h-screen -m-6 p-6 sm:p-10 font-sans">
      <div className="max-w-[1440px] mx-auto space-y-8">
        <div>
          <Link href="/admin/clientes" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            <ArrowLeft size={16} /> Voltar para clientes
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{client.full_name}</h1>
          <p className="text-sm text-gray-500 mt-2">{formatDocument(client.document_number)} • {client.email || '-'} • {client.phone || '-'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Produtos e operações</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parceiro</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Produto</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Cotação</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Assinatura</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Pagamento</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Prêmio</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                    <td className="px-6 py-4 font-medium text-gray-700">{quote.partner_name || 'DuoLife'}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{quote.product_name}</td>
                    <td className="px-6 py-4 text-gray-600">{statusLabel[quote.status] || quote.status}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <div>{statusLabel[quote.signature_status || ''] || quote.signature_status || '-'}</div>
                      {quote.signed_file_url ? (
                        <a href={quote.signed_file_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-700 underline">
                          Abrir contrato
                        </a>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {quote.installment_count
                        ? `${quote.paid_installments || 0}/${quote.installment_count} • ${statusLabel[quote.payment_status || ''] || quote.payment_status || '-'}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(quote.premio_final)}</td>
                    <td className="px-6 py-4 text-right text-xs text-gray-500">{formatDate(quote.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Parcelas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parceiro</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Produto</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parcela</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Status</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Valor</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Vencimento</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Pagamento</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Boleto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {installments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                      Nenhuma parcela gerada para este cliente ainda.
                    </td>
                  </tr>
                ) : installments.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                    <td className="px-6 py-4 font-medium text-gray-700">{item.partner_name || 'DuoLife'}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{item.product_name}</td>
                    <td className="px-6 py-4 text-gray-600">{item.installment_number}</td>
                    <td className="px-6 py-4 text-gray-600">{statusLabel[item.status] || item.status}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(item.due_date)}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(item.paid_at)}</td>
                    <td className="px-6 py-4">
                      {item.bank_slip_url || item.invoice_url ? (
                        <a href={item.bank_slip_url || item.invoice_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700 underline">
                          Abrir boleto
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
