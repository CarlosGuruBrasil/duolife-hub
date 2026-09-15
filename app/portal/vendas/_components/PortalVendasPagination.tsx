'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PortalVendasPaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
}

export function PortalVendasPagination({
  currentPage,
  totalPages,
  totalRecords,
  pageSize,
}: PortalVendasPaginationProps) {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-t border-gray-100 bg-white">
      <div className="text-xs text-gray-500 font-medium">
        Mostrando <span className="font-semibold text-gray-800">{firstItem}</span> a{' '}
        <span className="font-semibold text-gray-800">{lastItem}</span> de{' '}
        <span className="font-semibold text-gray-800">{totalRecords}</span> vendas
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 self-center sm:self-auto">
          {/* Botão Anterior */}
          {currentPage > 1 ? (
            <Link
              href={createPageUrl(currentPage - 1)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Anterior</span>
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2.5 text-xs font-semibold text-gray-300 cursor-not-allowed">
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Anterior</span>
            </span>
          )}

          {/* Numeração das Páginas */}
          <div className="flex items-center gap-1">
            {getVisiblePages().map((p, idx) => {
              if (p === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="flex h-8 w-8 items-center justify-center text-xs text-gray-400 font-bold"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = Number(p);
              const isActive = pageNum === currentPage;

              return (
                <Link
                  key={`page-${pageNum}`}
                  href={createPageUrl(pageNum)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all shadow-2xs ${
                    isActive
                      ? 'bg-[#0e4a5a] text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </Link>
              );
            })}
          </div>

          {/* Botão Próximo */}
          {currentPage < totalPages ? (
            <Link
              href={createPageUrl(currentPage + 1)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <span className="hidden sm:inline">Próximo</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2.5 text-xs font-semibold text-gray-300 cursor-not-allowed">
              <span className="hidden sm:inline">Próximo</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
