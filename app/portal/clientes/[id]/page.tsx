import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

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

export default async function PortalClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();
  const { id } = await params;

  const [client] = access.visibleUserIds === null
    ? await sql`
        SELECT id, full_name, document_number, email, phone
        FROM insurance_clients
        WHERE id = ${id}
          AND EXISTS (
            SELECT 1
            FROM cotacoes c
            WHERE c.client_id = insurance_clients.id
              AND c.partner_id = ${access.partnerId}
          )
        LIMIT 1
      `
    : await sql`
        SELECT id, full_name, document_number, email, phone
        FROM insurance_clients
        WHERE id = ${id}
          AND EXISTS (
            SELECT 1
            FROM cotacoes c
            WHERE c.client_id = insurance_clients.id
              AND c.partner_id = ${access.partnerId}
              AND c.partner_user_id IN ${sql(access.visibleUserIds)}
          )
        LIMIT 1
      `;

  if (!client) notFound();

  const quotes = access.visibleUserIds === null
    ? await sql`
        SELECT
          c.id,
          c.status,
          c.created_at,
          c.premio_final,
          c.importancia_segurada,
          p.name AS product_name,
          po.status AS payment_status,
          po.installment_count,
          po.paid_installments,
          sd.status AS signature_status,
          sd.signed_file_url
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        LEFT JOIN payment_orders po ON po.cotacao_id = c.id
        LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
        WHERE c.client_id = ${id}
          AND c.partner_id = ${access.partnerId}
        ORDER BY c.created_at DESC
      `
    : await sql`
        SELECT
          c.id,
          c.status,
          c.created_at,
          c.premio_final,
          c.importancia_segurada,
          p.name AS product_name,
          po.status AS payment_status,
          po.installment_count,
          po.paid_installments,
          sd.status AS signature_status,
          sd.signed_file_url
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        LEFT JOIN payment_orders po ON po.cotacao_id = c.id
        LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
        WHERE c.client_id = ${id}
          AND c.partner_id = ${access.partnerId}
          AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        ORDER BY c.created_at DESC
      `;

  const installments = access.visibleUserIds === null
    ? await sql`
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
          p.name AS product_name
        FROM payment_installments pi
        JOIN cotacoes c ON c.id = pi.cotacao_id
        JOIN products p ON p.id = c.product_id
        WHERE pi.client_id = ${id}
          AND c.partner_id = ${access.partnerId}
        ORDER BY pi.due_date ASC NULLS LAST, pi.installment_number ASC
      `
    : await sql`
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
          p.name AS product_name
        FROM payment_installments pi
        JOIN cotacoes c ON c.id = pi.cotacao_id
        JOIN products p ON p.id = c.product_id
        WHERE pi.client_id = ${id}
          AND c.partner_id = ${access.partnerId}
          AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        ORDER BY pi.due_date ASC NULLS LAST, pi.installment_number ASC
      `;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/portal/clientes" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Voltar para clientes
          </Link>
          <h1 className="page-title">{client.full_name}</h1>
          <p className="muted mt-1 text-sm">{formatDocument(client.document_number)} • {client.email || '-'} • {client.phone || '-'}</p>
        </div>
      </div>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Produtos e operações</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3 font-semibold">Produto</th>
                <th className="px-5 py-3 font-semibold">Cotação</th>
                <th className="px-5 py-3 font-semibold">Assinatura</th>
                <th className="px-5 py-3 font-semibold">Pagamento</th>
                <th className="px-5 py-3 font-semibold">Prêmio</th>
                <th className="px-5 py-3 font-semibold">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.map((quote) => (
                <tr key={quote.id} className="table-row">
                  <td className="px-5 py-4 font-semibold text-slate-700">{quote.product_name}</td>
                  <td className="px-5 py-4">{statusLabel[quote.status] || quote.status}</td>
                  <td className="px-5 py-4">
                    <div>{statusLabel[quote.signature_status || ''] || quote.signature_status || '-'}</div>
                    {quote.signed_file_url ? (
                      <a href={quote.signed_file_url} target="_blank" className="text-xs font-medium text-sky-700 underline" rel="noreferrer">
                        Abrir contrato
                      </a>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    {quote.installment_count
                      ? `${quote.paid_installments || 0}/${quote.installment_count} • ${statusLabel[quote.payment_status || ''] || quote.payment_status || '-'}`
                      : '-'}
                  </td>
                  <td className="px-5 py-4">{formatCurrency(quote.premio_final)}</td>
                  <td className="px-5 py-4 text-gray-500">{formatDate(quote.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Parcelas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3 font-semibold">Produto</th>
                <th className="px-5 py-3 font-semibold">Parcela</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Valor</th>
                <th className="px-5 py-3 font-semibold">Vencimento</th>
                <th className="px-5 py-3 font-semibold">Pagamento</th>
                <th className="px-5 py-3 font-semibold">Boleto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {installments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-500">
                    Nenhuma parcela gerada para este cliente ainda.
                  </td>
                </tr>
              ) : installments.map((item) => (
                <tr key={item.id} className="table-row">
                  <td className="px-5 py-4 font-medium text-slate-700">{item.product_name}</td>
                  <td className="px-5 py-4">{item.installment_number}</td>
                  <td className="px-5 py-4">{statusLabel[item.status] || item.status}</td>
                  <td className="px-5 py-4">{formatCurrency(item.amount)}</td>
                  <td className="px-5 py-4">{formatDate(item.due_date)}</td>
                  <td className="px-5 py-4">{formatDate(item.paid_at)}</td>
                  <td className="px-5 py-4">
                    {item.bank_slip_url || item.invoice_url ? (
                      <a
                        href={item.bank_slip_url || item.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-sky-700 underline"
                      >
                        Abrir boleto
                      </a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
