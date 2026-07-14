import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Users } from 'lucide-react';
import { verifyAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';

interface ClientRow {
  id: string;
  full_name: string;
  document_number: string;
  email: string | null;
  phone: string | null;
  partner_names: string | null;
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
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default async function AdminClientesPage() {
  const user = await verifyAuth();
  if (!user || (user.role !== 'duolife_admin' && user.role !== 'duolife_staff')) {
    redirect('/login');
  }

  await ensureSchema();

  const clients = await sql<ClientRow[]>`
    SELECT
      ic.id,
      ic.full_name,
      ic.document_number,
      ic.email,
      ic.phone,
      string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razao_social), ', ') AS partner_names,
      COUNT(DISTINCT c.product_id)::int AS products_count,
      COUNT(DISTINCT c.id)::int AS cotacoes_count,
      (
        SELECT c2.status
        FROM cotacoes c2
        WHERE c2.client_id = ic.id
        ORDER BY c2.created_at DESC
        LIMIT 1
      ) AS last_quote_status,
      (
        SELECT po.status
        FROM payment_orders po
        WHERE po.client_id = ic.id
        ORDER BY po.created_at DESC
        LIMIT 1
      ) AS last_payment_status,
      COALESCE(SUM(po.paid_installments), 0)::int AS paid_installments,
      COALESCE(SUM(po.installment_count), 0)::int AS total_installments,
      MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at))::text AS updated_at
    FROM insurance_clients ic
    JOIN cotacoes c ON c.client_id = ic.id
    JOIN partners p ON p.id = c.partner_id
    LEFT JOIN payment_orders po ON po.client_id = ic.id
    GROUP BY ic.id, ic.full_name, ic.document_number, ic.email, ic.phone
    ORDER BY MAX(COALESCE(po.updated_at, c.updated_at, ic.updated_at)) DESC
    LIMIT 300
  `;

  return (
    <div className="bg-[#F9FAFB] min-h-screen -m-6 p-6 sm:p-10 font-sans">
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Clientes</h1>
          <p className="text-base text-gray-500 mt-2">Base consolidada dos segurados com produtos, assinatura e parcelas.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {clients.length === 0 ? (
            <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <Users size={28} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Nenhum cliente com operação registrada</h2>
              <p className="text-gray-500 mx-auto mt-2 max-w-md text-sm">
                Assim que as contratações forem processadas, a carteira consolidada aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Cliente</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Contato</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parceiros</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Produtos</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Cotações</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Assinatura</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parcelas</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Atualização</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{client.full_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{formatDocument(client.document_number)}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <div>{client.email || '-'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{client.phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-[280px] whitespace-normal">{client.partner_names || '-'}</td>
                      <td className="px-6 py-4 text-gray-700 font-semibold">{client.products_count}</td>
                      <td className="px-6 py-4 text-gray-700 font-semibold">{client.cotacoes_count}</td>
                      <td className="px-6 py-4 text-gray-600">{statusLabel[client.last_quote_status || ''] || client.last_quote_status || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {client.total_installments > 0
                          ? `${client.paid_installments}/${client.total_installments} • ${statusLabel[client.last_payment_status || ''] || client.last_payment_status || '-'}`
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{client.updated_at ? formatDate(client.updated_at) : '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/admin/clientes/${client.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f4c5c] hover:text-[#0b3a47]">
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
    </div>
  );
}
