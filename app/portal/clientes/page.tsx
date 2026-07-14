import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Users } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

interface ClientRow {
  id: string;
  full_name: string;
  document_number: string;
  email: string | null;
  phone: string | null;
  products_count: number;
  cotacoes_count: number;
  last_quote_status: string | null;
  last_payment_status: string | null;
  paid_installments: number;
  total_installments: number;
  updated_at: string;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguard. assinatura',
  assinado: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  paid: 'Pago',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  pending: 'Pendente',
  refunded: 'Estornado',
};

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default async function PortalClientesPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();

  const clients = access.visibleUserIds === null
    ? await sql<ClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.partner_id = ${access.partnerId}
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT po.status
            FROM payment_orders po
            WHERE po.client_id = ic.id
              AND po.partner_id = ${access.partnerId}
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.partner_id = ${access.partnerId}
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.partner_id = ${access.partnerId}
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone
        ORDER BY MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at)) DESC
        LIMIT 200
      `
    : await sql<ClientRow[]>`
        SELECT
          ic.id,
          ic.full_name,
          ic.document_number,
          ic.email,
          ic.phone,
          COUNT(DISTINCT c.product_id)::int AS products_count,
          COUNT(DISTINCT c.id)::int AS cotacoes_count,
          (
            SELECT c2.status
            FROM cotacoes c2
            WHERE c2.client_id = ic.id
              AND c2.partner_id = ${access.partnerId}
              AND c2.partner_user_id IN ${sql(access.visibleUserIds)}
            ORDER BY c2.created_at DESC
            LIMIT 1
          ) AS last_quote_status,
          (
            SELECT po.status
            FROM payment_orders po
            JOIN cotacoes c3 ON c3.id = po.cotacao_id
            WHERE po.client_id = ic.id
              AND po.partner_id = ${access.partnerId}
              AND c3.partner_user_id IN ${sql(access.visibleUserIds)}
            ORDER BY po.created_at DESC
            LIMIT 1
          ) AS last_payment_status,
          COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
          COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
          MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
        FROM insurance_clients ic
        JOIN cotacoes c
          ON c.client_id = ic.id
         AND c.partner_id = ${access.partnerId}
         AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        LEFT JOIN payment_orders po
          ON po.client_id = ic.id
         AND po.partner_id = ${access.partnerId}
         AND po.cotacao_id = c.id
        GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone
        ORDER BY MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at)) DESC
        LIMIT 200
      `;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="muted mt-1 text-sm">Acompanhe cada segurado, seus produtos e a situação das parcelas.</p>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {clients.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Users size={24} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Nenhum cliente com operação registrada</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              Quando as cotações forem criadas, os clientes aparecerão aqui com histórico de assinatura e pagamento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Contato</th>
                  <th className="px-5 py-3 font-semibold">Produtos</th>
                  <th className="px-5 py-3 font-semibold">Cotações</th>
                  <th className="px-5 py-3 font-semibold">Assinatura</th>
                  <th className="px-5 py-3 font-semibold">Parcelas</th>
                  <th className="px-5 py-3 font-semibold">Última atualização</th>
                  <th className="px-5 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <tr key={client.id} className="table-row">
                    <td className="px-5 py-4">
                      <div className="font-semibold" style={{ color: 'var(--primary)' }}>{client.full_name}</div>
                      <div className="text-xs text-gray-500">{formatDocument(client.document_number)}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      <div>{client.email || '-'}</div>
                      <div className="text-xs text-gray-500">{client.phone || '-'}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{client.products_count}</td>
                    <td className="px-5 py-4 text-gray-600">{client.cotacoes_count}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">
                        {statusLabel[client.last_quote_status || ''] || client.last_quote_status || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {client.total_installments > 0
                        ? `${client.paid_installments}/${client.total_installments} • ${statusLabel[client.last_payment_status || ''] || client.last_payment_status || 'Pendente'}`
                        : '-'}
                    </td>
                    <td className="px-5 py-4 text-gray-500">{client.updated_at ? formatDate(client.updated_at) : '-'}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/portal/clientes/${client.id}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold"
                        style={{ color: 'var(--primary)' }}
                      >
                        Ver operação <ArrowRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
