'use client';

import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';

interface VerificarZapSignButtonProps {
  id: string;
  variant?: 'card' | 'outline' | 'compact';
  label?: string;
}

export function VerificarZapSignButton({
  id,
  variant = 'outline',
  label,
}: VerificarZapSignButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleVerificar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    try {
      const res = await fetch(`/api/portal/cotacoes/${id}/verificar-assinatura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        alert(body.error || 'Erro ao consultar ZapSign. Verifique a chave de API ou se o documento ainda existe.');
        return;
      }

      if (body.assinado) {
        alert('Contrato confirmado como ASSINADO no ZapSign!');
      } else {
        alert('O contrato ainda consta como PENDENTE de assinatura no ZapSign.');
      }
      window.location.reload();
    } catch {
      alert('Erro de comunicação ao tentar verificar assinatura no ZapSign.');
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'card') {
    return (
      <button
        onClick={handleVerificar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Consultar status atualizado no ZapSign"
      >
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            <span>Consultando ZapSign...</span>
          </>
        ) : (
          <>
            <RefreshCw size={13} />
            <span>{label || 'Verificar Assinatura Agora'}</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleVerificar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 hover:text-purple-700 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
        title="Sincronizar status com o ZapSign"
      >
        {loading ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            <span>Verificando...</span>
          </>
        ) : (
          <>
            <RefreshCw size={11} />
            <span>{label || 'Sincronizar ZapSign'}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleVerificar}
      disabled={loading}
      className="inline-flex items-center gap-1.5 border border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
      title="Sincronizar status com o ZapSign"
    >
      {loading ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span>Consultando ZapSign...</span>
        </>
      ) : (
        <>
          <RefreshCw size={13} />
          <span>{label || 'Verificar Status ZapSign'}</span>
        </>
      )}
    </button>
  );
}
