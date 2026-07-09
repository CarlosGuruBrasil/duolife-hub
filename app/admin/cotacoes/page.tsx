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

const statusColor: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-700 border-gray-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  aprovada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
  emitida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pagamento_gerado: 'bg-amber-50 text-amber-700 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-700 border-amber-200'
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
    <div className="bg-[#F9FAFB] min-h-screen -m-6 p-6 sm:p-10 font-sans">
      <div className="max-w-[1440px] mx-auto">
        {/* Header Section */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Cotações Gerais</h1>
            <p className="text-base text-gray-500 mt-2">Visualize todas as cotações geradas na plataforma.</p>
          </div>
          <Link 
            href="/admin/cotacoes/nova" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#10b981] text-white font-semibold rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-[#059669] transition-all duration-200"
          >
            <Plus size={18} strokeWidth={2.5} /> Nova Cotação
          </Link>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {cotacoes.length === 0 ? (
            <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Nenhuma cotação cadastrada</h2>
              <p className="text-gray-500 mx-auto mt-2 max-w-md text-sm">
                Crie a primeira cotação ou aguarde os parceiros gerarem cotações.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Cliente</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Parceiro</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs">Produto</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Prêmio</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-center">Status</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cotacoes.map((cotacao) => (
                    <tr key={cotacao.id} className="hover:bg-gray-50/80 transition-colors duration-150 group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{cotacao.client_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{cotacao.client_cpf_cnpj}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                          <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 uppercase">
                            {(cotacao.partner_name || 'DL').substring(0,2)}
                          </div>
                          {cotacao.partner_name || 'DuoLife'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium">{cotacao.product_name}</td>
                      <td className="px-6 py-4 text-gray-900 font-semibold text-right">{formatCurrency(cotacao.premio_final)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColor[cotacao.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {statusLabel[cotacao.status] || cotacao.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs text-right font-medium">{formatDate(cotacao.created_at)}</td>
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
