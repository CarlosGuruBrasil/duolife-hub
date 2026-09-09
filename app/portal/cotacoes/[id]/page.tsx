import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, CreditCard, ShieldCheck, FileCheck, Play } from 'lucide-react';
import { verifyPartnerAuth, getPartnerAccessContext } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { PagamentosPanel } from '@/components/portal/PagamentosPanel';
import { formatCurrency, formatDate, formatDateTime, formatAtuacao } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';
import EditarPropostaButton from '@/components/modals/EditarPropostaButton';

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando Assinatura (ZapSign)',
  assinado: 'Contrato Assinado (ZapSign)',
  pagamento_gerado: 'Fatura Gerada (Asaas)',
  aprovada: 'Aprovada (Venda)',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Apólice Emitida (KEV Seguros)',
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

function parseClientData(data: unknown): Record<string, unknown> {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }
  return {};
}

export default async function PortalCotacaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();
  const { id } = await params;

  const [cotacao] = access.visibleUserIds === null
    ? await sql`
        SELECT
          c.id, c.client_id, c.client_name, c.client_cpf_cnpj, c.client_email, c.client_phone,
          c.status, c.importancia_segurada, c.premio_final, c.premio_calculado, c.client_data, c.created_at,
          c.notes, c.product_id,
          p.name AS product_name,
          part.nome_fantasia AS partner_name
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        JOIN partners part ON part.id = c.partner_id
        WHERE c.id = ${id}
          AND c.partner_id = ${access.partnerId}
        LIMIT 1
      `
    : await sql`
        SELECT
          c.id, c.client_id, c.client_name, c.client_cpf_cnpj, c.client_email, c.client_phone,
          c.status, c.importancia_segurada, c.premio_final, c.premio_calculado, c.client_data, c.created_at,
          c.notes, c.product_id,
          p.name AS product_name,
          part.nome_fantasia AS partner_name
        FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        JOIN partners part ON part.id = c.partner_id
        WHERE c.id = ${id}
          AND c.partner_id = ${access.partnerId}
          AND c.partner_user_id IN ${sql(access.visibleUserIds)}
        LIMIT 1
      `;

  if (!cotacao) notFound();

  // Busca Venda / Apólice se houver
  const [sale] = await sql`
    SELECT id, policy_number, premio_total, status, issue_date, expiry_date, commission_amount
    FROM sales
    WHERE cotacao_id = ${id}
    LIMIT 1
  `;

  // Busca Ordem de Pagamento / Parcelas se houver
  const [paymentOrder] = await sql<Array<{
    id: string;
    installment_count: number;
    billing_type: string;
    amount_total: string;
    status: string;
  }>>`
    SELECT id, installment_count, billing_type, amount_total, status
    FROM payment_orders
    WHERE cotacao_id = ${id}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const clientData = parseClientData(cotacao.client_data);

  const planoNome = String(clientData.nomePlano || clientData.tipoDePlano || 'RC Advogados');
  const cobertura = String(clientData.valorCobertura || (cotacao.importancia_segurada ? formatCurrency(cotacao.importancia_segurada) : ''));
  const franquia = String(clientData.planoFranquia || 'R$ 1.000,00');

  const totalAmountNum = paymentOrder?.amount_total
    ? parseFloat(paymentOrder.amount_total)
    : (clientData.valor !== undefined && clientData.valor !== null
        ? Number(clientData.valor)
        : Number(cotacao.premio_final ?? cotacao.premio_calculado ?? 0));

  const valorTotalCalculado = totalAmountNum > 0
    ? formatCurrency(totalAmountNum)
    : formatCurrency(cotacao.premio_final ?? cotacao.premio_calculado);

  const rawParcelas =
    paymentOrder?.installment_count ??
    clientData.installmentCount ??
    clientData.parcela ??
    clientData.parcelas ??
    clientData.parcelasTotal ??
    clientData.numParcelas;

  const numParcelas = typeof rawParcelas === 'number'
    ? rawParcelas
    : parseInt(String(rawParcelas || '1'), 10) || 1;

  const rawValorParcela =
    clientData.valorParcela !== undefined && clientData.valorParcela !== null
      ? Number(clientData.valorParcela)
      : (totalAmountNum > 0 && numParcelas > 0 ? totalAmountNum / numParcelas : 0);

  const parcelaInfo = numParcelas > 1
    ? (rawValorParcela > 0
        ? `${numParcelas}x de ${formatCurrency(rawValorParcela)}`
        : `${numParcelas}x parcelas`)
    : '1x À Vista';

  const linkBoleto = safeExternalUrl(clientData.linkBoleto as string | undefined);
  const checkoutId = String(clientData.checkoutId || '');
  const signUrl = safeExternalUrl(clientData.signUrl as string | undefined);
  const contratoGeradoEm = String(clientData.contratoGeradoEm || '');

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      {/* Voltar */}
      <Link href="/portal/cotacoes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft size={14} /> Voltar para Cotações
      </Link>

      {/* Header Principal da Cotação */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[cotacao.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              {statusLabel[cotacao.status] || cotacao.status}
            </span>
            <span className="text-xs text-slate-400 font-mono">ID: {cotacao.id.slice(0, 8)}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{cotacao.client_name}</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            CPF/CNPJ: <strong className="text-slate-700">{cotacao.client_cpf_cnpj}</strong> · E-mail: <strong className="text-slate-700">{cotacao.client_email || 'Não informado'}</strong> · Tel: <strong className="text-slate-700">{cotacao.client_phone || 'Não informado'}</strong>
          </p>
        </div>

        <div className="flex flex-col md:items-end gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
          <div className="text-left md:text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Valor Contratado</span>
            <span className="text-2xl font-black text-slate-900 block">{valorTotalCalculado}</span>
            <span className="text-xs text-slate-500 font-medium block">{parcelaInfo}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditarPropostaButton
              cotacao={{
                id: cotacao.id,
                status: cotacao.status,
                client_name: cotacao.client_name,
                client_cpf_cnpj: cotacao.client_cpf_cnpj,
                client_email: cotacao.client_email,
                client_phone: cotacao.client_phone,
                importancia_segurada: cotacao.importancia_segurada,
                premio_final: cotacao.premio_final ?? cotacao.premio_calculado,
                notes: cotacao.notes ? String(cotacao.notes) : null,
                client_data: clientData,
              }}
              variant="outline"
              size="sm"
            />
            {cotacao.status === 'rascunho' && (
              <Link
                href={`/portal/cotacoes/nova?product=${encodeURIComponent(cotacao.product_id)}&cotacaoId=${cotacao.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
                title="Dar continuidade a esta cotação rascunho"
              >
                <Play size={13} className="fill-current" /> Continuar Cotação
              </Link>
            )}
          </div>
        </div>
      </div>

      {cotacao.status === 'rascunho' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
          <div className="text-xs">
            <strong className="block text-sm font-bold">Esta cotação está salva como Rascunho</strong>
            <span className="text-amber-800">
              Você pode continuar de onde parou: revisar os dados cadastrais, alterar coberturas e gerar o contrato para assinatura.
            </span>
          </div>
          <Link
            href={`/portal/cotacoes/nova?product=${encodeURIComponent(cotacao.product_id)}&cotacaoId=${cotacao.id}`}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shrink-0 shadow-xs"
          >
            <Play size={12} className="fill-current" /> Continuar Preenchimento
          </Link>
        </div>
      )}

      {/* Grid com Detalhes da Proposta, ZapSign e Asaas */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Card 1: Dados do Plano & Proposta RC Advogados */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText size={16} className="text-cyan-600" /> Detalhes do Plano Contratado
            </h2>
            <EditarPropostaButton
              cotacao={{
                id: cotacao.id,
                status: cotacao.status,
                client_name: cotacao.client_name,
                client_cpf_cnpj: cotacao.client_cpf_cnpj,
                client_email: cotacao.client_email,
                client_phone: cotacao.client_phone,
                importancia_segurada: cotacao.importancia_segurada,
                premio_final: cotacao.premio_final ?? cotacao.premio_calculado,
                notes: cotacao.notes ? String(cotacao.notes) : null,
                client_data: clientData,
              }}
              variant="ghost"
              size="sm"
            >
              <span className="text-xs text-[#0e4a5a] font-semibold hover:underline">✏️ Editar</span>
            </EditarPropostaButton>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Plano</span>
              <span className="font-bold text-slate-900 block">{planoNome}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Cobertura</span>
              <span className="font-bold text-slate-900 block">{cobertura}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Franquia</span>
              <span className="font-semibold text-slate-700 block">{franquia}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Vendedor / Parceiro</span>
              <span className="font-semibold text-slate-900 block">{cotacao.partner_name}</span>
            </div>
          </div>

          {/* Dados Profissionais do Advogado */}
          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">Dados do Proponente / Advogado</span>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-400">OAB / UF:</span> <strong className="text-slate-900">{clientData.oab ? `OAB ${clientData.oab}` : 'Não informada'}</strong></div>
              <div><span className="text-slate-400">Atuação:</span> <strong className="text-slate-900">{formatAtuacao(clientData.atuacao)}</strong></div>
              <div><span className="text-slate-400">Titularidade:</span> <strong className="text-slate-900">{String(clientData.titularidade || 'Individual')}</strong></div>
              <div><span className="text-slate-400">Escritório:</span> <strong className="text-slate-900">{String(clientData.escritorioAssociado || 'N/A')}</strong></div>
            </div>
          </div>

          {/* Endereço */}
          {Boolean(clientData.logradouro) && (
            <div className="pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">Endereço Cadastrado</span>
              <p className="text-slate-700 mt-1 font-medium">
                {String(clientData.logradouro)}, {String(clientData.numero || 'S/N')} · {String(clientData.bairro || '')} · {String(clientData.cidade || '')}/{String(clientData.uf || '')} (CEP: {String(clientData.cep || '')})
              </p>
            </div>
          )}

          {/* Observações */}
          {Boolean(cotacao.notes) && (
            <div className="pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">Observações</span>
              <p className="text-slate-700 mt-1">{String(cotacao.notes)}</p>
            </div>
          )}
        </div>

        {/* Card 2: Status do Contrato & Assinatura (ZapSign) & Cobrança (Asaas) */}
        <div className="space-y-6">
          
          {/* Fatura & Pagamento Asaas */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <CreditCard size={16} className="text-amber-600" /> Situação de Pagamento (Asaas)
            </h2>

            {checkoutId || linkBoleto ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs bg-amber-50/80 border border-amber-200/80 p-3 rounded-xl">
                  <div>
                    <span className="font-bold text-amber-900 block">Cobrança Asaas Gerada</span>
                    <span className="text-amber-700 text-[11px] block">ID: {checkoutId || 'Asaas'}</span>
                  </div>
                  {linkBoleto && (
                    <a
                      href={linkBoleto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 !text-white text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                    >
                      <span>📄</span>
                      <span className="!text-white text-white">Abrir Fatura / Pix</span>
                      <ExternalLink size={12} className="!text-white text-white shrink-0" />
                    </a>
                  )}
                </div>

                {Boolean(clientData.dataVencimento) && (
                  <p className="text-xs text-slate-500 font-medium">
                    Data de Vencimento: <strong className="text-slate-900">{formatDate(String(clientData.dataVencimento))}</strong>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">Nenhuma fatura do Asaas foi gerada para esta cotação ainda.</p>
            )}
          </div>

          {/* Contrato & ZapSign */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileCheck size={16} className="text-purple-600" /> Contrato & Assinatura (ZapSign)
            </h2>

            {signUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs bg-purple-50/80 border border-purple-200/80 p-3 rounded-xl">
                  <div>
                    <span className="font-bold text-purple-900 block">Documento de Contrato Gerado</span>
                    {Boolean(contratoGeradoEm) && (
                      <span className="text-purple-700 text-[11px] block">
                        Gerado em: {formatDateTime(contratoGeradoEm)}
                      </span>
                    )}
                  </div>
                  <a
                    href={signUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 !text-white text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                  >
                    <span>✍️</span>
                    <span className="!text-white text-white">Ver Assinatura</span>
                    <ExternalLink size={12} className="!text-white text-white shrink-0" />
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">O contrato digital ainda não foi assinado ou enviado para o ZapSign.</p>
            )}
          </div>

          {/* Venda Finalizada & Apólice Emitida (se houver) */}
          {sale && (
            <div className="bg-emerald-50/80 border border-emerald-200 p-6 rounded-2xl shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-700" /> Apólice Emitida (KEV Seguros)
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs text-emerald-950 font-medium">
                <div><span>Número da Apólice:</span> <strong className="block text-sm font-bold">{sale.policy_number}</strong></div>
                <div><span>Status da Venda:</span> <strong className="block text-sm font-bold uppercase">{sale.status}</strong></div>
                <div><span>Vigência Início:</span> <strong>{formatDate(sale.issue_date)}</strong></div>
                <div><span>Vigência Fim:</span> <strong>{formatDate(sale.expiry_date)}</strong></div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Histórico Técnico de Pagamentos das Parcelas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
          <CreditCard size={16} className="text-slate-600" /> Histórico de Parcelas & Pagamentos
        </h2>
        <PagamentosPanel cotacaoId={cotacao.id} />
      </div>
    </div>
  );
}
