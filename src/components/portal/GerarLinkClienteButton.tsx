'use client';

import React, { useState } from 'react';
import { Share2, Sparkles, Link2 } from 'lucide-react';
import GerarLinkClienteModal, { ProductOption, GeneratedLinkData } from './GerarLinkClienteModal';

interface GerarLinkClienteButtonProps {
  products: ProductOption[];
  defaultProductId?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'banner';
  buttonText?: string;
  className?: string;
  onLinkCreated?: (link: GeneratedLinkData) => void;
}

export default function GerarLinkClienteButton({
  products,
  defaultProductId,
  variant = 'secondary',
  buttonText = 'Gerar Link para Cliente',
  className = '',
  onLinkCreated,
}: GerarLinkClienteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (variant === 'banner') {
    return (
      <>
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Share2 size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <span>Link de Autocadastro com Desconto Exclusivo</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Novo
                </span>
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Prefere que o cliente preencha sua própria proposta? Gere um link exclusivo com o desconto já aplicado.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="btn btn-primary text-xs py-2 px-4 whitespace-nowrap flex items-center gap-2 cursor-pointer shadow-sm self-end sm:self-auto"
          >
            <Sparkles size={14} className="text-emerald-300" />
            <span>Gerar Link Exclusivo</span>
          </button>
        </div>

        <GerarLinkClienteModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          products={products}
          defaultProductId={defaultProductId}
          onLinkCreated={onLinkCreated}
        />
      </>
    );
  }

  const baseStyle =
    variant === 'primary'
      ? 'btn btn-primary text-xs py-2.5 px-4 flex items-center gap-2 shadow-xs cursor-pointer'
      : variant === 'outline'
      ? 'btn-outline text-xs py-2 px-3.5 flex items-center gap-2 border-emerald-600 text-emerald-800 hover:bg-emerald-50 bg-white cursor-pointer'
      : 'btn btn-secondary text-xs py-2 px-3.5 flex items-center gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 bg-emerald-50/40 cursor-pointer';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${baseStyle} ${className}`}
        title="Gerar link de autocadastro com desconto pré-aplicado para o cliente"
      >
        <Link2 size={15} className="text-emerald-600 flex-shrink-0" />
        <span className="font-semibold">{buttonText}</span>
      </button>

      <GerarLinkClienteModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        products={products}
        defaultProductId={defaultProductId}
        onLinkCreated={onLinkCreated}
      />
    </>
  );
}
