'use client';

import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import EditarPropostaModal, { type EditarPropostaModalProps } from './EditarPropostaModal';

export interface EditarPropostaButtonProps {
  cotacao: EditarPropostaModalProps['cotacao'];
  readOnlyFinancials?: boolean;
  onSuccess?: () => void;
  className?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'icon';
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

export default function EditarPropostaButton({
  cotacao,
  readOnlyFinancials,
  onSuccess,
  className = '',
  variant = 'outline',
  size = 'md',
  children,
}: EditarPropostaButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all min-h-[44px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00d4e0]/30';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#0e4a5a] text-white hover:bg-[#072a33] shadow-xs hover:shadow border border-transparent',
    outline:
      'bg-white text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 shadow-2xs',
    ghost:
      'bg-transparent text-gray-600 hover:text-[#0e4a5a] hover:bg-teal-50/50 border border-transparent',
    icon:
      'p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-xl min-w-[44px]',
  }[variant];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        title="Editar Proposta / Cotação"
      >
        {children ? (
          children
        ) : variant === 'icon' ? (
          <Pencil className="w-4 h-4" />
        ) : (
          <>
            <Pencil className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
            <span>Editar Proposta</span>
          </>
        )}
      </button>

      {isOpen && (
        <EditarPropostaModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSuccess={onSuccess}
          cotacao={cotacao}
          readOnlyFinancials={readOnlyFinancials}
        />
      )}
    </>
  );
}
