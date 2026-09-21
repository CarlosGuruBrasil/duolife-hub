'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal, Loader2, Calendar, ChevronDown } from 'lucide-react';
import { DATE_PRESET_OPTIONS, PeriodPreset } from '@/lib/date-filters';

interface VendasFilterBarProps {
  activeFiltersCount: number;
  isOpenAdvanced: boolean;
  onToggleAdvanced: () => void;
  onOpenAdvanced?: () => void;
  pageSize: number;
}

export function VendasFilterBar({
  activeFiltersCount,
  isOpenAdvanced,
  onToggleAdvanced,
  onOpenAdvanced,
  pageSize,
}: VendasFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get('q') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFocusedRef = useRef(false);

  // Determina o preset atual: fallback para '30d' se não houver parâmetro e nem datas customizadas
  const currentPreset: PeriodPreset =
    (searchParams.get('periodPreset') as PeriodPreset) ||
    (searchParams.get('startDate') || searchParams.get('endDate') ? 'custom' : '30d');

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
      const clean = nextVal.trim();
      if (clean) {
        params.set('q', clean);
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

  const handlePeriodPresetChange = (newPreset: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPreset === 'custom') {
      params.set('periodPreset', 'custom');
      if (onOpenAdvanced) onOpenAdvanced();
    } else if (newPreset === '30d') {
      // 30d é o padrão
      params.set('periodPreset', '30d');
      params.delete('startDate');
      params.delete('endDate');
    } else {
      params.set('periodPreset', newPreset);
      params.delete('startDate');
      params.delete('endDate');
    }
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleClearAll = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
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

  const isPeriodModified = currentPreset !== '30d';
  const hasAnyFilter = Boolean(searchValue || activeFiltersCount > 0 || isPeriodModified);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
          onChange={handleChange}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
          }}
          placeholder="Buscar por cliente, apólice ou parceiro..."
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/15 transition-all shadow-2xs"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 cursor-pointer"
            title="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Ações da Barra */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Seletor Rápido de Período com Ícone */}
        <div className="relative inline-flex items-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#0e4a5a]">
            <Calendar className="h-3.5 w-3.5" />
          </div>
          <select
            value={currentPreset}
            onChange={(e) => handlePeriodPresetChange(e.target.value)}
            aria-label="Selecionar período"
            className="h-[38px] appearance-none rounded-xl border border-gray-200 bg-white pl-8.5 pr-8 text-xs font-semibold text-gray-800 shadow-2xs hover:border-[#0e4a5a] focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/15 cursor-pointer transition-all"
          >
            {DATE_PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400">
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>

        {/* Botão de Filtros Avançados */}
        <button
          type="button"
          onClick={onToggleAdvanced}
          className={`inline-flex items-center gap-2 rounded-xl border h-[38px] px-3.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
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

        {/* Botão de Limpar Filtros */}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white h-[38px] px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer shadow-2xs"
            title="Voltar para a visualização padrão dos últimos 30 dias"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Limpar filtros</span>
          </button>
        )}

        {/* Seletor de Tamanho de Página */}
        <div className="flex items-center gap-1.5 pl-1 border-l border-gray-200 text-xs text-gray-500">
          <span className="hidden sm:inline">Exibir:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            className="h-[38px] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 font-medium focus:border-[#0e4a5a] focus:outline-hidden cursor-pointer"
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
