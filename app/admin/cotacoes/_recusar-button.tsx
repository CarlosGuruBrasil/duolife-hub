'use client';

import { useState } from 'react';
import { XCircle } from 'lucide-react';

export function RecusarCotacaoButton({ id, clientName }: { id: string; clientName: string }) {
  const [loading, setLoading] = useState(false);

  async function handleRecusar() {
    const motivo = prompt(`Recusar a cotação de "${clientName}". Motivo (opcional):`);
    if (motivo === null) return;
    if (!confirm(`Confirmar a recusa da cotação de "${clientName}"?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/portal/cotacoes/${id}/recusar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Erro ao recusar cotação');
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRecusar}
      disabled={loading}
      aria-label={`Recusar cotação de ${clientName}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
    >
      <XCircle size={16} strokeWidth={2} />
      {loading ? 'Recusando...' : 'Recusar'}
    </button>
  );
}
