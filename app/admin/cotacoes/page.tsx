import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ExternalLink, FileText } from 'lucide-react';
import { verifyAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { RecusarCotacaoButton } from './_recusar-button';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';

interface AdminCotacaoRow {
  id: string;
  client_name: string;
  client_cpf_cnpj: string;
  client_email: string | null;
  client_phone: string | null;
  importancia_segurada: string | null;
  premio_final: string | null;
  premio_total: string | null;
  status: string;
  created_at: string;
  client_data: unknown;
  product_name: string;
  partner_name: string;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aprovada: 'Aprovada (Venda)',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Apólice Emitida',
  assinado: 'Contrato Assinado',
  pagamento_gerado: 'Fatura Gerada (Asaas)',
  contrato_gerado: 'Aguardando Assinatura'
};

const statusColor: Record<string, string> = {
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  aprovada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
  emitida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assinado: 'bg-purple-50 text-purple-700 border-purple-200',
  pagamento_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-800 border-amber-200'
};

function formatCurrency(value: string | number | null | undefined) {
  if (!value) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function parseClientData(data: unknown) {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }
  return {};
}

function getDisplayPrice(cotacao: AdminCotacaoRow) {
  if (cotacao.premio_final) return formatCurrency(cotacao.premio_final);
  if (cotacao.premio_total) return formatCurrency(cotacao.premio_total);
  const parsed = parseClientData(cotacao.client_data);
  if (parsed.valor) return formatCurrency(parsed.valor as number | string);
  if (parsed.valorParcela) return formatCurrency(parsed.valorParcela as number | string);
  return 'Sob Consulta';
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
      c.client_email,
      c.client_phone,
      c.importancia_segurada,
      c.premio_final,
      c.premio_total,
      c.status,
      c.created_at,
      c.client_data,
      p.name AS product_name,
      part.nome_fantasia as partner_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    ORDER BY c.created_at DESC
    LIMIT 200
  `;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">COTAÇÕES & PROPOSTAS</span>
          <h1 className="admin-page-title">Cotações Gerais</h1>
          <p className="admin-page-copy">Gerencie cotações, faturas do Asaas, assinaturas do ZapSign e vendas finalizadas.</p>
        </div>
        <Link 
          href="/admin/cotacoes/nova" 
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova Cotação
        </Link>
      </section>

      {/* Main Content Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {cotacoes.length === 0 ? (
          <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Nenhuma cotação cadastrada</h2>
            <p className="text-slate-500 mx-auto mt-2 max-w-md text-sm">
              Crie a primeira cotação ou aguarde os parceiros gerarem propostas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Cliente / CPF</th>
                  <th className="px-6 py-4">Plano / Cobertura</th>
                  <th className="px-6 py-4">Parceiro / Vendedor</th>
                  <th className="px-6 py-4 text-right">Valor Total</th>
                  <th className="px-6 py-4 text-center">Situação / Status</th>
                  <th className="px-6 py-4 text-center">Fatura & Contrato</th>
                  <th className="px-6 py-4 text-right">Data</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cotacoes.map((cotacao) => {
                  const clientData = parseClientData(cotacao.client_data);
                  const planoNome = String(clientData.nomePlano || clientData.tipoDePlano || 'RC Advogados');
                  const cobertura = String(clientData.valorCobertura || (cotacao.importancia_segurada ? formatCurrency(cotacao.importancia_segurada) : ''));
                  const linkBoleto = String(clientData.linkBoleto || '');
                  const signUrl = String(clientData.signUrl || '');
                  const oab = String(clientData.oab || '');

                  return (
                    <tr key={cotacao.id} className="hover:bg-slate-50/60 transition-colors duration-150 group">
                      <td className="px-6 py-4">
                        <Link href={`/admin/cotacoes/${cotacao.id}`} className="font-semibold text-slate-900 hover:text-emerald-600 hover:underline block">
                          {cotacao.client_name}
                        </Link>
                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                          {cotacao.client_cpf_cnpj} {oab ? `· OAB ${oab}` : ''}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-900 block">{planoNome}</span>
                        {cobertura && <span className="text-xs text-slate-500 font-normal block">{cobertura}</span>}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                            {(cotacao.partner_name || 'DL').substring(0, 2)}
                          </div>
                          {cotacao.partner_name || 'DuoLife'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-900 block">{getDisplayPrice(cotacao)}</span>
                        {clientData.parcela && Number(clientData.parcela) > 1 && (
                          <span className="text-[11px] text-slate-500 font-normal block">{clientData.parcela}x parcelado</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor[cotacao.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {statusLabel[cotacao.status] || cotacao.status}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {linkBoleto ? (
                            <a
                              href={linkBoleto}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-lg transition-colors"
                              title="Abrir Boleto / Pix do Asaas"
                            >
                              📄 Fatura Asaas <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">—</span>
                          )}

                          {signUrl && (
                            <a
                              href={signUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-2.5 py-1 rounded-lg transition-colors"
                              title="Ver Contrato ZapSign"
                            >
                              ✍️ Contrato <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-500 text-xs text-right font-medium">
                        {formatDate(cotacao.created_at)}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/admin/cotacoes/${cotacao.id}`}
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Detalhes
                          </Link>
                          {!ESTADOS_TERMINAIS.includes(cotacao.status) && (
                            <RecusarCotacaoButton id={cotacao.id} clientName={cotacao.client_name} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
