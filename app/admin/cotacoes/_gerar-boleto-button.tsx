'use client';

import { useState } from 'react';
import { Receipt, Loader2 } from 'lucide-react';

interface GerarBoletoButtonProps {
  id: string;
  clientName?: string;
  variant?: 'table' | 'card';
}

export function GerarBoletoButton({ id, clientName, variant = 'table' }: GerarBoletoButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleGerar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const nomeLabel = clientName ? `"${clientName}"` : 'este cliente';
    if (!confirm(`Deseja gerar a fatura / boleto do Asaas para ${nomeLabel}?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/portal/cotacoes/${id}/gerar-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        alert(body.error || 'Erro ao gerar fatura/boleto no Asaas. Verifique as configurações e tente novamente.');
        return;
      }

      alert('Boleto / fatura gerado com sucesso no Asaas!');
      window.location.reload();
    } catch (err) {
      alert('Erro de comunicação ao tentar gerar cobrança no Asaas.');
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'card') {
    return (
      <button
        onClick={handleGerar}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Gerar fatura no Asaas agora"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Gerando Fatura...</span>
          </>
        ) : (
          <>
            <Receipt size={14} />
            <span>Gerar Fatura Asaas</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleGerar}
      disabled={loading}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
      title={`Gerar boleto Asaas para ${clientName || 'o cliente'}`}
    >
      {loading ? (
        <>
          <Loader2 size={11} className="animate-spin" />
          <span>Gerando...</span>
        </>
      ) : (
        <>
          <Receipt size={11} />
          <span>Gerar Boleto</span>
        </>
      )}
    </button>
  );
}
