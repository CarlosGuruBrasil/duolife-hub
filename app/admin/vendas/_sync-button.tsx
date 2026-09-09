'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export default function WixSalesSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
    details?: {
      salesCreated: number;
      salesUpdated: number;
      quotesCreated: number;
      totalRevenue: number;
    };
  } | null>(null);

  async function handleSync() {
    if (!window.confirm('Deseja sincronizar e migrar todas as vendas da tabela Import1 do Wix para o DuoLife Hub?')) {
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/sync/wix/sales', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao sincronizar vendas do Wix');
      }

      const sync = data.data;
      const totalRevStr = (sync.totalRevenue || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

      setFeedback({
        tipo: 'sucesso',
        texto: `Migração concluída com sucesso! ${sync.salesCreated} novas vendas criadas, ${sync.salesUpdated} atualizadas e ${sync.quotesCreated} cotações registradas.`,
        details: {
          salesCreated: sync.salesCreated,
          salesUpdated: sync.salesUpdated,
          quotesCreated: sync.quotesCreated,
          totalRevenue: sync.totalRevenue,
        },
      });

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar vendas.';
      setFeedback({
        tipo: 'erro',
        texto: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 text-white hover:bg-teal-700 transition-all shadow-xs disabled:opacity-50"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Sincronizando...' : 'Sincronizar Vendas do Wix'}
      </button>

      {feedback && (
        <div
          className={`text-xs font-semibold px-4 py-2.5 rounded-xl border flex items-center gap-2 max-w-md ${
            feedback.tipo === 'sucesso'
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle size={16} className="text-teal-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}
    </div>
  );
}
