'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw, AlertTriangle, CheckCircle2, Clock, X, Loader2, ShieldAlert } from 'lucide-react';

export interface RegerarMinutaButtonProps {
  cotacaoId: string;
  isOutdated: boolean;
  isExpired?: boolean;
  docToken?: string;
  prazoLimite?: string | null;
  onSuccess?: () => void;
  disabled?: boolean;
}

export default function RegerarMinutaButton({
  cotacaoId,
  isOutdated,
  isExpired = false,
  docToken,
  prazoLimite,
  onSuccess,
  disabled = false,
}: RegerarMinutaButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // O botão só é ativo se a minuta estiver desatualizada por alteração de cadastro/proposta OU se tiver expirado
  const isActionRequired = isOutdated || isExpired;
  const isButtonDisabled = disabled || !isActionRequired;

  const tooltipText = isExpired
    ? 'O prazo de assinatura de 7 dias expirou. Clique para regerar a minuta e emitir novo link.'
    : isOutdated
    ? 'Dados da proposta ou cliente foram alterados. Clique para cancelar a minuta anterior e gerar uma nova.'
    : 'A minuta está sincronizada com os dados atuais da proposta. Para regerar, altere algum dado no botão "Editar Proposta".';

  async function handleRegerarMinuta() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/gerar-contrato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forceRecreate: true }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao regerar minuta de contrato na ZapSign.');
      }

      setSuccessMsg('Nova minuta gerada com sucesso! O contrato anterior foi cancelado e o novo link tem 7 dias de validade.');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setIsOpen(false);
        router.refresh();
      }, 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao regerar minuta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="relative inline-flex items-center">
        <button
          type="button"
          disabled={isButtonDisabled}
          onClick={() => setIsOpen(true)}
          title={tooltipText}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-all shrink-0 ${
            isButtonDisabled
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              : isExpired
              ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 shadow-xs cursor-pointer animate-pulse'
              : 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 shadow-xs cursor-pointer ring-2 ring-amber-300/60'
          }`}
        >
          <RotateCw size={13} className={`shrink-0 ${isActionRequired ? 'text-white' : 'text-slate-400'}`} />
          <span>Regerar Minuta</span>
          {isActionRequired && (
            <span className="w-2 h-2 rounded-full bg-white shrink-0 animate-ping" />
          )}
        </button>
      </div>

      {/* Modal de Confirmação para Regerar Minuta */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isExpired
                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Regerar Minuta de Contrato
                  </h3>
                  <p className="text-xs text-slate-500">
                    Substituição de documento na ZapSign
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && setIsOpen(false)}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Motivo / Contexto */}
            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                  <span>Atenção: O que acontecerá ao confirmar?</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-amber-900/90 text-[11.5px] leading-relaxed">
                  <li>
                    A minuta anterior no ZapSign{' '}
                    {docToken && (
                      <span className="font-mono font-semibold bg-amber-100 px-1 py-0.5 rounded">
                        ({docToken.slice(0, 10)}...)
                      </span>
                    )}{' '}
                    será <strong>cancelada e invalidada</strong>.
                  </li>
                  <li>
                    O link anterior deixará de funcionar imediatamente, impedindo que o proponente assine uma versão desatualizada.
                  </li>
                  <li>
                    Uma nova minuta será gerada com <strong>todas as alterações mais recentes</strong> do cliente e da proposta.
                  </li>
                  <li>
                    O novo contrato terá prazo de assinatura de <strong>7 dias corridos</strong> a partir de agora.
                  </li>
                </ul>
              </div>

              {isExpired && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11.5px] flex items-center gap-2 font-medium">
                  <Clock size={15} className="shrink-0 text-rose-600" />
                  <span>O prazo anterior de 7 dias expirou sem assinatura.</span>
                </div>
              )}
            </div>

            {/* Alertas de Feedback */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <ShieldAlert size={15} className="shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer"
              >
                Voltar / Cancelar
              </button>
              <button
                type="button"
                onClick={handleRegerarMinuta}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Cancelando e Regerando Minuta...</span>
                  </>
                ) : (
                  <>
                    <RotateCw size={14} />
                    <span>Sim, Cancelar Anterior e Regerar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
