'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/toast';

export default function WixSalesSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    if (!window.confirm('Deseja sincronizar e migrar todas as vendas da tabela Import1 do Wix para o DuoLife Hub?')) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/admin/sync/wix/sales', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao sincronizar vendas do Wix');
      }

      const sync = data.data;

      toast.success(
        `Migração concluída com sucesso! ${sync.salesCreated} novas vendas criadas, ${sync.salesUpdated} atualizadas e ${sync.quotesCreated} cotações registradas.`
      );

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar vendas.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 text-white hover:bg-teal-700 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Sincronizando...' : 'Sincronizar Vendas do Wix'}
      </button>
    </div>
  );
}
