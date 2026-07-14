import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';

interface CotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  importancia_segurada: string | null;
  premio_final: string | null;
  status: string;
  created_at: string;
  product_name: string;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Emitida',
};

function formatCurrency(value: string | null) {
  if (!value) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

export default async function CotacoesPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();
  await seedInitialData();

  const cotacoes = access.visibleUserIds === null
    ? await sql<CotacaoRow[]>`
        SELECT
          c.id,
          c.client_name,
          c.client_cpf_cnpj,
          c.importancia_segurada,
          c.premio_final,
          c.status,
          c.created_at,
          p.name AS product_name
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        WHERE c.partner_id = ${access.partnerId}
        ORDER BY c.created_at DESC
        LIMIT 100
      `
    : await sql<CotacaoRow[]>`
        SELECT
          c.id,
          c.client_name,
          c.client_cpf_cnpj,
          c.importancia_segurada,
          c.premio_final,
          c.status,
          c.created_at,
          p.name AS product_name
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        WHERE c.partner_id = ${access.partnerId}
          AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        ORDER BY c.created_at DESC
        LIMIT 100
      `;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Cotações</h1>
          <p className="muted mt-1 text-sm">Acompanhe os rascunhos e propostas do Seguro RC.</p>
        </div>
        <Link href="/portal/cotacoes/nova" className="btn-primary">
          <Plus size={16} /> Nova Cotação
        </Link>
      </div>

      <div className="card overflow-hidden p-0">
        {cotacoes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Nenhuma cotação cadastrada</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              Crie a primeira cotação para registrar o cliente e iniciar o atendimento com a DuoLife.
            </p>
            <Link href="/portal/cotacoes/nova" className="btn-accent mt-6 inline-flex">
              Criar cotação
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Produto</th>
                  <th className="px-5 py-3 font-semibold">Importância</th>
                  <th className="px-5 py-3 font-semibold">Prêmio</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Criada em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cotacoes.map((cotacao) => (
                  <tr key={cotacao.id} className="table-row">
                    <td className="px-5 py-4">
                      <div className="font-semibold" style={{ color: 'var(--primary)' }}>{cotacao.client_name}</div>
                      <div className="text-xs text-gray-500">{cotacao.client_cpf_cnpj}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{cotacao.product_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatCurrency(cotacao.importancia_segurada)}</td>
                    <td className="px-5 py-4 text-gray-600">{formatCurrency(cotacao.premio_final)}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">
                        {statusLabel[cotacao.status] || cotacao.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{formatDate(cotacao.created_at)}</td>
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
