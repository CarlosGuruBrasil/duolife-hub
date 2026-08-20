'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Mesma razão do app/admin/error.tsx: sem fronteira de erro, uma exceção de Server Component
// entrega a tela genérica do Next ao parceiro, sem contexto e sem caminho de volta.
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[portal] erro na rota:', error);
  }, [error]);

  return (
    <div className="card px-6 py-16 text-center flex flex-col items-center">
      <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-rose-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">Não foi possível carregar esta tela</h2>
      <p className="text-gray-500 mt-2 max-w-md text-sm">
        A operação falhou no servidor. Tente novamente — se persistir, envie o código abaixo para o suporte da DuoLife.
      </p>
      {error.digest && (
        <code className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-[11px] font-mono text-gray-600">
          {error.digest}
        </code>
      )}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#072a33] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#00d4e0] hover:bg-[#0e4a5a] transition-all shadow-xs"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
        <Link href="/portal" className="text-xs font-semibold text-gray-500 hover:text-gray-900 px-3 py-2 transition-colors">
          Voltar ao portal
        </Link>
      </div>
    </div>
  );
}
