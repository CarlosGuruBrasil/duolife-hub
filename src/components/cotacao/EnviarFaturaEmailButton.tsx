'use client';

import { useState, useEffect, useRef } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle, X, Clock } from 'lucide-react';

interface EnviarFaturaEmailButtonProps {
  cotacaoId: string;
  clientName?: string;
  clientEmail?: string;
  valor?: number | string;
  vencimento?: string;
  hasLink?: boolean;
  variant?: 'card' | 'compact' | 'outline';
}

export function EnviarFaturaEmailButton({
  cotacaoId,
  clientName,
  clientEmail,
  valor,
  vencimento,
  hasLink = true,
  variant = 'card',
}: EnviarFaturaEmailButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // Limpa feedback após 8 segundos
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 8000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  async function handleConfirmarEnvio() {
    setModalOpen(false);
    setLoading(true);
    setFeedback(null);
    setCooldown(20); // Trava o botão imediatamente por 20 segundos

    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/enviar-fatura-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setFeedback({
          type: 'error',
          message: data.error || 'Erro ao enviar e-mail com a fatura. Tente novamente.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: data.message || `E-mail com a fatura enviado com sucesso para ${clientEmail || 'o cliente'}!`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: 'Erro de conexão com o servidor ao solicitar o envio do e-mail.',
      });
    } finally {
      setLoading(false);
    }
  }

  const isButtonDisabled = loading || cooldown > 0;

  // Formatação de valor e vencimento para o modal
  const valorFormatado = valor
    ? typeof valor === 'number'
      ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : valor.startsWith('R$')
      ? valor
      : `R$ ${valor}`
    : null;

  const vencimentoFormatado = vencimento
    ? vencimento.includes('-')
      ? vencimento.split('T')[0].split('-').reverse().join('/')
      : vencimento
    : null;

  return (
    <>
      <div className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={isButtonDisabled}
          className={`inline-flex items-center gap-1.5 font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60 select-none ${
            variant === 'card'
              ? 'bg-primary hover:bg-[#0b3b47] text-white px-3.5 py-1.5 text-xs'
              : variant === 'compact'
              ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 text-[11px]'
              : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-3 py-1.5 text-xs'
          }`}
          title={
            cooldown > 0
              ? `Aguarde ${cooldown}s para enviar novamente`
              : 'Enviar e-mail com a fatura e instruções de pagamento'
          }
        >
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin text-white" />
              <span>Disparando E-mail...</span>
            </>
          ) : cooldown > 0 ? (
            <>
              <Clock size={13} className="animate-pulse text-amber-300" />
              <span>Aguarde ({cooldown}s)...</span>
            </>
          ) : (
            <>
              <Mail size={13} />
              <span>Enviar Fatura por E-mail</span>
            </>
          )}
        </button>

        {/* Feedback visual inline de envio */}
        {feedback && (
          <div
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border animate-in fade-in duration-200 mt-0.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={12} className="text-red-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}
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
                    Confirmar Envio de Fatura
                  </h3>
                  <p className="text-xs text-gray-500">
                    Disparo oficial via gatilho de fatura gerada
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
                O e-mail oficial com os links da <strong>fatura</strong>, <strong>código PIX</strong> e{' '}
                <strong>boleto bancário</strong> será enviado agora para o cliente:
              </p>

              {/* Caixa de dados do cliente */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1.5 text-xs text-gray-800">
                <div className="flex justify-between py-0.5 border-b border-gray-200/60">
                  <span className="text-gray-500">Cliente:</span>
                  <span className="font-semibold text-gray-900">{clientName || 'Não informado'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-gray-200/60">
                  <span className="text-gray-500">E-mail:</span>
                  <span className="font-semibold text-primary">{clientEmail || 'Não informado'}</span>
                </div>
                {valorFormatado && (
                  <div className="flex justify-between py-0.5 border-b border-gray-200/60">
                    <span className="text-gray-500">Valor da Fatura:</span>
                    <span className="font-bold text-gray-900">{valorFormatado}</span>
                  </div>
                )}
                {vencimentoFormatado && (
                  <div className="flex justify-between py-0.5 border-b border-gray-200/60">
                    <span className="text-gray-500">Vencimento:</span>
                    <span className="font-semibold text-gray-800">{vencimentoFormatado}</span>
                  </div>
                )}
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">Proposta / Cotação:</span>
                  <span className="font-mono text-gray-700 text-[11px]">{cotacaoId}</span>
                </div>
              </div>

              <p className="text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-[11px]">
                ℹ️ Após a confirmação, o botão ficará temporariamente desativado por <strong>20 segundos</strong> para evitar disparos duplicados acidentais.
              </p>
            </div>

            {/* Rodapé / Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-xl text-xs border border-gray-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                className="bg-primary hover:bg-[#0b3b47] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <Mail size={13} />
                <span>Sim, Enviar Agora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
