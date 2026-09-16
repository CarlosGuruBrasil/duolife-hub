'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal, ChevronDown, Loader2, RotateCcw } from 'lucide-react';

interface CotacoesFilterBarProps {
  activeFiltersCount: number;
  isOpenAdvanced: boolean;
  onToggleAdvanced: () => void;
  pageSize: number;
}

export function CotacoesFilterBar({
  activeFiltersCount,
  isOpenAdvanced,
  onToggleAdvanced,
  pageSize,
}: CotacoesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get('q') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFocusedRef = useRef(false);

  // Sincroniza o input APENAS se o usuário NÃO estiver com foco nele (evita apagar o texto durante a digitação)
  useEffect(() => {
    if (!isFocusedRef.current) {
      setSearchValue(currentSearch);
    }
  }, [currentSearch]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setSearchValue(nextVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = nextVal.trim();
      if (trimmed) {
        params.set('q', trimmed);
      } else {
        params.delete('q');
      }
      params.set('page', '1');

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 380);
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchValue('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const hasAnyFilterActive = Boolean(searchValue || activeFiltersCount > 0);

  const handleClearAll = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchValue('');
    const params = new URLSearchParams(searchParams.toString());
    const currentPageSize = params.get('pageSize');

    const newParams = new URLSearchParams();
    if (currentPageSize) newParams.set('pageSize', currentPageSize);

    startTransition(() => {
      const qs = newParams.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    });
  };

  const handlePageSizeChange = (newSize: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('pageSize', newSize);
    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Barra de Busca Universal em Tempo Real */}
        <div className="relative flex-1 min-w-[240px]">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {isPending ? (
              <Loader2 className="h-4 w-4 text-[#0e4a5a] animate-spin" />
            ) : (
              <Search className="h-4 w-4 text-gray-400" />
            )}
          </div>
          <input
            type="search"
            value={searchValue}
            onChange={handleChange}
            onFocus={() => {
              isFocusedRef.current = true;
            }}
            onBlur={() => {
              isFocusedRef.current = false;
            }}
            placeholder="Buscar por cliente, CPF/CNPJ, e-mail ou telefone..."
            aria-label="Buscar cotações em tempo real"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/80 pl-10 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#0e4a5a] focus:ring-2 focus:ring-[#0e4a5a]/20 focus:outline-none transition-all"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full transition-colors"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAdvanced}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
              isOpenAdvanced || activeFiltersCount > 0
                ? 'bg-[#0e4a5a]/10 border-[#0e4a5a] text-[#0e4a5a]'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
            }`}
          >
            <SlidersHorizontal size={15} />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#0e4a5a] text-white text-xs font-bold">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isOpenAdvanced ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Botão Limpar Filtros */}
          {hasAnyFilterActive && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Limpar todos os filtros e busca"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100 hover:border-rose-300 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            >
              <RotateCcw size={13} />
              <span>Limpar filtros</span>
            </button>
          )}

          {/* Seletor de Registros por Página */}
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              aria-label="Itens por página"
              className="appearance-none rounded-xl border border-gray-200 bg-gray-50 pl-3 pr-8 py-2.5 text-xs font-semibold text-gray-700 hover:border-gray-300 focus:bg-white focus:border-[#0e4a5a] focus:outline-none transition-all cursor-pointer"
            >
              <option value="10">10 / pág</option>
              <option value="25">25 / pág</option>
              <option value="50">50 / pág</option>
              <option value="100">100 / pág</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
