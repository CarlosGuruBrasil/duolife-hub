'use client';

import { useState } from 'react';
import { RefreshCw, Loader2, CreditCard } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface SincronizarAsaasButtonProps {
  id: string;
  isAdmin?: boolean;
  variant?: 'card' | 'outline' | 'compact';
  label?: string;
  onSuccess?: () => void;
}

export function SincronizarAsaasButton({
  id,
  isAdmin = false,
  variant = 'outline',
  label,
  onSuccess,
}: SincronizarAsaasButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleSincronizar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    try {
      const endpoint = isAdmin
        ? `/api/admin/cotacoes/${id}/sincronizar-asaas`
        : `/api/portal/cotacoes/${id}/sincronizar-asaas`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        toast.error(body.error || 'Erro ao sincronizar cobranças com o Asaas. Verifique a chave de API.');
        return;
      }

      if (body.paid) {
        toast.success(`Pagamento CONFIRMADO no Asaas! Cotação atualizada para ${body.statusAfter?.toUpperCase() || 'APROVADA'}.`);
        if (onSuccess) {
          onSuccess();
        } else {
          setTimeout(() => window.location.reload(), 1200);
        }
      } else if (body.chargesFound > 0) {
        toast.warning(`Foram localizadas ${body.chargesFound} cobrança(s) no Asaas, porém nenhuma consta como paga/confirmada.`);
      } else {
        toast.info('Nenhuma cobrança localizada no Asaas para este cliente ou cotação.');
      }
    } catch {
      toast.error('Erro de comunicação ao tentar sincronizar com o Asaas.');
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'card') {
    return (
      <button
        onClick={handleSincronizar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 bg-[#0e4a5a] hover:bg-[#072a33] text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Consultar pagamentos e cartão de crédito no Asaas"
      >
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            <span>Consultando Asaas...</span>
          </>
        ) : (
          <>
            <CreditCard size={13} />
            <span>{label || 'Sincronizar Pagamento Asaas'}</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleSincronizar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 hover:text-[#0e4a5a] bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
        title="Sincronizar pagamento com o Asaas"
      >
        {loading ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            <span>Verificando...</span>
          </>
        ) : (
          <>
            <RefreshCw size={11} />
            <span>{label || 'Sincronizar Asaas'}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleSincronizar}
      disabled={loading}
      className="inline-flex items-center gap-1.5 border border-[#0e4a5a]/30 text-[#0e4a5a] hover:bg-[#0e4a5a]/5 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
      title="Sincronizar pagamentos e cartão de crédito no Asaas"
    >
      {loading ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span>Consultando Asaas...</span>
        </>
      ) : (
        <>
          <CreditCard size={13} />
          <span>{label || 'Sincronizar Asaas'}</span>
        </>
      )}
    </button>
  );
}
