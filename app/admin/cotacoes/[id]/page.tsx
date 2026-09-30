import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, UserCheck, CreditCard, ShieldCheck, FileCheck, Play, CheckCircle2, Clock, Download, Eye, AlertTriangle, AlertCircle } from 'lucide-react';
import { verifyAuth, isInternalUser, isDevUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { PagamentosPanel } from './_pagamentos-client';
import { EnviarFaturaEmailButton } from '@/components/cotacao/EnviarFaturaEmailButton';
import { SincronizarAsaasButton } from '@/components/cotacao/SincronizarAsaasButton';
import { formatCurrency, formatDate, formatDateTime, formatAtuacao, sanitizePlanFinancials } from '@/lib/format';
import { safeExternalUrl } from '@/lib/safe-url';
import { isDateBeforeToday, calculateBillingDueDate } from '@/lib/business-days';
import EditarPropostaButton from '@/components/modals/EditarPropostaButton';
import TransferirParceiroCotacaoButton from '@/components/modals/TransferirParceiroCotacaoButton';
import { ExcluirCotacaoButton, ExcluirBoletoButton } from '@/components/dev';
import { VerificarZapSignButton } from '../_verificar-zapsign-button';
import { CopiarLinkAssinaturaButton } from '@/components/cotacao/CopiarLinkAssinaturaButton';
import { EnviarPropostaEmailButton } from '@/components/cotacao/EnviarPropostaEmailButton';
import RegerarMinutaButton from '@/components/cotacao/RegerarMinutaButton';
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

export default async function AdminCotacaoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyAuth();
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  const isDev = isDevUser(user);

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isFromVendas = sp.from === 'vendas';

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
  const [sale] = await sql<Array<{
    id: string;
    policy_number: string;
    premio_total: number;
    status: string;
    issue_date: string | null;
    expiry_date: string | null;
    commission_amount: number;
    commission_rate: number | null;
    created_at: string;
  }>>`
    SELECT id, policy_number, premio_total, status, issue_date, expiry_date, commission_amount, commission_rate, created_at
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
    SELECT id, installment_count, billing_type, amount_total, status, due_date::text AS due_date
    FROM payment_orders
    WHERE cotacao_id = ${id}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  // Busca Parcelas em payment_installments
  const installments = await sql<Array<{
    id: string;
    installment_number: number;
    status: string;
    amount: number;
    net_amount: number | null;
    due_date: string;
    billing_type: string;
    invoice_url: string | null;
    bank_slip_url: string | null;
    pix_qr_code_url: string | null;
    paid_at: string | null;
    raw_payload: any;
  }>>`
    SELECT id, installment_number, status, amount, net_amount, due_date::text AS due_date,
           billing_type, invoice_url, bank_slip_url, pix_qr_code_url, paid_at::text AS paid_at, raw_payload
    FROM payment_installments
    WHERE cotacao_id = ${id}
    ORDER BY installment_number ASC
  `;

  // Busca Contrato / Documento de Assinatura ZapSign se houver
  const [signatureDoc] = await sql<Array<{
    id: string;
    external_document_id: string | null;
    sign_url: string | null;
    signed_file_url: string | null;
    status: string;
    signed_at: string | null;
    deadline_at: string | null;
    created_at: string;
  }>>`
    SELECT id, external_document_id, sign_url, signed_file_url, status, signed_at, deadline_at, created_at
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

  const rawSignUrl =
    signatureDoc?.sign_url ||
    (clientData.signUrl as string | undefined) ||
    (docToken && !docToken.includes('/') && !docToken.includes(' ') && docToken.length > 5
      ? `https://app.zapsign.com.br/verificar/${docToken}`
      : undefined);
  const signUrl = rawSignUrl ? safeExternalUrl(rawSignUrl) : null;

  const contratoUrl = signedPdfUrl || signUrl;

  const dataAssinatura = signatureDoc?.signed_at || (clientData.assinadoEm as string | undefined);
  const dataCriacaoContrato = signatureDoc?.created_at || (clientData.contratoGeradoEm as string | undefined);
  const contratoPrazoLimite = (signatureDoc?.deadline_at as string | undefined) || (clientData.contratoPrazoLimite as string | undefined);
  const dataCriacaoMs = dataCriacaoContrato ? new Date(dataCriacaoContrato).getTime() : 0;
  const cotacaoUpdatedAtMs = cotacao.updated_at ? new Date(cotacao.updated_at).getTime() : 0;
  const prazoLimiteMs = contratoPrazoLimite
    ? new Date(contratoPrazoLimite).getTime()
    : (dataCriacaoMs > 0 ? dataCriacaoMs + 7 * 24 * 60 * 60 * 1000 : 0);
  const isMinutaExpired = !isAssinado && prazoLimiteMs > 0 && Date.now() > prazoLimiteMs;
  const prazoLimiteFormatado = prazoLimiteMs > 0 ? new Date(prazoLimiteMs).toISOString() : null;
  const isMinutaOutdated = Boolean(clientData.minutaDesatualizada) ||
    (cotacao.status === 'contrato_gerado' && dataCriacaoMs > 0 && cotacaoUpdatedAtMs - dataCriacaoMs > 5000);
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
    billingType: (paymentOrder?.billing_type as any) || (clientData.billingType as any) || (clientData.formaPagamento as any) || 'UNDEFINED',
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
      billingType: paymentOrder?.billing_type || clientData.billingType || clientData.formaPagamento || null,
    } : null,
  };

  // Determinação dos estados reais de pagamento
  const paidStatuses = ['paid', 'confirmed', 'received', 'received_in_cash'];
  const quoteStatusLower = String(cotacao.status || '').toLowerCase();
  const orderStatusLower = String(paymentOrder?.status || '').toLowerCase();

  const totalInstallmentsCount = installments.length;
  const paidInstallments = installments.filter((inst) =>
    paidStatuses.includes(String(inst.status || '').toLowerCase())
  );
  const paidInstallmentsCount = paidInstallments.length;

  const overdueInstallments = installments.filter((inst) => {
    const s = String(inst.status || '').toLowerCase();
    if (paidStatuses.includes(s)) return false;
    if (s === 'overdue') return true;
    return inst.due_date ? isDateBeforeToday(inst.due_date) : false;
  });

  const isOrderOverdue =
    orderStatusLower === 'overdue' ||
    (Boolean(paymentOrder?.due_date) &&
      !paidStatuses.includes(orderStatusLower) &&
      isDateBeforeToday(String(paymentOrder?.due_date))) ||
    (Boolean(clientData.dataVencimento) &&
      !paidStatuses.includes(orderStatusLower) &&
      isDateBeforeToday(String(clientData.dataVencimento)));

  const allInstallmentsPaid = totalInstallmentsCount > 0 && paidInstallmentsCount === totalInstallmentsCount;

  // Estados de pagamento
  const isPaid =
    paidStatuses.includes(orderStatusLower) ||
    ['aprovada', 'emitida', 'ativa', 'active'].includes(quoteStatusLower) ||
    allInstallmentsPaid;

  const isPartiallyPaid =
    !isPaid &&
    (orderStatusLower === 'partially_paid' || (paidInstallmentsCount > 0 && paidInstallmentsCount < totalInstallmentsCount));

  const isOverdue =
    !isPaid &&
    !isPartiallyPaid &&
    (overdueInstallments.length > 0 || isOrderOverdue);

  const hasCharges = Boolean(checkoutId || linkBoleto || paymentOrder || installments.length > 0);
  const isPending = hasCharges && !isPaid && !isPartiallyPaid && !isOverdue;

  // Metadados adicionais para exibição de pagamento
  const paidAtDate =
    paidInstallments.find((i) => i.paid_at)?.paid_at ||
    (clientData.paidAt as string | undefined) ||
    (clientData.pagoEm as string | undefined) ||
    (clientData.assinadoEm as string | undefined) ||
    null;

  const invoiceUrl =
    linkBoleto ||
    installments.find((i) => i.invoice_url || i.bank_slip_url)?.invoice_url ||
    installments.find((i) => i.invoice_url || i.bank_slip_url)?.bank_slip_url ||
    null;

  const paymentBillingType =
    paymentOrder?.billing_type ||
    installments[0]?.billing_type ||
    (clientData.billingType as string | undefined) ||
    (clientData.formaPagamento as string | undefined) ||
    null;

  const billingTypeFormatted =
    paymentBillingType === 'BOLETO'
      ? 'Boleto Bancário (com PIX)'
      : paymentBillingType === 'PIX'
      ? 'PIX Instantâneo'
      : paymentBillingType === 'CREDIT_CARD'
      ? 'Cartão de Crédito'
      : 'Fatura (Cliente escolhe)';

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      {/* Voltar */}
      <Link
        href={isFromVendas ? "/admin/vendas" : "/admin/cotacoes"}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft size={14} /> {isFromVendas ? 'Voltar para Vendas' : 'Voltar para Cotações'}
      </Link>

      {/* Header Principal da Cotação */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusColor[cotacao.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              {statusLabel[cotacao.status] || cotacao.status}
            </span>
            {sale?.policy_number && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <ShieldCheck size={13} className="text-emerald-700" /> Apólice: {sale.policy_number}
              </span>
            )}
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
      {/* Card Destaque: Venda & Apólice Emitida */}
      {sale && (
        <div className="bg-emerald-50/80 border border-emerald-200/90 p-5 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/80 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100/90 text-emerald-800">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Apólice Emitida &bull; KEV Seguros
                </div>
                <div className="text-lg font-black text-emerald-950 font-mono">
                  {sale.policy_number}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                {sale.status === 'ativa' ? 'Ativa' : sale.status}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-emerald-950 font-medium">
            <div>
              <span className="text-emerald-800 text-[11px] block">Início da Vigência</span>
              <strong className="block text-sm font-bold">{formatDate(sale.issue_date)}</strong>
            </div>
            <div>
              <span className="text-emerald-800 text-[11px] block">Fim da Vigência</span>
              <strong className="block text-sm font-bold">{formatDate(sale.expiry_date)}</strong>
            </div>
            <div>
              <span className="text-emerald-800 text-[11px] block">Prêmio Emitido</span>
              <strong className="block text-sm font-bold">{formatCurrency(sale.premio_total)}</strong>
            </div>
            <div>
              <span className="text-emerald-800 text-[11px] block">Comissão</span>
              <strong className="block text-sm font-bold">
                {formatCurrency(sale.commission_amount)}
                {sale.commission_rate ? ` (${Number(sale.commission_rate)}%)` : ''}
              </strong>
            </div>
          </div>
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
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={16} className={isPaid ? 'text-emerald-700' : isPartiallyPaid ? 'text-sky-700' : isOverdue ? 'text-rose-600' : 'text-amber-600'} /> Situação de Pagamento (Asaas)
              </h2>
              <SincronizarAsaasButton id={cotacao.id} isAdmin={true} variant="compact" label="Sincronizar Asaas" />
            </div>

            {isPaid ? (
              /* ESTADO: PAGO / CONFIRMADO */
              <div className="space-y-4">
                <div className="bg-emerald-50/80 border border-emerald-200/90 text-emerald-950 p-4 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={22} className="text-emerald-700 shrink-0" />
                      <div>
                        <span className="font-bold text-emerald-950 text-sm block">Pagamento Confirmado (Quitado)</span>
                        <span className="text-emerald-800 text-xs block">
                          Cobrança liquidada com sucesso via Asaas &bull; ID: {checkoutId || paymentOrder?.id?.slice(0, 12) || 'Asaas'}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Quitado
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-200/80 text-xs">
                    <div>
                      <span className="text-emerald-800 font-medium block text-[11px]">Valor Total Pago</span>
                      <strong className="text-emerald-950 text-sm font-black block">{valorTotalCalculado}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-medium block text-[11px]">Forma de Pagamento</span>
                      <strong className="text-emerald-950 block">{billingTypeFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-medium block text-[11px]">Data da Compensação</span>
                      <strong className="text-emerald-950 block">
                        {paidAtDate ? formatDateTime(String(paidAtDate)) : 'Confirmado'}
                      </strong>
                    </div>
                  </div>

                  {installments.length > 0 && (
                    <div className="pt-2 border-t border-emerald-200/80 space-y-1.5">
                      <span className="text-emerald-900 font-semibold block text-[11px] uppercase tracking-wider">
                        Parcelas Quitadas ({installments.length})
                      </span>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {installments.map((inst) => (
                          <div
                            key={inst.id}
                            className="bg-white/95 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-800 block">
                                Parcela {inst.installment_number}/{installments.length} &bull; {formatCurrency(Number(inst.amount))}
                              </span>
                              <span className="text-slate-500 block text-[11px]">
                                Vencimento: {formatDate(inst.due_date)} {inst.paid_at ? `· Pago em ${formatDate(inst.paid_at)}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                                <CheckCircle2 size={11} className="text-emerald-700" /> Quitada
                              </span>
                              {(inst.invoice_url || inst.bank_slip_url) && (
                                <a
                                  href={(inst.invoice_url || inst.bank_slip_url)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded-md bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 transition-colors"
                                  title="Abrir recibo desta parcela"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-emerald-200/80 flex flex-wrap items-center gap-2">
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        <span>📄</span>
                        <span>Abrir Recibo / Fatura</span>
                        <ExternalLink size={12} className="shrink-0" />
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
                      hasLink={Boolean(invoiceUrl)}
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
              </div>
            ) : isPartiallyPaid ? (
              /* ESTADO: PAGAMENTO PARCIAL */
              <div className="space-y-4">
                <div className="bg-sky-50/80 border border-sky-200/90 text-sky-950 p-4 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Clock size={22} className="text-sky-700 shrink-0" />
                      <div>
                        <span className="font-bold text-sky-950 text-sm block">
                          Pagamento Parcial ({paidInstallmentsCount} de {totalInstallmentsCount || numParcelas} parcelas pagas)
                        </span>
                        <span className="text-sky-800 text-xs block">
                          Parte das parcelas já foi quitada. Cobrança ativa no Asaas &bull; ID: {checkoutId || paymentOrder?.id?.slice(0, 12) || 'Asaas'}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                      Parcial
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-sky-200/80 text-xs">
                    <div>
                      <span className="text-sky-800 font-medium block text-[11px]">Valor Total</span>
                      <strong className="text-sky-950 text-sm font-black block">{valorTotalCalculado}</strong>
                    </div>
                    <div>
                      <span className="text-sky-800 font-medium block text-[11px]">Forma de Pagamento</span>
                      <strong className="text-sky-950 block">{billingTypeFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-sky-800 font-medium block text-[11px]">Parcelas Pagas</span>
                      <strong className="text-sky-950 block">
                        {paidInstallmentsCount} de {totalInstallmentsCount || numParcelas}
                      </strong>
                    </div>
                  </div>

                  {installments.length > 0 && (
                    <div className="pt-2 border-t border-sky-200/80 space-y-1.5">
                      <span className="text-sky-900 font-semibold block text-[11px] uppercase tracking-wider">
                        Detalhamento das Parcelas
                      </span>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {installments.map((inst) => {
                          const isInstPaid = paidStatuses.includes(String(inst.status || '').toLowerCase());
                          const isInstOverdue = !isInstPaid && (inst.status === 'overdue' || (inst.due_date ? isDateBeforeToday(inst.due_date) : false));
                          const instUrl = inst.invoice_url || inst.bank_slip_url;

                          return (
                            <div
                              key={inst.id}
                              className="bg-white/95 border border-sky-200 rounded-lg p-2.5 flex items-center justify-between text-xs gap-2"
                            >
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  Parcela {inst.installment_number}/{installments.length} &bull; {formatCurrency(Number(inst.amount))}
                                </span>
                                <span className="text-slate-500 block text-[11px]">
                                  Vencimento: {formatDate(inst.due_date)} {isInstPaid && inst.paid_at ? `· Pago em ${formatDate(inst.paid_at)}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isInstPaid ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                                    <CheckCircle2 size={11} className="text-emerald-700" /> Quitada
                                  </span>
                                ) : isInstOverdue ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-md">
                                    <AlertCircle size={11} className="text-rose-700" /> Vencida
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-md">
                                    Aguardando
                                  </span>
                                )}
                                {instUrl && (
                                  <a
                                    href={instUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-800 transition-colors"
                                    title="Abrir fatura desta parcela"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-sky-200/80 flex flex-wrap items-center gap-2">
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        <span>📄</span>
                        <span>Abrir Fatura / Pagamento</span>
                        <ExternalLink size={12} className="shrink-0" />
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
                      hasLink={Boolean(invoiceUrl)}
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
              </div>
            ) : isOverdue ? (
              /* ESTADO: VENCIDO */
              <div className="space-y-4">
                <div className="bg-rose-50/80 border border-rose-200/90 text-rose-950 p-4 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle size={22} className="text-rose-600 shrink-0" />
                      <div>
                        <span className="font-bold text-rose-950 text-sm block">Cobrança Vencida</span>
                        <span className="text-rose-800 text-xs block">
                          O prazo de vencimento expirou sem identificação de liquidação no Asaas &bull; ID: {checkoutId || paymentOrder?.id?.slice(0, 12) || 'Asaas'}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      Vencida
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-rose-200/80 text-xs">
                    <div>
                      <span className="text-rose-800 font-medium block text-[11px]">Valor</span>
                      <strong className="text-rose-950 text-sm font-black block">{valorTotalCalculado}</strong>
                    </div>
                    <div>
                      <span className="text-rose-800 font-medium block text-[11px]">Forma de Pagamento</span>
                      <strong className="text-rose-950 block">{billingTypeFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-rose-800 font-medium block text-[11px]">Vencimento Expirado</span>
                      <strong className="text-rose-900 font-bold block">
                        {clientData.dataVencimento || paymentOrder?.due_date || installments[0]?.due_date
                          ? formatDate(String(clientData.dataVencimento || paymentOrder?.due_date || installments[0]?.due_date))
                          : 'Vencida'}
                      </strong>
                    </div>
                  </div>

                  {installments.length > 0 && (
                    <div className="pt-2 border-t border-rose-200/80 space-y-1.5">
                      <span className="text-rose-900 font-semibold block text-[11px] uppercase tracking-wider">
                        Parcelas ({installments.length})
                      </span>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {installments.map((inst) => {
                          const isInstPaid = paidStatuses.includes(String(inst.status || '').toLowerCase());
                          const instUrl = inst.invoice_url || inst.bank_slip_url;

                          return (
                            <div
                              key={inst.id}
                              className="bg-white/95 border border-rose-200 rounded-lg p-2.5 flex items-center justify-between text-xs gap-2"
                            >
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  Parcela {inst.installment_number}/{installments.length} &bull; {formatCurrency(Number(inst.amount))}
                                </span>
                                <span className="text-rose-700 font-medium block text-[11px]">
                                  Vencimento: {formatDate(inst.due_date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isInstPaid ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                                    <CheckCircle2 size={11} className="text-emerald-700" /> Quitada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-md">
                                    <AlertCircle size={11} className="text-rose-700" /> Vencida
                                  </span>
                                )}
                                {instUrl && (
                                  <a
                                    href={instUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-800 transition-colors"
                                    title="Abrir fatura desta parcela"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-rose-200/80 flex flex-wrap items-center gap-2">
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        <span>📄</span>
                        <span>Abrir Cobrança / PIX</span>
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                    )}
                    <GerenciarCobrancaButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name}
                      mode="edit"
                      variant="card"
                      initialData={cobrancaInitialData}
                      label="Atualizar Vencimento / Cobrança"
                    />
                    <EnviarFaturaEmailButton
                      cotacaoId={cotacao.id}
                      clientName={cotacao.client_name || String(clientData.nome || '')}
                      clientEmail={cotacao.client_email || String(clientData.email || '')}
                      valor={cotacao.premio_final || cotacao.premio_calculado}
                      vencimento={clientData.dataVencimento ? String(clientData.dataVencimento) : undefined}
                      hasLink={Boolean(invoiceUrl)}
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
              </div>
            ) : isPending ? (
              /* ESTADO: AGUARDANDO PAGAMENTO */
              <div className="space-y-4">
                <div className="bg-amber-50/80 border border-amber-200/90 text-amber-950 p-4 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Clock size={22} className="text-amber-700 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-950 text-sm block">Aguardando Pagamento</span>
                        <span className="text-amber-800 text-xs block">
                          Cobrança emitida e aguardando liquidação pelo cliente &bull; ID: {checkoutId || paymentOrder?.id?.slice(0, 12) || 'Asaas'}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Pendente
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-200/80 text-xs">
                    <div>
                      <span className="text-amber-800 font-medium block text-[11px]">Valor</span>
                      <strong className="text-amber-950 text-sm font-black block">{valorTotalCalculado}</strong>
                    </div>
                    <div>
                      <span className="text-amber-800 font-medium block text-[11px]">Forma de Pagamento</span>
                      <strong className="text-amber-950 block">{billingTypeFormatted}</strong>
                    </div>
                    <div>
                      <span className="text-amber-800 font-medium block text-[11px]">Data de Vencimento</span>
                      <strong className="text-amber-950 block">
                        {clientData.dataVencimento || paymentOrder?.due_date || installments[0]?.due_date
                          ? formatDate(String(clientData.dataVencimento || paymentOrder?.due_date || installments[0]?.due_date))
                          : 'Não informada'}
                      </strong>
                    </div>
                  </div>

                  {installments.length > 1 && (
                    <div className="pt-2 border-t border-amber-200/80 space-y-1.5">
                      <span className="text-amber-900 font-semibold block text-[11px] uppercase tracking-wider">
                        Parcelas ({installments.length})
                      </span>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {installments.map((inst) => {
                          const isInstPaid = paidStatuses.includes(String(inst.status || '').toLowerCase());
                          const instUrl = inst.invoice_url || inst.bank_slip_url;

                          return (
                            <div
                              key={inst.id}
                              className="bg-white/95 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between text-xs gap-2"
                            >
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  Parcela {inst.installment_number}/{installments.length} &bull; {formatCurrency(Number(inst.amount))}
                                </span>
                                <span className="text-slate-500 block text-[11px]">
                                  Vencimento: {formatDate(inst.due_date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isInstPaid ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                                    <CheckCircle2 size={11} className="text-emerald-700" /> Quitada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-md">
                                    Aguardando
                                  </span>
                                )}
                                {instUrl && (
                                  <a
                                    href={instUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 transition-colors"
                                    title="Abrir fatura desta parcela"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-amber-200/80 flex flex-wrap items-center gap-2">
                    {invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 !text-white text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        <span>📄</span>
                        <span className="!text-white text-white">
                          {paymentBillingType === 'CREDIT_CARD'
                            ? 'Abrir Fatura / Cartão'
                            : paymentBillingType === 'PIX'
                            ? 'Abrir PIX'
                            : paymentBillingType === 'BOLETO'
                            ? 'Abrir Boleto / Pix'
                            : 'Abrir Fatura'}
                        </span>
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
                      hasLink={Boolean(invoiceUrl)}
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
              </div>
            ) : (
              /* ESTADO: NENHUMA FATURA GERADA */
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
                <div className={`border rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 ${
                  isMinutaExpired
                    ? 'bg-rose-50/90 border-rose-200'
                    : isMinutaOutdated
                    ? 'bg-amber-50/90 border-amber-300'
                    : 'bg-amber-50/70 border-amber-200/80'
                }`}>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 shrink-0">
                    <Clock size={15} className={isMinutaExpired ? 'text-rose-600' : 'text-amber-700'} />
                    <span>{isMinutaExpired ? 'Minuta Expirada (Prazo de 7 dias)' : 'Aguardando Assinatura'}</span>
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

                {/* Avisos Contextuais de Minuta Desatualizada ou Expirada */}
                {isMinutaOutdated && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Minuta desatualizada:</strong>
                      <span>Os dados da proposta ou do cliente foram alterados após a geração do contrato. Clique no botão <strong>Regerar Minuta</strong> abaixo para cancelar o contrato anterior na ZapSign e emitir o documento corrigido.</span>
                    </div>
                  </div>
                )}

                {isMinutaExpired && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
                    <Clock size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Prazo de assinatura expirado (7 dias corridos):</strong>
                      <span>O prazo de validade deste link foi encerrado na ZapSign. Clique em <strong>Regerar Minuta</strong> para emitir um novo contrato válido por mais 7 dias.</span>
                    </div>
                  </div>
                )}

                {/* Grid de Metadados */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Situação</span>
                    <span className={`font-semibold block mt-0.5 ${isMinutaExpired ? 'text-rose-700' : 'text-amber-900'}`}>
                      {isMinutaExpired ? 'Prazo Expirado' : 'Pendente do proponente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Gerado em</span>
                    <span className="text-slate-700 font-medium block mt-0.5">
                      {dataCriacaoContrato ? formatDateTime(String(dataCriacaoContrato)) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Validade (7 dias)</span>
                    <span className={`font-semibold block mt-0.5 ${isMinutaExpired ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                      {prazoLimiteFormatado ? formatDateTime(prazoLimiteFormatado) : '—'}
                    </span>
                  </div>
                </div>

                {/* Link Direto de Assinatura (ZapSign) */}
                {signUrl && !isMinutaExpired && (
                  <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3.5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <FileText size={14} className="text-amber-700 shrink-0" />
                        Link Direto para Assinatura (ZapSign)
                      </span>
                      <a
                        href={signUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#0e4a5a] hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <span>Abrir no ZapSign</span>
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={signUrl}
                        className="form-input text-xs font-mono bg-white text-slate-800 py-1.5 px-3 select-all flex-1 border border-slate-300 rounded-lg focus:outline-none"
                      />
                      <CopiarLinkAssinaturaButton signUrl={signUrl} />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Disponibilize este link diretamente ao cliente para realização da assinatura digital.
                    </p>
                  </div>
                )}

                {/* Barra de Ações */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <RegerarMinutaButton
                    cotacaoId={cotacao.id}
                    isOutdated={isMinutaOutdated}
                    isExpired={isMinutaExpired}
                    docToken={docToken}
                    prazoLimite={prazoLimiteFormatado}
                  />
                  {signUrl && !isMinutaExpired && (
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

