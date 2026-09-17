'use client';

import React, { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import TransferirParceiroModal from './TransferirParceiroModal';

export interface TransferirParceiroCotacaoButtonProps {
  cotacaoId: string;
  cotacaoTitle?: string;
  currentPartner?: {
    id?: string | null;
    name?: string | null;
    userName?: string | null;
    isActive?: boolean;
  };
  onSuccess?: () => void;
  className?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'icon';
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

export default function TransferirParceiroCotacaoButton({
  cotacaoId,
  cotacaoTitle = 'Cotação',
  currentPartner,
  onSuccess,
  className = '',
  variant = 'outline',
  size = 'md',
  children,
}: TransferirParceiroCotacaoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/30';

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
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
      'p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-xl min-w-[36px] min-h-[36px]',
  }[variant];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        title="Mudar Parceiro / Corretor Responsável"
      >
        {children ? (
          children
        ) : variant === 'icon' ? (
          <ArrowRightLeft className="w-4 h-4" />
        ) : (
          <>
            <ArrowRightLeft className="w-4 h-4 text-gray-500" />
            <span>Mudar Parceiro</span>
          </>
        )}
      </button>

      {isOpen && (
        <TransferirParceiroModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSuccess={onSuccess}
          tipo="cotacao"
          targetId={cotacaoId}
          targetTitle={cotacaoTitle}
          currentPartner={currentPartner}
        />
      )}
    </>
  );
}
