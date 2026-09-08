'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal, ChevronDown, Loader2 } from 'lucide-react';
import { PageSizeOption } from '@/types/admin-clients';

interface ClientesFilterBarProps {
  activeFiltersCount: number;
  isOpenAdvanced: boolean;
  onToggleAdvanced: () => void;
  pageSize: PageSizeOption;
}

export function ClientesFilterBar({
  activeFiltersCount,
  isOpenAdvanced,
  onToggleAdvanced,
  pageSize,
}: ClientesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get('q') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sincroniza o estado interno se a URL for alterada externamente (ex: botão "Limpar todos")
  useEffect(() => {
    setSearchValue(currentSearch);
  }, [currentSearch]);

  // Busca em tempo real a cada caractere digitado (debounce de 280ms)
  useEffect(() => {
    if (searchValue === currentSearch) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchValue.trim();
      if (trimmed) {
        params.set('q', trimmed);
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
              <Loader2 className="h-4 w-4 text-[#00d4e0] animate-spin" />
            ) : (
              <Search className="h-4 w-4 text-gray-400" />
            )}
          </div>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Buscar em tempo real por nome, CPF/CNPJ, e-mail ou telefone..."
            aria-label="Buscar clientes em tempo real"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/80 pl-10 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
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

        {/* Ações: Toggle Filtros Avançados e Seletor de Limite */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
          {/* Botão de Toggle Filtros Avançados */}
          <button
            type="button"
            onClick={onToggleAdvanced}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              isOpenAdvanced || activeFiltersCount > 0
                ? 'border-[#0e4a5a] bg-[#0e4a5a]/5 text-[#0e4a5a]'
                : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
            }`}
          >
            <SlidersHorizontal size={14} className="text-[#0e4a5a]" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0e4a5a] text-[10px] font-extrabold text-white">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform duration-200 ${isOpenAdvanced ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Seletor de Itens por Página */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 hidden md:inline">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              aria-label="Selecione a quantidade de itens por página"
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer transition-all"
            >
              <option value="10">10 por página</option>
              <option value="20">20 por página</option>
              <option value="50">50 por página</option>
              <option value="100">100 por página</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
