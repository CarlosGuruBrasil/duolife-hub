'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ExcluirClienteButtonProps {
  clientId: string;
  clientName?: string;
  variant?: 'icon' | 'table' | 'header';
  redirectTo?: string;
  onDeleted?: () => void;
}

export function ExcluirClienteButton({
  clientId,
  clientName,
  variant = 'table',
  redirectTo,
  onDeleted,
}: ExcluirClienteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  async function handleConfirm() {
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/clientes/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir o cliente.');
      }

      toast.success('Cliente excluído com sucesso!');
      setIsOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha na exclusão do cliente.');
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
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">Excluir Cliente e Dependências</h3>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-amber-200">
                  DEV
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {clientName ? `Cliente: ${clientName}` : `Cliente #${clientId.slice(0, 8)}`}
              </p>
            </div>
          </div>

          <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3 text-xs text-rose-950 space-y-1.5">
            <p className="font-bold text-rose-900">Exclusão Completa em Cascata (Irreversível):</p>
            <ul className="list-disc list-inside space-y-1 text-rose-800 text-[11px]">
              <li>O cadastro do cliente será permanentemente apagado.</li>
              <li><strong>Todas as cotações</strong> vinculadas a este cliente serão excluídas.</li>
              <li><strong>Todas as cobranças e ordens financeiras</strong> serão excluídas (as cobranças não pagas serão canceladas no Asaas).</li>
              <li>Histórico de assinaturas ZapSign e apólices serão eliminados.</li>
            </ul>
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
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Excluindo...
                </>
              ) : (
                <>
                  <Trash2 size={13} /> Confirmar Exclusão Total
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          title="Excluir cliente, cotações e cobranças (Dev)"
        >
          <Trash2 size={14} />
        </button>
        {modal}
      </>
    );
  }

  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-colors shadow-2xs"
          title="Excluir cliente, cotações e cobranças (Dev)"
        >
          <Trash2 size={14} />
          <span>Excluir Cliente</span>
          <span className="text-[10px] font-extrabold bg-rose-200/60 text-rose-800 px-1 py-0.2 rounded">
            DEV
          </span>
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
        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors"
        title="Excluir cliente, cotações e cobranças (Dev)"
      >
        <Trash2 size={12} /> Excluir
      </button>
      {modal}
    </>
  );
}
