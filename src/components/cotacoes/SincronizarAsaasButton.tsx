'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModalSincronizarAsaas } from '@/components/modals/ModalSincronizarAsaas';

export function SincronizarAsaasButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-800 font-semibold rounded-xl shadow-xs hover:bg-gray-50 hover:border-gray-400 hover:text-[#0e4a5a] transition-all text-xs tracking-wider cursor-pointer active:scale-95 shrink-0 min-h-[44px]"
        title="Sincronizar cotações com o Asaas sem disparar e-mails"
      >
        <RefreshCw size={15} strokeWidth={2.2} className="text-[#0e4a5a]" />
        <span>Sincronizar Asaas</span>
      </button>

      <ModalSincronizarAsaas
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

export default SincronizarAsaasButton;
