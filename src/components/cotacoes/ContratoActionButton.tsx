'use client';

import React, { useState } from 'react';
import { ExternalLink, FileText, FileSignature } from 'lucide-react';
import { ModalAssinaturasContrato, SignatarioContrato } from '@/components/modals/ModalAssinaturasContrato';
import { parseJsonbField } from '@/lib/json-safe';
import { safeExternalUrl } from '@/lib/safe-url';

export interface ContratoActionButtonProps {
  cotacaoId: string;
  cotacao?: {
    id?: string;
    status?: string | null;
    client_name?: string | null;
    client_cpf_cnpj?: string | null;
    client_data?: unknown;
    product_name?: string | null;
    partner_name?: string | null;
  };
  // Propriedades sobrescritas ou diretas
  status?: string | null;
  clientName?: string | null;
  clientCpfCnpj?: string | null;
  clientEmail?: string | null;
  productName?: string | null;
  signUrl?: string | null;
  signUrlCorretora?: string | null;
  contratoPdfUrl?: string | null;
  isContratoAssinado?: boolean;
  totalAssinaturas?: number;
  statusAssinatura?: string | null;
  signatarios?: SignatarioContrato[];
  // Comportamento & Apresentação
  variant?: 'table' | 'badge' | 'card';
  preferDirectSingleSign?: boolean;
  className?: string;
}

export function hasMultiplasAssinaturas(params: {
  totalAssinaturas?: number | null;
  statusAssinatura?: string | null;
  signUrlCorretora?: string | null;
  signatariosCount?: number | null;
}): boolean {
  if (typeof params.totalAssinaturas === 'number') {
    if (params.totalAssinaturas >= 2) return true;
    if (params.totalAssinaturas === 1) return false;
  }
  if (typeof params.signatariosCount === 'number' && params.signatariosCount >= 2) return true;
  if (Boolean(params.signUrlCorretora)) return true;
  if (['falta_corretora', 'falta_cliente', 'faltam_ambas'].includes(String(params.statusAssinatura))) return true;
  return false;
}

export function ContratoActionButton({
  cotacaoId,
  cotacao,
  status: statusProp,
  clientName: clientNameProp,
  clientCpfCnpj: clientCpfCnpjProp,
  clientEmail: clientEmailProp,
  productName: productNameProp,
  signUrl: signUrlProp,
  signUrlCorretora: signUrlCorretoraProp,
  contratoPdfUrl: contratoPdfUrlProp,
  isContratoAssinado: isContratoAssinadoProp,
  totalAssinaturas: totalAssinaturasProp,
  statusAssinatura: statusAssinaturaProp,
  signatarios: signatariosProp,
  variant = 'table',
  preferDirectSingleSign = false,
  className = '',
}: ContratoActionButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Parsing seguro do client_data caso o objeto cotacao tenha sido fornecido
  const clientData = cotacao?.client_data
    ? parseJsonbField<Record<string, any>>(cotacao.client_data)
    : ({} as Record<string, any>);

  const statusRaw = String(statusProp ?? cotacao?.status ?? '').toLowerCase().trim();

  // Determina se o contrato está totalmente assinado
  const isContratoAssinado =
    isContratoAssinadoProp !== undefined
      ? isContratoAssinadoProp
      : [
          'assinado',
          'signed',
          'pagamento_gerado',
          'aprovada',
          'emitida',
          'ativa',
          'active',
        ].includes(statusRaw) ||
        Boolean(clientData.contratoPdf || clientData.signedFileUrl || clientData.assinadoEm);

  // Dados do cliente/proponente
  const resolvedClientName =
    clientNameProp ??
    cotacao?.client_name ??
    (clientData.proponente?.nome as string | undefined) ??
    (clientData.nome as string | undefined) ??
    null;

  const resolvedClientCpfCnpj =
    clientCpfCnpjProp ??
    cotacao?.client_cpf_cnpj ??
    (clientData.proponente?.cpf as string | undefined) ??
    (clientData.cpf as string | undefined) ??
    null;

  const resolvedClientEmail =
    clientEmailProp ??
    (clientData.proponente?.email as string | undefined) ??
    (clientData.email as string | undefined) ??
    null;

  const resolvedProductName =
    productNameProp ??
    cotacao?.product_name ??
    (clientData.planoNome as string | undefined) ??
    (clientData.produto as string | undefined) ??
    null;

  // URLs de assinatura
  const rawSignUrl =
    signUrlProp ??
    (clientData.signUrl as string | undefined) ??
    (clientData.linkContrato as string | undefined);
  const resolvedSignUrl = rawSignUrl ? safeExternalUrl(rawSignUrl) : null;

  const rawSignUrlCorretora =
    signUrlCorretoraProp ??
    (clientData.signUrlCorretora as string | undefined);
  const resolvedSignUrlCorretora = rawSignUrlCorretora
    ? safeExternalUrl(rawSignUrlCorretora)
    : null;

  // Status de assinatura
  const resolvedStatusAssinatura =
    statusAssinaturaProp ??
    (clientData.statusAssinatura as string | undefined) ??
    null;

  // Total de assinaturas necessárias
  const resolvedTotalAssinaturas =
    totalAssinaturasProp ??
    (typeof clientData.totalAssinaturas === 'number'
      ? clientData.totalAssinaturas
      : resolvedSignUrlCorretora ||
        ['falta_corretora', 'falta_cliente', 'faltam_ambas'].includes(String(resolvedStatusAssinatura))
      ? 2
      : 1);

  // URL do PDF do Contrato / Minuta
  const rawSignedPdf =
    contratoPdfUrlProp ??
    (clientData.contratoPdf as string | undefined) ??
    (clientData.signedFileUrl as string | undefined) ??
    (clientData.linkContrato as string | undefined);

  const resolvedPdfUrl =
    rawSignedPdf && !rawSignedPdf.includes('/verificar/')
      ? safeExternalUrl(rawSignedPdf)
      : `/api/cotacoes/${cotacaoId}/contrato-pdf${isContratoAssinado ? '?download=true' : ''}`;

  // Identifica se possui múltiplas assinaturas
  const isMultiAssinaturas = hasMultiplasAssinaturas({
    totalAssinaturas: resolvedTotalAssinaturas,
    statusAssinatura: resolvedStatusAssinatura,
    signUrlCorretora: resolvedSignUrlCorretora,
    signatariosCount: signatariosProp?.length,
  });

  // Handler para abrir modal ou assinar
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Se assinado: deixa o link padrão navegar para o PDF
    if (isContratoAssinado) {
      return;
    }

    // Se for 1 assinatura com link direto e preferência por link direto ativada
    if (!isMultiAssinaturas && resolvedSignUrl && preferDirectSingleSign) {
      return; // Navega diretamente via <a> tag
    }

    // Caso contrário (múltiplas assinaturas ou exibição estruturada de links): abre o modal
    e.preventDefault();
    setIsModalOpen(true);
  };

  // Badge indicador de múltiplas assinaturas ou pendências
  const getBadgeIndicator = () => {
    if (!isMultiAssinaturas) return null;
    if (resolvedStatusAssinatura === 'falta_corretora' || resolvedStatusAssinatura === 'falta_cliente') {
      return '1/2';
    }
    if (resolvedStatusAssinatura === 'faltam_ambas') {
      return '0/2';
    }
    return '2';
  };

  const badgeCount = getBadgeIndicator();

  // ==========================================
  // CENÁRIO A: CONTRATO ASSINADO
  // ==========================================
  if (isContratoAssinado) {
    if (variant === 'badge') {
      return (
        <a
          href={resolvedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-2xs ${className}`}
          title="Baixar Contrato Assinado (PDF)"
        >
          <span>📄 Contrato</span>
          <ExternalLink size={11} className="opacity-75" />
        </a>
      );
    }

    if (variant === 'card') {
      return (
        <a
          href={resolvedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors shadow-2xs cursor-pointer ${className}`}
          title="Baixar Contrato Assinado (PDF)"
        >
          <FileText size={16} className="text-emerald-700" />
          <span>Baixar Contrato Assinado (PDF)</span>
          <ExternalLink size={14} className="opacity-70" />
        </a>
      );
    }

    // Padrão: variant="table"
    return (
      <a
        href={resolvedPdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 px-2.5 py-1 rounded-lg transition-colors shadow-2xs ${className}`}
        title="Baixar Contrato Assinado (PDF)"
      >
        <span>📄 Contrato</span>
        <ExternalLink size={10} className="opacity-75" />
      </a>
    );
  }

  // ==========================================
  // CENÁRIO B: CONTRATO PENDENTE (NÃO ASSINADO)
  // ==========================================

  // Se for apenas 1 assinatura com URL direta e preferDirectSingleSign
  const isDirectSingleLink = !isMultiAssinaturas && Boolean(resolvedSignUrl) && preferDirectSingleSign;

  return (
    <>
      {isDirectSingleLink ? (
        <a
          href={resolvedSignUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={
            variant === 'badge'
              ? `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors shadow-2xs ${className}`
              : variant === 'card'
              ? `w-full min-h-[44px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors shadow-2xs ${className}`
              : `inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/90 px-2.5 py-1 rounded-lg transition-colors shadow-2xs ${className}`
          }
          title="Assinar Contrato no ZapSign"
        >
          {variant === 'card' ? <FileSignature size={16} /> : null}
          <span>✍️ Contrato</span>
          <ExternalLink size={variant === 'card' ? 14 : 10} className="opacity-75" />
        </a>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={
            variant === 'badge'
              ? `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer shadow-2xs ${className}`
              : variant === 'card'
              ? `w-full min-h-[44px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors cursor-pointer shadow-2xs ${className}`
              : `inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/90 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs ${className}`
          }
          title={
            isMultiAssinaturas
              ? 'Ver e gerenciar assinaturas das partes envolvidas (Cliente e Corretora)'
              : 'Ver opções de assinatura e link do contrato'
          }
        >
          {variant === 'card' ? <FileSignature size={16} /> : null}
          <span>✍️ Contrato</span>
          {badgeCount && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
              {badgeCount}
            </span>
          )}
          <ExternalLink size={variant === 'card' ? 14 : 10} className="opacity-75" />
        </button>
      )}

      {/* Modal de Assinaturas Conectado */}
      {isModalOpen && (
        <ModalAssinaturasContrato
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          cotacaoId={cotacaoId}
          clienteNome={resolvedClientName}
          clienteDocumento={resolvedClientCpfCnpj}
          clienteEmail={resolvedClientEmail}
          produtoNome={resolvedProductName}
          signatarios={signatariosProp}
          totalAssinaturas={resolvedTotalAssinaturas}
          statusAssinatura={resolvedStatusAssinatura}
          clienteSignUrl={resolvedSignUrl}
          clienteAssinado={Boolean(clientData.clienteAssinou)}
          clienteAssinadoEm={clientData.assinadoEm as string | undefined}
          corretoraNome={cotacao?.partner_name || (clientData.corretoraNome as string | undefined)}
          corretoraSignUrl={resolvedSignUrlCorretora}
          corretoraAssinado={Boolean(clientData.corretoraAssinou)}
          pdfUrl={resolvedPdfUrl}
          isContratoAssinado={isContratoAssinado}
        />
      )}
    </>
  );
}

export default ContratoActionButton;
