'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Calendar, Filter, RotateCcw } from 'lucide-react';
import { DATE_PRESET_OPTIONS, PeriodPreset } from '@/lib/date-filters';

import { maskCnpj } from '@/components/modals/masks';

export interface CorretoraOption {
  id: string;
  name: string;
  cnpj?: string | null;
}

export interface PartnerOption {
  id: string;
  name: string;
  corretoraId?: string | null;
}

interface Option {
  id: string;
  name: string;
}

interface VendasAdvancedFiltersProps {
  products: Option[];
  corretoras: CorretoraOption[];
  partners: PartnerOption[];
  statusLabels: Record<string, string>;
  isOpen: boolean;
}

export function VendasAdvancedFilters({
  products,
  corretoras,
  partners,
  statusLabels,
  isOpen,
}: VendasAdvancedFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  if (!isOpen) return null;

  const currentStatus = searchParams.get('status') || '';
  const currentProduct = searchParams.get('productId') || '';
  const currentCorretora = searchParams.get('corretoraId') || '';
  const currentPartner = searchParams.get('partnerId') || '';
  const currentPreset: PeriodPreset =
    (searchParams.get('periodPreset') as PeriodPreset) ||
    (searchParams.get('startDate') || searchParams.get('endDate') ? 'custom' : '30d');
  const currentStart = searchParams.get('startDate') || '';
  const currentEnd = searchParams.get('endDate') || '';

  const filteredPartners = React.useMemo(() => {
    if (!currentCorretora || currentCorretora === 'all') {
      return partners;
    }
    return partners.filter((p) => p.corretoraId === currentCorretora);
  }, [partners, currentCorretora]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleCorretoraChange = (newCorretoraId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newCorretoraId && newCorretoraId !== 'all') {
      params.set('corretoraId', newCorretoraId);
    } else {
      params.delete('corretoraId');
    }

    if (currentPartner) {
      const isStillValid = newCorretoraId && newCorretoraId !== 'all'
        ? partners.some((p) => p.id === currentPartner && p.corretoraId === newCorretoraId)
        : true;

      if (!isStillValid) {
        params.delete('partnerId');
      }
    }

    params.set('page', '1');
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleDatePresetChange = (preset: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('periodPreset', preset);
    if (preset !== 'custom') {
      params.delete('startDate');
      params.delete('endDate');
    }
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleCustomDateChange = (start: string, end: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('periodPreset', 'custom');
    if (start) params.set('startDate', start);
    else params.delete('startDate');

    if (end) params.set('endDate', end);
    else params.delete('endDate');

    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleResetAdvanced = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('status');
    params.delete('productId');
    params.delete('corretoraId');
    params.delete('partnerId');
    params.delete('startDate');
    params.delete('endDate');
    // Volta para o período padrão dos últimos 30 dias
    params.set('periodPreset', '30d');
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all animate-in fade-in duration-150">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <Filter className="h-3.5 w-3.5 text-[#0e4a5a]" />
          <span>Filtros Avançados de Vendas</span>
        </div>
        <button
          type="button"
          onClick={handleResetAdvanced}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Restaurar filtros</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Status da Venda */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Status da Venda
          </label>
          <select
            value={currentStatus}
            onChange={(e) => updateParam('status', e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/10 cursor-pointer"
          >
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Produto */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Produto Contratado
          </label>
          <select
            value={currentProduct}
            onChange={(e) => updateParam('productId', e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/10 cursor-pointer"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Corretora (empresa CNPJ) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Corretora
          </label>
          <select
            value={currentCorretora}
            onChange={(e) => handleCorretoraChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/10 cursor-pointer truncate"
          >
            <option value="">Todas as corretoras</option>
            {corretoras.map((c) => {
              const cnpjMasked = c.cnpj ? maskCnpj(c.cnpj) : null;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} {cnpjMasked ? `(${cnpjMasked})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Vendedor */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Vendedor
          </label>
          <select
            value={currentPartner}
            onChange={(e) => updateParam('partnerId', e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/10 cursor-pointer truncate"
          >
            <option value="">Todos os vendedores</option>
            {filteredPartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Período de Emissão / Criação */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Período de Emissão
          </label>
          <select
            value={currentPreset}
            onChange={(e) => handleDatePresetChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a]/10 cursor-pointer"
          >
            {DATE_PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inputs Customizados de Data quando 'Personalizado' estiver ativo */}
      {currentPreset === 'custom' && (
        <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-100">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span>Data Inicial</span>
            </label>
            <input
              type="date"
              value={currentStart}
              onChange={(e) => handleCustomDateChange(e.target.value, currentEnd)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span>Data Final</span>
            </label>
            <input
              type="date"
              value={currentEnd}
              onChange={(e) => handleCustomDateChange(currentStart, e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 font-medium focus:border-[#0e4a5a] focus:outline-hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
