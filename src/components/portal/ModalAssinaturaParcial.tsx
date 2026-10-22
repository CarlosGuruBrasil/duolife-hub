'use client';

import React, { useEffect } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Building2, 
  UserCheck, 
  ArrowRight, 
  ExternalLink, 
  X, 
  ShieldCheck 
} from 'lucide-react';

export interface ModalAssinaturaParcialProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistrarPreferencia: () => void;
  proponenteNome?: string;
  proponenteEmail?: string;
  signUrlCorretora?: string | null;
}

export function ModalAssinaturaParcial({
  isOpen,
  onClose,
  onRegistrarPreferencia,
  proponenteNome,
  proponenteEmail,
  signUrlCorretora,
}: ModalAssinaturaParcialProps) {
  // Fecha modal com a tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-parcial-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <Clock size={13} className="text-amber-700" />
              <span>Assinatura Parcial &bull; 1 de 2 Concluída</span>
            </span>
            <h3 id="modal-parcial-title" className="text-lg sm:text-xl font-bold text-gray-900 pt-1">
              Quase lá! Falta a assinatura da Corretora
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="text-gray-400 hover:text-gray-600 rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status dos Signatários */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
            Status das Assinaturas no Contrato
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {/* Signatário 1: Proponente */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <UserCheck size={15} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-gray-900 block truncate">
                      {proponenteNome || 'Proponente / Segurado'}
                    </span>
                    <span className="text-[10px] text-gray-500 block truncate">
                      {proponenteEmail || 'Proponente'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit">
                <CheckCircle2 size={12} className="text-emerald-700" />
                <span>Assinado com Sucesso</span>
              </div>
            </div>

            {/* Signatário 2: Corretora */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Building2 size={15} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-gray-900 block truncate">
                      Net4Life Corretora
                    </span>
                    <span className="text-[10px] text-gray-500 block truncate">
                      Estipulante Coletiva
                    </span>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 w-fit">
                <Clock size={12} className="text-amber-700" />
                <span>Aguardando Corretora</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mensagem Explicativa */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-700 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-gray-900">
            <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
            <span>Segurança Jurídica & Apólice Coletiva</span>
          </div>
          <p>
            Para sua segurança e validade da apólice coletiva, a cobrança oficial só será emitida após a assinatura de ambas as partes.
          </p>
          <p className="text-gray-600 font-medium">
            Você já pode registrar a sua forma de pagamento preferida para agilizar a emissão assim que a corretora concluir a assinatura.
          </p>
        </div>

        {/* Ações */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={onRegistrarPreferencia}
            className="btn btn-primary w-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-sm cursor-pointer min-h-[44px]"
          >
            <span>Registrar Forma de Pagamento</span>
            <ArrowRight size={16} />
          </button>

          {signUrlCorretora && (
            <a
              href={signUrlCorretora}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary w-full py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer min-h-[44px]"
            >
              <Building2 size={14} className="text-primary" />
              <span>Assinar agora como Corretora (ZapSign)</span>
              <ExternalLink size={13} className="opacity-70" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-800 py-2 cursor-pointer transition-colors min-h-[44px] flex items-center justify-center"
          >
            Fechar e Revisar Depois
          </button>
        </div>
      </div>
    </div>
  );
}
