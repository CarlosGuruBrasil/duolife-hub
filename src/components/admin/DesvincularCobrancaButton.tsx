'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Unlink2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface DesvincularCobrancaButtonProps {
  cotacaoId: string;
  variant?: 'card' | 'outline' | 'compact';
  label?: string;
  onSuccess?: () => void;
}

export function DesvincularCobrancaButton({
  cotacaoId,
  variant = 'outline',
  label = 'Desvincular Cobrança',
  onSuccess,
}: DesvincularCobrancaButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleDesvincular() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cotacoes/${cotacaoId}/desvincular-cobranca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        toast.error(body.error || 'Erro ao desvincular cobrança');
        return;
      }

      toast.success(body.message || 'Cobrança desvinculada com sucesso!');
      setIsOpen(false);
      if (onSuccess) {
        onSuccess();
      }
      router.refresh();
    } catch {
      toast.error('Erro de comunicação ao desvincular cobrança');
    } finally {
      setLoading(false);
    }
  }

  const modal = isOpen && mounted ? (
    createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
        <div
          className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Desvincular Cobrança</h3>
              <p className="text-xs text-gray-500 mt-1">
                Esta ação remove o vínculo da cobrança local com esta cotação, restaurando a proposta para que a fatura correta possa ser emitida.
              </p>
            </div>
          </div>

          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">Atenção:</p>
            <p className="text-amber-800">
              A cobrança histórica do cliente não será excluída do Asaas, mas deixará de constar vinculada a esta cotação vigente.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={loading}
              onClick={() => setIsOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleDesvincular}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Desvinculando...
                </>
              ) : (
                <>
                  <Unlink2 size={13} /> Confirmar Desvinculação
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  if (variant === 'card') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-2xs cursor-pointer"
          title="Desvincular fatura da cotação"
        >
          <Unlink2 size={13} />
          <span>{label}</span>
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        title="Desvincular fatura da cotação"
      >
        <Unlink2 size={13} />
        <span>{label}</span>
      </button>
      {modal}
    </>
  );
}
