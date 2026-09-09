import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { verifyAuth, isInternalUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { formatCurrency, formatDateTime as formatDate } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';
import EditarClienteButton from '@/components/modals/EditarClienteButton';
import EditarPropostaButton from '@/components/modals/EditarPropostaButton';

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

function parseJsonField<T>(field: unknown): T {
  if (!field) return {} as T;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return {} as T;
    }
  }
  return field as T;
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
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  await ensureSchema();
  const { id } = await params;

  const [client] = await sql`
    SELECT id, full_name, document_number, email, phone, birth_date, metadata
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
      c.client_name,
      c.client_cpf_cnpj,
      c.client_email,
      c.client_phone,
      c.client_data,
      c.notes,
      COALESCE(p.name, 'RC Profissional') AS product_name,
      COALESCE(pr.nome_fantasia, pr.razao_social, 'NET4Life') AS partner_name,
      po.status AS payment_status,
      po.installment_count,
      po.paid_installments,
      sd.status AS signature_status,
      sd.signed_file_url
    FROM cotacoes c
    LEFT JOIN products p ON p.id = c.product_id
    LEFT JOIN partners pr ON pr.id = c.partner_id
    LEFT JOIN payment_orders po ON po.cotacao_id = c.id
    LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
    WHERE c.client_id = ${id}
       OR (c.client_cpf_cnpj = ${client.document_number} AND ${client.document_number} != '')
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
      COALESCE(p.name, 'RC Profissional') AS product_name,
      COALESCE(pr.nome_fantasia, pr.razao_social, 'NET4Life') AS partner_name
    FROM payment_installments pi
    JOIN cotacoes c ON c.id = pi.cotacao_id
    LEFT JOIN products p ON p.id = c.product_id
    LEFT JOIN partners pr ON pr.id = c.partner_id
    WHERE pi.client_id = ${id}
       OR c.client_id = ${id}
       OR (c.client_cpf_cnpj = ${client.document_number} AND ${client.document_number} != '')
    ORDER BY pi.due_date ASC NULLS LAST, pi.installment_number ASC
  `;

  const clientMeta = parseJsonField<Record<string, unknown>>(client.metadata);
  const rawWix = (clientMeta.wix && typeof clientMeta.wix === 'object') ? (clientMeta.wix as Record<string, unknown>) : {};
  const latestQuoteData = quotes[0] ? parseJsonField<Record<string, unknown>>(quotes[0].client_data) : {};
  const quoteWix = (latestQuoteData.wix && typeof latestQuoteData.wix === 'object') ? (latestQuoteData.wix as Record<string, unknown>) : {};

  const oab = String(clientMeta.oab || rawWix.oab || rawWix.numeroOab || latestQuoteData.oab || quoteWix.oab || quoteWix.numeroOab || '').trim();
  const escritorio = String(clientMeta.escritorio || rawWix.escritorioAssociado || rawWix.escritorio || latestQuoteData.escritorio || quoteWix.escritorio || quoteWix.escritorioAssociado || '').trim();
  const asaasCustomer = String(clientMeta.asaasCustomerId || rawWix.codigoAsaas || latestQuoteData.codigoAsaas || quoteWix.codigoAsaas || '').trim();
  const zapsignToken = String(clientMeta.zapsignToken || rawWix.tokenZapsign || latestQuoteData.tokenZapsign || quoteWix.tokenZapsign || '').trim();

  const clientAddress = (clientMeta.address && typeof clientMeta.address === 'object')
    ? (clientMeta.address as Record<string, string>)
    : {
        cep: String(latestQuoteData.cep || ''),
        logradouro: String(latestQuoteData.logradouro || latestQuoteData.rua || ''),
        numero: String(latestQuoteData.numero || ''),
        complemento: String(latestQuoteData.complemento || ''),
        bairro: String(latestQuoteData.bairro || ''),
        cidade: String(latestQuoteData.cidade || ''),
        uf: String(latestQuoteData.uf || ''),
      };

  return (
    <div className="bg-[#F9FAFB] min-h-screen -m-6 p-6 sm:p-10 font-sans">
      <div className="max-w-[1440px] mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/admin/clientes" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700">
              <ArrowLeft size={16} /> Voltar para clientes
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{client.full_name}</h1>
            <p className="text-sm text-gray-500 mt-2">
              {formatDocument(client.document_number)} • {client.email || '-'} • {client.phone || '-'}
              {client.birth_date ? ` • Nasc: ${new Date(client.birth_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}
            </p>
            {clientAddress.logradouro && (
              <p className="text-xs text-gray-500 mt-1">
                📍 {clientAddress.logradouro}, {clientAddress.numero || 'S/N'} {clientAddress.bairro ? `· ${clientAddress.bairro}` : ''} {clientAddress.cidade ? `· ${clientAddress.cidade}/${clientAddress.uf}` : ''} {clientAddress.cep ? `· CEP: ${clientAddress.cep}` : ''}
              </p>
            )}

            {/* Badges de Dados Profissionais (OAB, Escritório, Asaas, ZapSign) */}
            {(oab || escritorio || asaasCustomer || zapsignToken) && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-2">
                {oab && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                    ⚖️ OAB: {oab}
                  </span>
                )}
                {escritorio && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 max-w-md truncate" title={escritorio}>
                    🏢 {escritorio}
                  </span>
                )}
                {asaasCustomer && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    💳 Asaas: {asaasCustomer}
                  </span>
                )}
                {zapsignToken && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                    ✍️ ZapSign: {zapsignToken}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <EditarClienteButton
              cliente={{
                id: client.id,
                full_name: client.full_name,
                document_number: client.document_number,
                email: client.email,
                phone: client.phone,
                birth_date: client.birth_date ? String(client.birth_date).slice(0, 10) : null,
                address: clientAddress,
              }}
              variant="primary"
              size="md"
            />
          </div>
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
                  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                      Nenhum produto ou proposta contratada para este cliente ainda.
                    </td>
                  </tr>
                ) : quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                    <td className="px-6 py-4 font-medium text-gray-700">{quote.partner_name || 'DuoLife'}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{quote.product_name}</td>
                    <td className="px-6 py-4 text-gray-600">{statusLabel[quote.status] || quote.status}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <div>{statusLabel[quote.signature_status || ''] || quote.signature_status || '-'}</div>
                      {safeExternalUrl(quote.signed_file_url) ? (
                        <a href={safeExternalUrl(quote.signed_file_url)} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-700 underline">
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
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <EditarPropostaButton
                          cotacao={{
                            id: quote.id,
                            status: quote.status,
                            client_name: quote.client_name,
                            client_cpf_cnpj: quote.client_cpf_cnpj,
                            client_email: quote.client_email,
                            client_phone: quote.client_phone,
                            importancia_segurada: quote.importancia_segurada,
                            premio_final: quote.premio_final,
                            notes: quote.notes,
                            client_data: parseJsonField(quote.client_data),
                          }}
                          variant="ghost"
                          size="sm"
                        >
                          <span className="text-xs text-[#0e4a5a] font-semibold hover:underline">✏️ Editar</span>
                        </EditarPropostaButton>
                        <Link
                          href={`/admin/cotacoes/${quote.id}`}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          Ver <ExternalLink size={11} />
                        </Link>
                      </div>
                    </td>
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
                      {safeExternalUrl(item.bank_slip_url || item.invoice_url) ? (
                        <a href={safeExternalUrl(item.bank_slip_url || item.invoice_url)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700 underline">
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
