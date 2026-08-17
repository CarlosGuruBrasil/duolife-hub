'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Calendar, Filter, ChevronDown, Check, RefreshCw } from 'lucide-react';

interface MonthOption {
  value: string;
  label: string;
}

interface AdminPeriodFilterBarProps {
  currentMonthKey: string;
  monthOptions: MonthOption[];
  baseUrl?: string;
}

export default function AdminPeriodFilterBar({
  currentMonthKey,
  monthOptions,
  baseUrl = '/admin',
}: AdminPeriodFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentMonthParam = searchParams.get('month') || currentMonthKey;
  const currentStartParam = searchParams.get('start') || '';
  const currentEndParam = searchParams.get('end') || '';

  const [customStart, setCustomStart] = useState(currentStartParam);
  const [customEnd, setCustomEnd] = useState(currentEndParam);
  const [showCustomRange, setShowCustomRange] = useState(Boolean(currentStartParam && currentEndParam));

  const currentYear = new Date().getFullYear();

  function handleSelectPeriod(monthVal: string) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('start');
      params.delete('end');
      if (monthVal) {
        params.set('month', monthVal);
      } else {
        params.delete('month');
      }
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleApplyCustomRange(e: React.FormEvent) {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('month');
      params.set('start', customStart);
      params.set('end', customEnd);
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-4 shadow-xs space-y-3 font-sans">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Lado Esquerdo: Atalhos Rápidos */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 mr-2">
            <Filter className="h-3.5 w-3.5 text-[#00d4e0]" /> Período:
          </span>

          <button
            type="button"
            onClick={() => handleSelectPeriod(monthOptions[0]?.value || '')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              currentMonthParam === monthOptions[0]?.value && !currentStartParam
                ? 'bg-[#072a33] text-[#00d4e0] shadow-xs'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            Mês Atual
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriod(monthOptions[1]?.value || '')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              currentMonthParam === monthOptions[1]?.value
                ? 'bg-[#072a33] text-[#00d4e0] shadow-xs'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            Mês Anterior
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriod('last-3-months')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              currentMonthParam === 'last-3-months'
                ? 'bg-[#072a33] text-[#00d4e0] shadow-xs'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            Últimos 3 Meses
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriod(`year-${currentYear}`)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              currentMonthParam === `year-${currentYear}`
                ? 'bg-[#072a33] text-[#00d4e0] shadow-xs'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            Ano Atual ({currentYear})
          </button>

          <button
            type="button"
            onClick={() => setShowCustomRange((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
              currentStartParam || showCustomRange
                ? 'bg-cyan-50 border border-cyan-200 text-[#0e4a5a]'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-[#00d4e0]" />
            Intervalo Customizado
          </button>
        </div>

        {/* Lado Direito: Dropdown de Seleção de Mês Histórico (Escalável para anos!) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              value={currentMonthParam}
              onChange={(e) => handleSelectPeriod(e.target.value)}
              className="appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3.5 pr-8 py-1.5 text-xs font-extrabold text-gray-800 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer transition-all"
            >
              <optgroup label="Seleção Rápida">
                <option value="last-3-months">Últimos 3 Meses</option>
                <option value={`year-${currentYear}`}>Ano Completo ({currentYear})</option>
              </optgroup>
              <optgroup label="Histórico Mensal">
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>

          {isPending && <RefreshCw className="h-4 w-4 text-[#00d4e0] animate-spin" />}
        </div>
      </div>

      {/* Formulário Expandível de Data Inicial e Data Final */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomRange}
          className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-extrabold text-gray-600">De:</span>
            <input
              type="date"
              required
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-extrabold text-gray-600">Até:</span>
            <input
              type="date"
              required
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-xl bg-[#072a33] px-4 py-1.5 text-xs font-extrabold text-[#00d4e0] hover:bg-[#0e4a5a] transition-all shadow-xs"
          >
            <Check className="h-3.5 w-3.5" /> Filtrar Período
          </button>
        </form>
      )}
    </div>
  );
}
