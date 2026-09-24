import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, UserCheck, CreditCard, ShieldCheck, FileCheck, Play, CheckCircle2, Clock, Download, Eye } from 'lucide-react';
import { verifyAuth, isInternalUser, isDevUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { PagamentosPanel } from './_pagamentos-client';
import { GerarBoletoButton } from '../_gerar-boleto-button';
import { EnviarFaturaEmailButton } from '@/components/cotacao/EnviarFaturaEmailButton';
import { formatCurrency, formatDate, formatDateTime, formatAtuacao, sanitizePlanFinancials } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';
import { isDateBeforeToday, calculateBillingDueDate } from '@/lib/business-days';
import EditarPropostaButton from '@/components/modals/EditarPropostaButton';
import TransferirParceiroCotacaoButton from '@/components/modals/TransferirParceiroCotacaoButton';
import { ExcluirCotacaoButton, ExcluirBoletoButton } from '@/components/dev';
import { VerificarZapSignButton } from '../_verificar-zapsign-button';
import { CopiarLinkAssinaturaButton } from '@/components/cotacao/CopiarLinkAssinaturaButton';
import { EnviarPropostaEmailButton } from '@/components/cotacao/EnviarPropostaEmailButton';
import { GerenciarCobrancaButton } from '@/components/admin/GerenciarCobrancaButton';
import type { CobrancaAsaasInitialData } from '@/components/admin/GerenciarCobrancaAsaasModal';

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando Assinatura (ZapSign)',
  assinado: 'Contrato Assinado (ZapSign)',
  signed: 'Contrato Assinado (ZapSign)',
  pagamento_gerado: 'Fatura Gerada (Asaas)',
  aprovada: 'Aprovada (Venda)',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Apólice Emitida (KEV Seguros)',
  ativa: 'Ativa',
  active: 'Ativa',
  confirmed: 'Confirmado',
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

export default async function AdminCotacaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth();
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  const isDev = isDevUser(user);

  const { id } = await params;

  const [cotacao] = await sql`
    SELECT
      c.id, c.client_name, c.client_cpf_cnpj, c.client_email, c.client_phone,
      c.status, c.importancia_segurada, c.premio_final, c.premio_calculado, c.client_data, c.created_at,
      c.notes, c.partner_id, c.partner_user_id, c.product_id,
      p.name AS product_name, p.flow_key AS product_flow_key,
      COALESCE(part.nome_fantasia, part.razao_social) AS partner_name,
      part.status AS partner_status,
      pu.name AS partner_user_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    LEFT JOIN partner_users pu ON pu.id = c.partner_user_id
    WHERE c.id = ${id}
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
    due_date: string;
  }>>`
    SELECT id, installment_count, billing_type, amount_total, status, due_date
    FROM payment_orders
    WHERE cotacao_id = ${id}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  // Busca Contrato / Documento de Assinatura ZapSign se houver
  const [signatureDoc] = await sql<Array<{
    id: string;
    external_document_id: string | null;
    sign_url: string | null;
    signed_file_url: string | null;
    status: string;
    signed_at: string | null;
    created_at: string;
  }>>`
    SELECT id, external_document_id, sign_url, signed_file_url, status, signed_at, created_at
    FROM signature_documents
    WHERE cotacao_id = ${id} AND provider = 'zapsign'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const clientData = parseClientData(cotacao.client_data);

  const planoNome = String(clientData.nomePlano || clientData.tipoDePlano || 'RC Advogados');

  const isQuoteMutable = ['rascunho', 'enviada'].includes(String(cotacao.status || '').toLowerCase());

  let rawTotalAmountNum = !isQuoteMutable && paymentOrder?.amount_total
    ? parseFloat(paymentOrder.amount_total)
    : (cotacao.premio_final !== null && cotacao.premio_final !== undefined
        ? Number(cotacao.premio_final)
        : (clientData.valor !== undefined && clientData.valor !== null
            ? Number(clientData.valor)
            : (paymentOrder?.amount_total
                ? parseFloat(paymentOrder.amount_total)
                : Number(cotacao.premio_calculado ?? 0))));

  const { cobertura: sanitizedCobNum, premio: sanitizedPremNum } = sanitizePlanFinancials({
    planoNome,
    cobertura: clientData.valorCobertura || cotacao.importancia_segurada,
    premio: rawTotalAmountNum,
  });

  const cobertura = sanitizedCobNum > 0
    ? formatCurrency(sanitizedCobNum)
    : String(clientData.valorCobertura || (cotacao.importancia_segurada ? formatCurrency(cotacao.importancia_segurada) : ''));
  const franquia = String(clientData.planoFranquia || 'R$ 1.000,00');

  const totalAmountNum = (sanitizedPremNum > 0 && rawTotalAmountNum >= 10000) ? sanitizedPremNum : rawTotalAmountNum;

  const valorTotalCalculado = totalAmountNum > 0
    ? formatCurrency(totalAmountNum)
    : formatCurrency(sanitizedPremNum || cotacao.premio_final || cotacao.premio_calculado);

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

  // Dados unificados do Contrato ZapSign
  const isAssinado = [
    'assinado',
    'signed',
    'pagamento_gerado',
    'aprovada',
    'emitida',
    'ativa',
    'active',
  ].includes(String(cotacao.status || '').toLowerCase()) ||
  signatureDoc?.status === 'signed' ||
  Boolean(signatureDoc?.signed_file_url) ||
  Boolean(clientData.contratoPdf) ||
  Boolean(clientData.signedFileUrl) ||
  Boolean(clientData.assinadoEm);

  const docToken = String(
    signatureDoc?.external_document_id ||
    clientData.contratoToken ||
    clientData.tokenZapsign ||
    ''
  ).trim();

  const rawSignedPdf =
    signatureDoc?.signed_file_url ||
    (clientData.contratoPdf as string | undefined) ||
    (clientData.signedFileUrl as string | undefined) ||
    (clientData.linkContrato as string | undefined);

  // Garante que não é uma URL quebrada de /verificar/
  const signedPdfUrl = (rawSignedPdf && !rawSignedPdf.includes('/verificar/'))
    ? safeExternalUrl(rawSignedPdf)
    : null;

  const rawSignUrl = signatureDoc?.sign_url || (clientData.signUrl as string | undefined);
  const signUrl = (rawSignUrl && !rawSignUrl.includes('/verificar/'))
    ? safeExternalUrl(rawSignUrl)
    : null;

  const contratoUrl = signedPdfUrl || signUrl;

  const dataAssinatura = signatureDoc?.signed_at || (clientData.assinadoEm as string | undefined);
  const dataCriacaoContrato = signatureDoc?.created_at || (clientData.contratoGeradoEm as string | undefined);
  const rawVigencia = clientData.dataInicioVigencia || clientData.vigencia || clientData.dataVigencia;
  const isPastVigencia = rawVigencia ? isDateBeforeToday(String(rawVigencia)) : false;
  const billingDueDateCheck = calculateBillingDueDate({
    rawVigencia,
    rawAssinatura: dataAssinatura,
    createdAt: cotacao.created_at,
    isManualAdmin: false,
  });

  const cobrancaInitialData: CobrancaAsaasInitialData = {
    valorTotal: totalAmountNum || Number(cotacao.premio_final ?? cotacao.premio_calculado ?? 0),
    qtdParcelas: numParcelas,
    dueDate: String(clientData.dataVencimento || billingDueDateCheck?.dueDate || ''),
    billingType: (paymentOrder?.billing_type as 'BOLETO' | 'PIX') || 'BOLETO',
    description: `Seguro RC Profissional - Plano ${planoNome}`,
    isAssinado,
    existingPayment: (paymentOrder || checkoutId) ? {
      id: paymentOrder?.id || checkoutId,
      externalId: checkoutId || paymentOrder?.id || null,
      status: paymentOrder?.status || 'pending',
      amount: paymentOrder ? parseFloat(paymentOrder.amount_total) || 0 : totalAmountNum,
      installments: paymentOrder?.installment_count || numParcelas,
      dueDate: String(clientData.dataVencimento || paymentOrder?.due_date || ''),
      bankSlipUrl: linkBoleto || null,
      invoiceUrl: linkBoleto || null,
    } : null,
  };

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      {/* Voltar */}
      <Link href="/admin/cotacoes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
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
            {(Boolean(linkBoleto) || Boolean(checkoutId) || cotacao.status === 'assinado' || cotacao.status === 'pagamento_gerado') && (
              <EnviarFaturaEmailButton
                cotacaoId={cotacao.id}
                clientName={cotacao.client_name || String(clientData.nome || '')}
                clientEmail={cotacao.client_email || String(clientData.email || '')}
                valor={cotacao.premio_final || cotacao.premio_calculado}
                vencimento={clientData.dataVencimento ? String(clientData.dataVencimento) : undefined}
                hasLink={Boolean(linkBoleto)}
                variant="outline"
              />
            )}
            <EditarPropostaButton
              cotacao={{
                id: cotacao.id,
                status: cotacao.status,
                client_name: cotacao.client_name,
                client_cpf_cnpj: cotacao.client_cpf_cnpj,
                client_email: cotacao.client_email,
                client_phone: cotacao.client_phone,
                importancia_segurada: cotacao.importancia_segurada,
                premio_final: cotacao.premio_final ?? cotacao.premio_calculado ?? (clientData.valor ? Number(clientData.valor) : null),
                notes: cotacao.notes,
                client_data: clientData,
                product_id: cotacao.product_id,
                product_flow_key: cotacao.product_flow_key,
                partner_id: cotacao.partner_id,
              }}
              variant="outline"
              size="sm"
            />
            <TransferirParceiroCotacaoButton
              cotacaoId={cotacao.id}
              cotacaoTitle={`Cotação #${cotacao.id.slice(0, 8)} · ${cotacao.client_name}`}
              currentPartner={{
                id: cotacao.partner_id,
                name: cotacao.partner_name,
                userName: cotacao.partner_user_name,
                isActive: cotacao.partner_status === 'active',
              }}
              variant="outline"
              size="sm"
            />
            {cotacao.status === 'rascunho' && (
              <Link
                href={`/admin/cotacoes/nova?cotacaoId=${cotacao.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
                title="Dar continuidade a esta cotação rascunho"
              >
                <Play size={13} className="fill-current" /> Dar Continuidade à Cotação
              </Link>
            )}
            {isDev && (
              <ExcluirCotacaoButton
                cotacaoId={cotacao.id}
                clientName={cotacao.client_name}
                variant="header"
                redirectTo="/admin/cotacoes"
              />
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
            href={`/admin/cotacoes/nova?cotacaoId=${cotacao.id}`}
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
                premio_final: cotacao.premio_final ?? cotacao.premio_calculado ?? (clientData.valor ? Number(clientData.valor) : null),
                notes: cotacao.notes,
                client_data: clientData,
                product_id: cotacao.product_id,
                product_flow_key: cotacao.product_flow_key,
                partner_id: cotacao.partner_id,
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
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium block">Vendedor / Parceiro</span>
                <TransferirParceiroCotacaoButton
                  cotacaoId={cotacao.id}
                  cotacaoTitle={`Cotação #${cotacao.id.slice(0, 8)} · ${cotacao.client_name}`}
                  currentPartner={{
                    id: cotacao.partner_id,
                    name: cotacao.partner_name,
                    userName: cotacao.partner_user_name,
                    isActive: cotacao.partner_status === 'active',
                  }}
                  variant="ghost"
                  size="sm"
                  className="p-0 min-h-0 text-[#0e4a5a] text-[11px] font-semibold hover:underline"
                >
                  <span>Mudar</span>
                </TransferirParceiroCotacaoButton>
              </div>
              <span className="font-semibold text-slate-900 block">{cotacao.partner_name}</span>
              {cotacao.partner_user_name && (
                <span className="text-[11px] text-slate-500 block">Corretor: {cotacao.partner_user_name}</span>
              )}
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
          {clientData.logradouro && (
            <div className="pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">Endereço Cadastrado</span>
              <p className="text-slate-700 mt-1 font-medium">
                {String(clientData.logradouro)}, {String(clientData.numero || 'S/N')} · {String(clientData.bairro || '')} · {String(clientData.cidade || '')}/{String(clientData.uf || '')} (CEP: {String(clientData.cep || '')})
              </p>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-amber-50/80 border border-amber-200/80 p-3 rounded-xl">
                  <div>
                    <span className="font-bold text-amber-900 block">Cobrança Asaas Gerada</span>
                    <span className="text-amber-700 text-[11px] block">ID: {checkoutId || 'Asaas'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                    <GerenciarCobrancaButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name}
                      mode="edit"
                      variant="card"
                      initialData={cobrancaInitialData}
                      label="Editar Cobrança"
                    />
                    <EnviarFaturaEmailButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name || String(clientData.nome || '')}
                      clientEmail={cotacao.client_email || String(clientData.email || '')}
                      valor={cotacao.premio_final || cotacao.premio_calculado}
                      vencimento={clientData.dataVencimento ? String(clientData.dataVencimento) : undefined}
                      hasLink={Boolean(linkBoleto)}
                      variant="card"
                    />
                    {isDev && (
                      <ExcluirBoletoButton
                        id={checkoutId || paymentOrder?.id || cotacao.id}
                        variant="card"
                      />
                    )}
                  </div>
                </div>

                {clientData.dataVencimento && (
                  <p className="text-xs text-slate-500 font-medium">
                    Data de Vencimento: <strong className="text-slate-900">{formatDate(String(clientData.dataVencimento))}</strong>
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-medium">Nenhuma fatura do Asaas foi gerada para esta cotação ainda.</p>
                <div className="pt-1 space-y-2">
                  {billingDueDateCheck.isPastVigencia && (
                    <div
                      className={`text-xs p-3 rounded-xl border ${
                        billingDueDateCheck.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <strong className="block font-bold mb-0.5">
                        {billingDueDateCheck.ok
                          ? 'ℹ️ Vigência anterior à data atual (Assinatura no Prazo Tolerado):'
                          : '⚠️ Vigência anterior à data atual:'}
                      </strong>
                      <span>
                        {billingDueDateCheck.ok ? (
                          <>
                            O contrato foi assinado em até 2 dias úteis após a vigência. O vencimento da cobrança sugerido será a <strong>data da assinatura + 2 dias úteis ({formatDate(billingDueDateCheck.dueDate || '')})</strong>.
                          </>
                        ) : (
                          <>
                            {billingDueDateCheck.error}{' '}
                            Como administrador/desenvolvedor, você pode revisar e ajustar a data de vencimento e valores desejados antes de emitir a cobrança.
                          </>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <GerenciarCobrancaButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name}
                      mode="create"
                      variant="card"
                      initialData={cobrancaInitialData}
                      label="Criar Cobrança Asaas"
                    />
                    <EnviarFaturaEmailButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name || String(clientData.nome || '')}
                      clientEmail={cotacao.client_email || String(clientData.email || '')}
                      valor={cotacao.premio_final || cotacao.premio_calculado}
                      vencimento={clientData.dataVencimento ? String(clientData.dataVencimento) : undefined}
                      hasLink={false}
                      variant="card"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contrato & ZapSign */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileCheck size={16} className="text-purple-600" /> Contrato & Assinatura (ZapSign)
              </h2>
              {(isAssinado || Boolean(docToken) || cotacao.status === 'contrato_gerado') && (
                <VerificarZapSignButton id={cotacao.id} variant="compact" label="Sincronizar ZapSign" />
              )}
            </div>

            {isAssinado ? (
              <div className="space-y-4">
                {/* Banner de Status Limpo e Elegante */}
                <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900 shrink-0">
                    <CheckCircle2 size={15} className="text-purple-700 shrink-0" />
                    <span>Contrato Assinado</span>
                  </span>
                  {docToken && (
                    <span
                      className="text-[11px] font-mono text-purple-700 bg-purple-100/70 border border-purple-200/60 px-2 py-0.5 rounded-md truncate max-w-[180px]"
                      title={`ID ZapSign: ${docToken}`}
                    >
                      ID: {docToken.slice(0, 12)}...
                    </span>
                  )}
                </div>

                {/* Grid de Metadados em 2 colunas proporcionais */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Assinado em</span>
                    <strong className="text-slate-900 font-semibold block mt-0.5">
                      {dataAssinatura ? formatDateTime(String(dataAssinatura)) : 'Confirmado'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Gerado em</span>
                    <span className="text-slate-700 font-medium block mt-0.5">
                      {dataCriacaoContrato ? formatDateTime(String(dataCriacaoContrato)) : '—'}
                    </span>
                  </div>
                </div>

                {/* Barra de Ações com download direto e visualização */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/cotacoes/${cotacao.id}/contrato-pdf?download=true`}
                    download
                    className="inline-flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-xs shrink-0 cursor-pointer"
                    title="Baixar Contrato Assinado (PDF) para arquivamento"
                  >
                    <Download size={14} className="shrink-0" />
                    <span>Baixar Contrato (PDF)</span>
                  </a>

                  <a
                    href={`/api/cotacoes/${cotacao.id}/contrato-pdf?download=false`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-purple-700 bg-slate-100 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 px-3 py-2 rounded-xl transition-colors shrink-0"
                    title="Visualizar Contrato Assinado (PDF) em nova aba"
                  >
                    <Eye size={13} className="shrink-0" />
                    <span>Visualizar PDF</span>
                    <ExternalLink size={11} className="opacity-70 shrink-0" />
                  </a>

                  {signUrl && (
                    <a
                      href={signUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-purple-700 px-2.5 py-2 transition-colors shrink-0"
                      title="Abrir no ZapSign"
                    >
                      <span>Ver no ZapSign</span>
                      <ExternalLink size={11} className="opacity-70 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            ) : signUrl || docToken || cotacao.status === 'contrato_gerado' ? (
              <div className="space-y-4">
                {/* Banner de Status Limpo */}
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 shrink-0">
                    <Clock size={15} className="text-amber-700 shrink-0" />
                    <span>Aguardando Assinatura</span>
                  </span>
                  {docToken && (
                    <span
                      className="text-[11px] font-mono text-amber-800 bg-amber-100/70 border border-amber-200/60 px-2 py-0.5 rounded-md truncate max-w-[180px]"
                      title={`ID ZapSign: ${docToken}`}
                    >
                      ID: {docToken.slice(0, 12)}...
                    </span>
                  )}
                </div>

                {/* Grid de Metadados */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Situação</span>
                    <span className="text-amber-900 font-semibold block mt-0.5">Pendente do proponente</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Gerado em</span>
                    <span className="text-slate-700 font-medium block mt-0.5">
                      {dataCriacaoContrato ? formatDateTime(String(dataCriacaoContrato)) : '—'}
                    </span>
                  </div>
                </div>

                {/* Barra de Ações */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">{signUrl && (
                    <>
                      <CopiarLinkAssinaturaButton signUrl={signUrl} />
                      <a
                        href={signUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-amber-800 bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 px-3 py-2 rounded-xl transition-colors shrink-0"
                        title="Abrir link de assinatura em nova aba"
                      >
                        <span>✍️ Abrir Link</span>
                        <ExternalLink size={11} className="opacity-70 shrink-0" />
                      </a>
                    </>
                  )}
                  {docToken && (
                    <a
                      href={`/api/cotacoes/${cotacao.id}/contrato-pdf?download=true`}
                      download
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-amber-800 bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 px-3 py-2 rounded-xl transition-colors shrink-0"
                      title="Baixar minuta do contrato em PDF"
                    >
                      <Download size={13} className="shrink-0" />
                      <span>Baixar Minuta (PDF)</span>
                    </a>
                  )}
                  <VerificarZapSignButton id={cotacao.id} variant="card" label="Verificar se já Assinou" />
                  <EnviarPropostaEmailButton
                    cotacaoId={cotacao.id}
                    clientName={cotacao.client_name || String(clientData.nome || '')}
                    clientEmail={cotacao.client_email || String(clientData.email || '')}
                    valor={cotacao.premio_final || cotacao.premio_calculado}
                    cobertura={cotacao.importancia_segurada}
                    variant="outline"
                    label="Reenviar por E-mail"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-slate-500 font-medium">
                  O contrato digital ainda não foi gerado ou enviado para o ZapSign.
                </p>
                {cotacao.status === 'rascunho' && (
                  <Link
                    href={`/admin/cotacoes/nova?cotacaoId=${cotacao.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-[#0e4a5a] font-bold hover:underline mt-1"
                  >
                    <span>Continuar preenchimento para gerar contrato →</span>
                  </Link>
                )}
              </div>
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
          <CreditCard size={16} className="text-slate-600" /> Histórico de Parcelas & Ordens Financeiras
        </h2>
        <PagamentosPanel cotacaoId={cotacao.id} liveAsaas canDeleteBoleto={isDev} />
      </div>
    </div>
  );
}

