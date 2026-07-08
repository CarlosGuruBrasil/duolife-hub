import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { verifyAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';

interface AdminCotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  importancia_segurada: string | null;
  premio_final: string | null;
  status: string;
  created_at: string;
  product_name: string;
  partner_name: string;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Emitida',
  assinado: 'Assinado',
  pagamento_gerado: 'Aguard. Pag.',
  contrato_gerado: 'Aguard. Assin.'
};

function formatCurrency(value: string | null) {
  if (!value) return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default async function AdminCotacoesPage() {
  const user = await verifyAuth();
  if (!user || (user.role !== 'duolife_admin' && user.role !== 'duolife_staff')) {
    redirect('/login');
  }

  const cotacoes = await sql<AdminCotacaoRow[]>`
    SELECT
      c.id,
      c.client_name,
      c.client_cpf_cnpj,
      c.importancia_segurada,
      c.premio_final,
      c.status,
      c.created_at,
      p.name AS product_name,
      part.nome_fantasia as partner_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    ORDER BY c.created_at DESC
    LIMIT 200
  `;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--primary-dark)' }}>Cotações Gerais</h1>
          <p className="text-sm text-gray-500 mt-1">Visualize todas as cotações geradas na plataforma.</p>
        </div>
        <Link 
          href="/admin/cotacoes/nova" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
        >
          <Plus size={16} /> Nova Cotação
        </Link>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        {cotacoes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Nenhuma cotação cadastrada</h2>
            <p className="text-gray-500 mx-auto mt-2 max-w-md text-sm">
              Crie a primeira cotação ou aguarde os parceiros gerarem cotações.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 font-semibold text-gray-700">Cliente</th>
                  <th className="px-5 py-3 font-semibold text-gray-700">Parceiro</th>
                  <th className="px-5 py-3 font-semibold text-gray-700">Produto</th>
                  <th className="px-5 py-3 font-semibold text-gray-700">Prêmio</th>
                  <th className="px-5 py-3 font-semibold text-gray-700">Status</th>
                  <th className="px-5 py-3 font-semibold text-gray-700">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cotacoes.map((cotacao) => (
                  <tr key={cotacao.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-5 py-4">
                      <div className="font-semibold" style={{ color: 'var(--primary)' }}>{cotacao.client_name}</div>
                      <div className="text-xs text-gray-500">{cotacao.client_cpf_cnpj}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600 font-medium">{cotacao.partner_name || 'DuoLife'}</td>
                    <td className="px-5 py-4 text-gray-600">{cotacao.product_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatCurrency(cotacao.premio_final)}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {statusLabel[cotacao.status] || cotacao.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(cotacao.created_at)}</td>
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
