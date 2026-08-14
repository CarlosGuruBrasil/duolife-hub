'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export function DeleteCotacaoButton({ id, clientName }: { id: string; clientName: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Excluir a cotação de "${clientName}" e todos os registros dependentes (contrato, cobrança)? Isso não pode ser desfeito.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cotacoes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Erro ao excluir cotação');
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title="Excluir cotação (exclusivo dev)"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
    >
      <Trash2 size={16} strokeWidth={2} />
    </button>
  );
}
