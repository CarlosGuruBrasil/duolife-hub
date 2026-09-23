'use client';

import { useState, useEffect, useRef } from 'react';
import { Mail, Loader2, CheckCircle2, X, Clock, FileText } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface EnviarPropostaEmailButtonProps {
  cotacaoId: string;
  clientName?: string;
  clientEmail?: string;
  valor?: number | string;
  cobertura?: number | string;
  variant?: 'card' | 'compact' | 'outline' | 'amber';
  label?: string;
}

export function EnviarPropostaEmailButton({
  cotacaoId,
  clientName,
  clientEmail,
  valor,
  cobertura,
  variant = 'outline',
  label,
}: EnviarPropostaEmailButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Gerencia o cooldown regressivo de 20 segundos
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  async function handleConfirmarEnvio() {
    setModalOpen(false);
    setLoading(true);
    setCooldown(20); // Trava o botão por 20 segundos

    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/enviar-proposta-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erro ao enviar e-mail com a proposta. Tente novamente.');
        return;
      }

      toast.success(data.message || `E-mail com a proposta enviado com sucesso para ${clientEmail || 'o cliente'}!`);
    } catch {
      toast.error('Erro de conexão com o servidor ao solicitar o envio do e-mail.');
    } finally {
      setLoading(false);
    }
  }

  const isButtonDisabled = loading || cooldown > 0;

  // Formatação de valor para o modal
  const valorFormatado = valor
    ? typeof valor === 'number'
      ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : valor.startsWith('R$')
      ? valor
      : `R$ ${valor}`
    : null;

  const coberturaFormatada = cobertura
    ? typeof cobertura === 'number'
      ? cobertura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : cobertura.startsWith('R$')
      ? cobertura
      : `R$ ${cobertura}`
    : null;

  const buttonLabel = label || 'Enviar por E-mail ao Cliente';

  return (
    <>
      <div className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={isButtonDisabled}
          className={`inline-flex items-center gap-1.5 font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60 select-none ${
            variant === 'card'
              ? 'bg-primary hover:bg-[#0b3b47] text-white px-3.5 py-2 text-xs'
              : variant === 'compact'
              ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 text-[11px]'
              : variant === 'amber'
              ? 'bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 text-xs'
              : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 px-3 py-2 text-xs'
          }`}
          title={
            cooldown > 0
              ? `Aguarde ${cooldown}s para enviar novamente`
              : 'Enviar e-mail para o cliente com link de assinatura ZapSign'
          }
        >
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin text-current" />
              <span>Disparando E-mail...</span>
            </>
          ) : cooldown > 0 ? (
            <>
              <Clock size={13} className="animate-pulse text-amber-500" />
              <span>Aguarde ({cooldown}s)...</span>
            </>
          ) : (
            <>
              <Mail size={13} className="shrink-0" />
              <span>{buttonLabel}</span>
            </>
          )}
        </button>
      </div>

      {/* Modal de Confirmação em Tema Claro (Design System) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl max-w-md w-full text-left space-y-4 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 leading-tight">
                    Enviar Proposta & Contrato
                  </h3>
                  <p className="text-xs text-gray-500">
                    Disparo oficial via gatilho de proposta criada (ZapSign)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Corpo / Mensagem explicativa */}
            <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
              <p>
                O cliente receberá um e-mail personalizado com o resumo da proposta e o botão de acesso direto para a{' '}
                <strong>assinatura digital do contrato via ZapSign</strong>.
              </p>

              {/* Card de Resumo de Dados */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1.5 text-gray-800">
                {clientName && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Segurado:</span>
                    <span className="font-semibold text-gray-900 truncate max-w-[220px]">
                      {clientName}
                    </span>
                  </div>
                )}
                {clientEmail && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">E-mail:</span>
                    <span className="font-mono text-primary font-semibold truncate max-w-[220px]">
                      {clientEmail}
                    </span>
                  </div>
                )}
                {coberturaFormatada && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Cobertura:</span>
                    <span className="font-semibold text-gray-900">
                      {coberturaFormatada}
                    </span>
                  </div>
                )}
                {valorFormatado && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Prêmio:</span>
                    <span className="font-bold text-primary text-sm">
                      {valorFormatado}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-tight">
                  O link de assinatura eletrônica do ZapSign será inserido automaticamente no e-mail.
                </span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-[#0b3b47] rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Mail size={13} />
                <span>Confirmar Envio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
