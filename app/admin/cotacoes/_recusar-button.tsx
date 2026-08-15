'use client';

import { useState } from 'react';
import { XCircle } from 'lucide-react';

export function RecusarCotacaoButton({ id, clientName }: { id: string; clientName: string }) {
  const [loading, setLoading] = useState(false);

  async function handleRecusar() {
    const motivo = prompt(`Recusar a cotação de "${clientName}". Motivo (opcional):`);
    if (motivo === null) return;

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
      title="Recusar cotação"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
    >
      <XCircle size={16} strokeWidth={2} />
    </button>
  );
}
