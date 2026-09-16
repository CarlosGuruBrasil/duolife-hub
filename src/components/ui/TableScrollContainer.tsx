'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TableScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
  showScrollButtons?: boolean;
}

/**
 * TableScrollContainer
 * 
 * Envolve tabelas com alta densidade de colunas para fornecer:
 * 1. Scrollbar horizontal flutuante ancorada na viewport (sticky bottom-0),
 *    evitando que o usuário precise rolar a página até o fim para arrastar a rolagem.
 * 2. Sincronização de scroll bidirecional sem jitter (requestAnimationFrame).
 * 3. Botões de rolagem rápida (esquerda/direita).
 * 4. Indicadores sutis de sombra lateral (scroll affordance).
 * 5. Detecção automática de overflow via ResizeObserver.
 */
export function TableScrollContainer({
  children,
  className = '',
  minWidth,
  showScrollButtons = true,
}: TableScrollContainerProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const floatingBarRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const [hasOverflow, setHasOverflow] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Atualiza métricas de overflow e estados dos limites
  const updateMetrics = useCallback(() => {
    const el = tableWrapperRef.current;
    if (!el) return;

    const hasScroll = el.scrollWidth > el.clientWidth + 2;
    setHasOverflow(hasScroll);
    setScrollWidth(el.scrollWidth);

    const atStart = el.scrollLeft <= 4;
    const atEnd = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 4;

    setCanScrollLeft(!atStart);
    setCanScrollRight(!atEnd);
  }, []);

  // Monitora alterações de tamanho da tabela e do container
  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;

    updateMetrics();

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });

    resizeObserver.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) {
      resizeObserver.observe(tableEl);
    }

    window.addEventListener('resize', updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [updateMetrics]);

  // Sincronização do scroll da tabela principal para a barra flutuante
  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    const tableEl = tableWrapperRef.current;
    const barEl = floatingBarRef.current;
    if (!tableEl) return;

    isSyncingRef.current = true;
    requestAnimationFrame(() => {
      if (barEl) {
        barEl.scrollLeft = tableEl.scrollLeft;
      }
      updateMetrics();
      isSyncingRef.current = false;
    });
  };

  // Sincronização da barra flutuante para a tabela principal
  const handleFloatingScroll = () => {
    if (isSyncingRef.current) return;
    const tableEl = tableWrapperRef.current;
    const barEl = floatingBarRef.current;
    if (!barEl || !tableEl) return;

    isSyncingRef.current = true;
    requestAnimationFrame(() => {
      tableEl.scrollLeft = barEl.scrollLeft;
      updateMetrics();
      isSyncingRef.current = false;
    });
  };

  // Botões de rolagem por etapas
  const scrollStep = (direction: 'left' | 'right') => {
    const el = tableWrapperRef.current;
    if (!el) return;
    const step = 320;
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Indicador de sombra à esquerda */}
      {hasOverflow && canScrollLeft && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-20 bg-gradient-to-r from-black/10 to-transparent transition-opacity"
        />
      )}

      {/* Indicador de sombra à direita */}
      {hasOverflow && canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-20 bg-gradient-to-l from-black/10 to-transparent transition-opacity"
        />
      )}

      {/* Container de rolagem horizontal da tabela */}
      <div
        ref={tableWrapperRef}
        onScroll={handleTableScroll}
        className="overflow-x-auto scroll-smooth focus:outline-none"
        style={{ minWidth }}
      >
        {children}
      </div>

      {/* Barra de rolagem horizontal flutuante ancorada na viewport */}
      {hasOverflow && (
        <div className="sticky bottom-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-md border-t border-gray-200/90 shadow-xs">
          {showScrollButtons && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => scrollStep('left')}
                disabled={!canScrollLeft}
                title="Rolar para a esquerda"
                className={`p-1 rounded-lg border transition-colors ${
                  canScrollLeft
                    ? 'border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
                }`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollStep('right')}
                disabled={!canScrollRight}
                title="Rolar para a direita"
                className={`p-1 rounded-lg border transition-colors ${
                  canScrollRight
                    ? 'border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
                }`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Trilha de Scrollbar Sincronizada */}
          <div
            ref={floatingBarRef}
            onScroll={handleFloatingScroll}
            className="flex-1 overflow-x-auto h-4 custom-scrollbar py-0.5"
          >
            <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
          </div>

          <div className="shrink-0 text-[11px] font-semibold text-gray-400 select-none pl-1">
            {canScrollRight ? (
              <span className="text-[#0e4a5a] font-medium">Mais colunas →</span>
            ) : (
              <span>Final da tabela</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TableScrollContainer;
