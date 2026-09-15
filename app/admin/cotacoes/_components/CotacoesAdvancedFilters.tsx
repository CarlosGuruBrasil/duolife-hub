'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Filter, RotateCcw, Loader2 } from 'lucide-react';
import { PeriodPreset } from '@/lib/date-filters';

interface Option {
  id: string;
  name: string;
}

interface CotacoesAdvancedFiltersProps {
  products: Option[];
  partners: Option[];
  statusLabels: Record<string, string>;
  isOpen: boolean;
}

export function CotacoesAdvancedFilters({
  products,
  partners,
  statusLabels,
  isOpen,
}: CotacoesAdvancedFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [productId, setProductId] = useState(searchParams.get('productId') || '');
  const [partnerId, setPartnerId] = useState(searchParams.get('partnerId') || '');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(
    (searchParams.get('periodPreset') as PeriodPreset) || 'all'
  );
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

  useEffect(() => {
    setStatus(searchParams.get('status') || '');
    setProductId(searchParams.get('productId') || '');
    setPartnerId(searchParams.get('partnerId') || '');
    setPeriodPreset((searchParams.get('periodPreset') as PeriodPreset) || 'all');
    setStartDate(searchParams.get('startDate') || '');
    setEndDate(searchParams.get('endDate') || '');
  }, [searchParams]);

  if (!isOpen) return null;

  const updateSingleFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key === 'periodPreset' && value !== 'custom') {
      params.delete('startDate');
      params.delete('endDate');
    }
    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleDateChange = (key: 'startDate' | 'endDate', val: string) => {
    if (key === 'startDate') setStartDate(val);
    if (key === 'endDate') setEndDate(val);
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set(key, val);
    } else {
      params.delete(key);
    }
    params.set('periodPreset', 'custom');
    params.set('page', '1');
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setStatus('');
    setProductId('');
    setPartnerId('');
    setPeriodPreset('all');
    setStartDate('');
    setEndDate('');

    const params = new URLSearchParams(searchParams.toString());
    params.delete('status');
    params.delete('productId');
    params.delete('partnerId');
    params.delete('periodPreset');
    params.delete('startDate');
    params.delete('endDate');
    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="bg-gray-50/95 backdrop-blur-sm rounded-2xl border border-gray-200/90 p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[#0e4a5a]" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#0e4a5a]">
            Filtros Avançados
          </span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
        >
          <RotateCcw size={12} /> Limpar campos
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. Status da Cotação */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Status da Cotação
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              updateSingleFilter('status', e.target.value);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todas as situações</option>
            {Object.entries(statusLabels).map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Produto */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Produto
          </label>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              updateSingleFilter('productId', e.target.value);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Parceiro / Corretor */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Parceiro
          </label>
          <select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              updateSingleFilter('partnerId', e.target.value);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os parceiros</option>
            {partners.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Linha Secundária: Presets de Datas */}
      <div className="pt-2 border-t border-gray-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mr-1">
            Data:
          </span>
          {[
            { key: 'all', label: 'Todo o período' },
            { key: 'today', label: 'Hoje' },
            { key: '7d', label: 'Últimos 7 dias' },
            { key: '30d', label: 'Últimos 30 dias' },
            { key: 'this_month', label: 'Este mês' },
            { key: 'custom', label: 'Personalizado' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setPeriodPreset(item.key as PeriodPreset);
                updateSingleFilter('periodPreset', item.key);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                periodPreset === item.key
                  ? 'bg-[#0e4a5a] text-white shadow-2xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              aria-label="Data inicial"
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00d4e0]/20"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              aria-label="Data final"
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00d4e0]/20"
            />
          </div>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {isPending && (
            <span className="text-xs text-[#0e4a5a] font-semibold flex items-center gap-1.5 animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00d4e0]" />
              Atualizando...
            </span>
          )}
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-bold hover:bg-gray-100 hover:text-gray-900 transition-all cursor-pointer"
          >
            <RotateCcw size={12} />
            Limpar campos
          </button>
        </div>
      </div>
    </div>
  );
}
