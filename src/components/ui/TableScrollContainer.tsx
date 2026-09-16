'use client';

import React from 'react';

interface TableScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
  maxHeight?: string;
}

/**
 * TableScrollContainer (Enterprise Bounded Viewport Pattern)
 * 
 * Padrão Enterprise (Airtable / Linear / Stripe / Salesforce):
 * 1. Delimita a altura máxima da tabela na tela (max-h-[calc(100vh-320px)]),
 *    deixando a barra de rolagem horizontal SEMPRE visível na viewport,
 *    eliminando a necessidade de rolar a página verticalmente para achá-la.
 * 2. Mantém o cabeçalho fixo no topo (sticky top-0) e a 1ª coluna fixa (sticky left-0).
 * 3. 100% nativo com aceleração por hardware (GPU) a 60/120fps:
 *    Zero código de sincronização competindo, zero perda de inércia, fluidez absoluta.
 */
export function TableScrollContainer({
  children,
  className = '',
  minWidth,
  maxHeight = 'max-h-[calc(100vh-320px)] min-h-[360px]',
}: TableScrollContainerProps) {
  return (
    <div
      className={`relative w-full overflow-auto custom-scrollbar ${maxHeight} ${className}`}
      style={minWidth ? { width: '100%' } : undefined}
    >
      {children}
    </div>
  );
}

export default TableScrollContainer;
