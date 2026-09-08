'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageSizeOption } from '@/types/admin-clients';

interface ClientesPaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  pageSize: PageSizeOption;
}

export function ClientesPagination({
  currentPage,
  totalPages,
  totalRecords,
  pageSize,
}: ClientesPaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalRecords === 0) return null;

  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalRecords);

  const createPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    return `${pathname}?${params.toString()}`;
  };

  // Janela com elipses inteligente
  const getVisiblePages = () => {
    const delta = 1;
    const range: (number | string)[] = [];
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      range.unshift('...');
    }
    if (currentPage + delta < totalPages - 1) {
      range.push('...');
    }

    range.unshift(1);
    if (totalPages > 1) {
      range.push(totalPages);
    }

    return range;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-gray-100 bg-white">
      {/* Contador de resultados */}
      <span className="text-xs font-medium text-gray-500">
        Exibindo <strong className="text-gray-900 font-bold">{firstItem}–{lastItem}</strong> de{' '}
        <strong className="text-gray-900 font-bold">{totalRecords}</strong> clientes
      </span>

      {/* Navegação de Páginas */}
      <div className="flex items-center gap-1.5">
        {/* Botão Anterior */}
        {currentPage > 1 ? (
          <Link
            href={createPageUrl(currentPage - 1)}
            className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-2xs"
            aria-label="Página anterior"
          >
            <ChevronLeft size={15} />
            <span className="hidden sm:inline">Anterior</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-xl border border-gray-100 bg-gray-50 text-xs font-bold text-gray-300 cursor-not-allowed">
            <ChevronLeft size={15} />
            <span className="hidden sm:inline">Anterior</span>
          </span>
        )}

        {/* Números de página (Desktop e Tablet) */}
        <div className="hidden sm:flex items-center gap-1">
          {getVisiblePages().map((pageItem, idx) => {
            if (pageItem === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 text-xs font-bold text-gray-400">
                  ...
                </span>
              );
            }
            const isCurrent = pageItem === currentPage;
            return (
              <Link
                key={pageItem}
                href={createPageUrl(pageItem as number)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                  isCurrent
                    ? 'bg-[#0e4a5a] text-white shadow-xs'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 hover:border-gray-300'
                }`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {pageItem}
              </Link>
            );
          })}
        </div>

        {/* Indicador simplificado para Mobile (375px) */}
        <span className="sm:hidden text-xs font-bold text-gray-700 px-2">
          Pág. {currentPage} de {totalPages}
        </span>

        {/* Botão Próxima */}
        {currentPage < totalPages ? (
          <Link
            href={createPageUrl(currentPage + 1)}
            className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-2xs"
            aria-label="Próxima página"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight size={15} />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-xl border border-gray-100 bg-gray-50 text-xs font-bold text-gray-300 cursor-not-allowed">
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight size={15} />
          </span>
        )}
      </div>
    </div>
  );
}
