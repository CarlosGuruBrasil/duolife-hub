'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  Building2,
  User,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Download,
  X,
  FileSignature,
  ShieldCheck,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { safeExternalUrl } from '@/lib/safe-url';

export type PapelSignatario = 'cliente' | 'corretora' | 'outro';

export interface SignatarioContrato {
  id?: string;
  papel: PapelSignatario;
  tituloPapel: string;
  nome: string;
  documento?: string | null;
  email?: string | null;
  assinado: boolean;
  assinadoEm?: string | null;
  signUrl?: string | null;
}

export interface ModalAssinaturasContratoProps {
  isOpen: boolean;
  onClose: () => void;
  // Contexto da cotação
  cotacaoId?: string;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  clienteEmail?: string | null;
  produtoNome?: string | null;
  // Assinaturas estruturadas
  signatarios?: SignatarioContrato[];
  totalAssinaturas?: number;
  statusAssinatura?: string | null;
  // Signatários simplificados (fallback quando signatarios[] não é fornecido)
  clienteAssinado?: boolean;
  clienteSignUrl?: string | null;
  clienteAssinadoEm?: string | null;
  corretoraNome?: string | null;
  corretoraDocumento?: string | null;
  corretoraEmail?: string | null;
  corretoraAssinado?: boolean;
  corretoraSignUrl?: string | null;
  corretoraAssinadoEm?: string | null;
  // Documentos
  pdfUrl?: string | null;
  minutaUrl?: string | null;
  isContratoAssinado?: boolean;
}

export interface ResolverSignatariosParams {
  signatariosProp?: SignatarioContrato[];
  isContratoAssinado?: boolean;
  clienteAssinado?: boolean;
  statusAssinatura?: string | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  clienteEmail?: string | null;
  clienteAssinadoEm?: string | null;
  clienteSignUrl?: string | null;
  totalAssinaturas?: number;
  corretoraNome?: string | null;
  corretoraDocumento?: string | null;
  corretoraEmail?: string | null;
  corretoraAssinado?: boolean;
  corretoraSignUrl?: string | null;
  corretoraAssinadoEm?: string | null;
}

export function resolverSignatariosContrato(params: ResolverSignatariosParams): SignatarioContrato[] {
  if (params.signatariosProp && params.signatariosProp.length > 0) {
    return params.signatariosProp;
  }

  const lista: SignatarioContrato[] = [];

  // 1. Cliente / Proponente
  const isClienteDone = Boolean(
    params.isContratoAssinado ||
    params.clienteAssinado ||
    params.statusAssinatura === 'falta_corretora' ||
    params.statusAssinatura === 'todas_assinadas'
  );

  lista.push({
    id: 'cliente',
    papel: 'cliente',
    tituloPapel: 'Cliente / Proponente',
    nome: params.clienteNome || 'Proponente / Segurado',
    documento: params.clienteDocumento,
    email: params.clienteEmail,
    assinado: isClienteDone,
    assinadoEm: params.clienteAssinadoEm,
    signUrl: safeExternalUrl(params.clienteSignUrl),
  });

  // 2. Corretora (se requerido no contrato de 2 assinaturas ou se houver dados de corretora)
  const is2Assinaturas =
    params.totalAssinaturas !== 1 &&
    (params.totalAssinaturas === 2 ||
      Boolean(params.corretoraSignUrl) ||
      ['falta_corretora', 'falta_cliente', 'faltam_ambas'].includes(String(params.statusAssinatura)));

  if (is2Assinaturas) {
    const isCorretoraDone = Boolean(
      params.isContratoAssinado ||
      params.corretoraAssinado ||
      params.statusAssinatura === 'falta_cliente' ||
      params.statusAssinatura === 'todas_assinadas'
    );

    lista.push({
      id: 'corretora',
      papel: 'corretora',
      tituloPapel: 'Corretora (Estipulante Coletiva)',
      nome: params.corretoraNome || 'Net4Life Corretora',
      documento: params.corretoraDocumento,
      email: params.corretoraEmail,
      assinado: isCorretoraDone,
      assinadoEm: params.corretoraAssinadoEm,
      signUrl: safeExternalUrl(params.corretoraSignUrl),
    });
  }

  return lista;
}

export function ModalAssinaturasContrato({
  isOpen,
  onClose,
  cotacaoId,
  clienteNome,
  clienteDocumento,
  clienteEmail,
  produtoNome,
  signatarios: signatariosProp,
  totalAssinaturas,
  statusAssinatura,
  clienteAssinado,
  clienteSignUrl,
  clienteAssinadoEm,
  corretoraNome,
  corretoraDocumento,
  corretoraEmail,
  corretoraAssinado,
  corretoraSignUrl,
  corretoraAssinadoEm,
  pdfUrl,
  minutaUrl,
  isContratoAssinado = false,
}: ModalAssinaturasContratoProps) {
  // Trava scroll do body enquanto o modal estiver aberto
  useBodyScrollLock(isOpen);

  // Estado para feedback de cópia de link (armazena o ID ou papel do signatário copiado)
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fecha modal com a tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Monta a lista unificada de signatários
  const signatarios = useMemo<SignatarioContrato[]>(() => {
    return resolverSignatariosContrato({
      signatariosProp,
      isContratoAssinado,
      clienteAssinado,
      statusAssinatura,
      clienteNome,
      clienteDocumento,
      clienteEmail,
      clienteAssinadoEm,
      clienteSignUrl,
      totalAssinaturas,
      corretoraNome,
      corretoraDocumento,
      corretoraEmail,
      corretoraAssinado,
      corretoraSignUrl,
      corretoraAssinadoEm,
    });
  }, [
    signatariosProp,
    isContratoAssinado,
    clienteAssinado,
    statusAssinatura,
    clienteNome,
    clienteDocumento,
    clienteEmail,
    clienteAssinadoEm,
    clienteSignUrl,
    totalAssinaturas,
    corretoraSignUrl,
    corretoraAssinado,
    corretoraNome,
    corretoraDocumento,
    corretoraEmail,
    corretoraAssinadoEm,
  ]);

  // Contagem de assinaturas
  const totalAssinados = useMemo(
    () => signatarios.filter((s) => s.assinado).length,
    [signatarios]
  );
  const totalGeral = signatarios.length;
  const todasConcluidas = totalGeral > 0 && totalAssinados === totalGeral;

  // Função para copiar link de assinatura com fallback robusto
  const handleCopyLink = useCallback(async (key: string, url: string) => {
    if (!url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Ignora erro de cópia silenciosamente
    }
  }, []);

  if (!isOpen) return null;

  // Define URL do PDF da Minuta ou Contrato Assinado
  const resolvedPdfUrl =
    safeExternalUrl(pdfUrl) ||
    safeExternalUrl(minutaUrl) ||
    (cotacaoId
      ? `/api/cotacoes/${cotacaoId}/contrato-pdf${isContratoAssinado ? '?download=true' : ''}`
      : null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-assinaturas-title"
      aria-describedby="modal-assinaturas-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-gray-200 bg-white">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">
                <FileSignature size={13} className="text-[#0e4a5a] shrink-0" />
                <span>Assinatura Digital ZapSign</span>
              </span>

              {/* Badge de Progresso */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                  todasConcluidas
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : totalAssinados > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {todasConcluidas ? (
                  <CheckCircle2 size={13} className="text-emerald-700 shrink-0" />
                ) : (
                  <Clock size={13} className="text-amber-700 shrink-0" />
                )}
                <span>
                  {`${totalAssinados} de ${totalGeral} assinada${totalGeral > 1 ? 's' : ''}`}
                </span>
              </span>
            </div>

            <h2
              id="modal-assinaturas-title"
              className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight pt-1 truncate"
            >
              Assinaturas do Contrato
            </h2>

            <p
              id="modal-assinaturas-desc"
              className="text-xs sm:text-sm text-gray-600 truncate"
            >
              {clienteNome || 'Cliente / Proponente'}
              {produtoNome ? ` · ${produtoNome}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl p-2 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 bg-white">
          {/* Card explicativo de segurança e validade */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 sm:p-4 text-xs text-gray-700 space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-gray-900">
              <ShieldCheck size={16} className="text-[#0e4a5a] shrink-0" />
              <span>Assinatura Eletrônica com Validade Jurídica</span>
            </div>
            <p>
              Envie o link de assinatura para as partes envolvidas ou acesse diretamente para assinar.
              O contrato tem validade jurídica garantida pela MP 2.200-2/2001 e auditoria ZapSign.
            </p>
          </div>

          {/* Lista de Signatários */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
                Signatários do Contrato
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {totalGeral} {totalGeral === 1 ? 'parte' : 'partes'}
              </span>
            </div>

            <div className="space-y-3">
              {signatarios.map((signatario, idx) => {
                const uniqueKey = signatario.id || `signatario-${idx}`;
                const isCopied = copiedKey === uniqueKey;
                const isAssinado = signatario.assinado;
                const signUrl = signatario.signUrl;

                return (
                  <div
                    key={uniqueKey}
                    className={`rounded-xl border p-4 transition-all ${
                      isAssinado
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-gray-200 hover:border-gray-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Identificação do Signatário */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isAssinado
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {signatario.papel === 'corretora' ? (
                            <Building2 size={18} />
                          ) : isAssinado ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <User size={18} />
                          )}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-gray-900 truncate">
                              {signatario.nome}
                            </span>
                            <span className="text-[11px] font-semibold text-gray-500">
                              ({signatario.tituloPapel})
                            </span>
                          </div>

                          {(signatario.email || signatario.documento) && (
                            <p className="text-xs text-gray-500 truncate">
                              {signatario.documento && (
                                <span className="font-medium mr-2">
                                  Doc: {signatario.documento}
                                </span>
                              )}
                              {signatario.email && (
                                <span className="text-gray-600">{signatario.email}</span>
                              )}
                            </p>
                          )}

                          {isAssinado && signatario.assinadoEm && (
                            <p className="text-[11px] text-emerald-700 font-medium">
                              Assinado em {signatario.assinadoEm}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0 self-start sm:self-center">
                        {isAssinado ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={14} className="text-emerald-700" />
                            <span>Assinado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock size={14} className="text-amber-700" />
                            <span>Pendente</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações para signatário pendente com link disponível */}
                    {!isAssinado && signUrl && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(uniqueKey, signUrl)}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                            isCopied
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-white hover:bg-gray-50 text-gray-800 border-gray-300 hover:border-gray-400 shadow-2xs'
                          }`}
                          title="Copiar link direto para envio"
                        >
                          {isCopied ? (
                            <>
                              <Check size={15} className="text-emerald-700" />
                              <span>Link Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={15} className="text-gray-600" />
                              <span>Copiar Link</span>
                            </>
                          )}
                        </button>

                        <a
                          href={signUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-[#0e4a5a] hover:bg-[#0b3c49] text-white shadow-2xs transition-colors cursor-pointer"
                          title="Abrir página de assinatura ZapSign em nova aba"
                        >
                          <span>Abrir Assinatura</span>
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    )}

                    {/* Se não houver signUrl direto cadastrado mas o status for pendente */}
                    {!isAssinado && !signUrl && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500 italic">
                        Link de assinatura individual será gerado ou sincronizado automaticamente via ZapSign.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé com Minuta e Ações */}
        <div className="p-4 sm:p-5 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {resolvedPdfUrl ? (
            <a
              href={resolvedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 transition-colors cursor-pointer shadow-2xs"
            >
              {isContratoAssinado ? (
                <>
                  <Download size={15} className="text-emerald-700" />
                  <span>Baixar Contrato Assinado (PDF)</span>
                </>
              ) : (
                <>
                  <FileText size={15} className="text-[#0e4a5a]" />
                  <span>Visualizar Minuta (PDF)</span>
                </>
              )}
            </a>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalAssinaturasContrato;
