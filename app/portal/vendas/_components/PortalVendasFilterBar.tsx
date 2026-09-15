'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal, Loader2 } from 'lucide-react';

interface PortalVendasFilterBarProps {
  activeFiltersCount: number;
  isOpenAdvanced: boolean;
  onToggleAdvanced: () => void;
  pageSize: number;
}

export function PortalVendasFilterBar({
  activeFiltersCount,
  isOpenAdvanced,
  onToggleAdvanced,
  pageSize,
}: PortalVendasFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get('q') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSearchValue(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    if (searchValue === currentSearch) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const clean = searchValue.trim();
      if (clean) {
        params.set('q', clean);
      } else {
        params.delete('q');
      }
      params.set('page', '1');

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 280);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchValue, currentSearch, pathname, router, searchParams]);

  const handleClearAll = () => {
    setSearchValue('');
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  const handlePageSizeChange = (newSize: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', newSize);
    params.set('page', '1');
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const hasAnyFilter = Boolean(currentSearch || activeFiltersCount > 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Campo de Busca Reativa */}
      <div className="relative flex-1 max-w-xl">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#0e4a5a]" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </div>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Buscar por cliente, documento ou apólice..."
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/15 transition-all shadow-2xs"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => {
              setSearchValue('');
              const params = new URLSearchParams(searchParams.toString());
              params.delete('q');
              params.set('page', '1');
              startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              });
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 cursor-pointer"
            title="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Ações da Barra */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
            isOpenAdvanced || activeFiltersCount > 0
              ? 'border-[#0e4a5a] bg-[#0e4a5a]/5 text-[#0e4a5a]'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0e4a5a] text-[10px] font-bold text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer shadow-2xs"
          >
            <X className="h-3.5 w-3.5" />
            <span>Limpar filtros</span>
          </button>
        )}

        <div className="flex items-center gap-1.5 pl-1 border-l border-gray-200 text-xs text-gray-500">
          <span className="hidden sm:inline">Exibir:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 font-medium focus:border-[#0e4a5a] focus:outline-hidden cursor-pointer"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>
    </div>
  );
}
