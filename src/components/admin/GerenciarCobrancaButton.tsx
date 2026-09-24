'use client';

import { useState } from 'react';
import { CreditCard, Edit, Plus, Receipt } from 'lucide-react';
import {
  GerenciarCobrancaAsaasModal,
  CobrancaAsaasInitialData,
} from './GerenciarCobrancaAsaasModal';
import { useRouter } from 'next/navigation';

interface GerenciarCobrancaButtonProps {
  cotacaoId: string;
  clientName?: string;
  initialData?: CobrancaAsaasInitialData;
  mode?: 'create' | 'edit';
  variant?: 'card' | 'table' | 'icon' | 'outline';
  label?: string;
  onSuccess?: () => void;
}

export function GerenciarCobrancaButton({
  cotacaoId,
  clientName,
  initialData,
  mode = 'create',
  variant = 'card',
  label,
  onSuccess,
}: GerenciarCobrancaButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    if (onSuccess) {
      onSuccess();
    }
    router.refresh();
    setTimeout(() => {
      window.location.reload();
    }, 600);
  }

  const defaultLabel =
    label || (mode === 'edit' ? 'Editar Cobrança' : 'Gerar Cobrança Asaas');

  return (
    <>
      {variant === 'card' && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-2 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer min-h-[44px] ${
            mode === 'edit'
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
          title={defaultLabel}
        >
          {mode === 'edit' ? <Edit size={14} /> : <Receipt size={14} />}
          <span>{defaultLabel}</span>
        </button>
      )}

      {variant === 'outline' && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 cursor-pointer min-h-[44px]"
          title={defaultLabel}
        >
          {mode === 'edit' ? <Edit size={13} /> : <Plus size={13} />}
          <span>{defaultLabel}</span>
        </button>
      )}

      {variant === 'table' && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer border shadow-2xs min-h-[36px] ${
            mode === 'edit'
              ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300'
              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
          }`}
          title={defaultLabel}
        >
          {mode === 'edit' ? <Edit size={12} /> : <Receipt size={12} />}
          <span>{defaultLabel}</span>
        </button>
      )}

      {variant === 'icon' && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          title={defaultLabel}
          aria-label={defaultLabel}
        >
          {mode === 'edit' ? <Edit size={14} /> : <Plus size={14} />}
        </button>
      )}

      <GerenciarCobrancaAsaasModal
        cotacaoId={cotacaoId}
        clientName={clientName}
        initialData={initialData}
        mode={mode}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
