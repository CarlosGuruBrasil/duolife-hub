'use client';

import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import ModalResolverDuplicidade, { CadastralConflictData } from './ModalResolverDuplicidade';

interface ResolverDuplicidadeButtonProps {
  cotacaoId: string;
  documentNumber: string;
  conflict: CadastralConflictData;
}

export default function ResolverDuplicidadeButton({
  cotacaoId,
  documentNumber,
  conflict,
}: ResolverDuplicidadeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
      >
        <ShieldAlert className="w-4 h-4 text-amber-100" />
        <span>Resolver Duplicidade de Cadastro</span>
      </button>

      <ModalResolverDuplicidade
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        cotacaoId={cotacaoId}
        conflict={conflict}
        documentNumber={documentNumber}
      />
    </>
  );
}
