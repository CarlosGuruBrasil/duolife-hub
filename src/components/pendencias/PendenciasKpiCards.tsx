'use client';

import React from 'react';
import { ClockAlert, AlertTriangle, FileText, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { PendenciasKPIs, PendenciaTab } from '@/types/pendencias-cancelamentos';

export interface PendenciasKpiCardsProps {
  kpis: PendenciasKPIs;
  activeTab?: PendenciaTab;
  onSelectTab?: (tab: PendenciaTab) => void;
  isLoading?: boolean;
}

export function PendenciasKpiCards({
  kpis,
  activeTab,
  onSelectTab,
  isLoading = false,
}: PendenciasKpiCardsProps) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="kpis-loading-skeleton"
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-gray-200 rounded w-28" />
              <div className="h-9 w-9 bg-gray-200 rounded-lg" />
            </div>
            <div className="h-8 bg-gray-200 rounded w-36 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  const emAtrasoActive = activeTab === 'em_atraso';
  const canceladasActive = activeTab === 'canceladas';

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      data-testid="kpis-grid"
    >
      {/* Card 1: Contratações em Atraso */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectTab?.('em_atraso')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('em_atraso');
          }
        }}
        className={`bg-white border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          emAtrasoActive ? 'border-amber-500 shadow-sm ring-1 ring-amber-500' : 'border-gray-200'
        }`}
        data-testid="kpi-contratacoes-em-atraso"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Contratações em Atraso
          </span>
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
            <ClockAlert className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {kpis.totalContratacoesEmAtraso}
          </span>
          <span
            className={`inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 border ${
              kpis.totalContratacoesEmAtraso > 0
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {kpis.totalContratacoesEmAtraso > 0 ? 'Atenção' : 'Em dia'}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Contratos com ao menos 1 parcela vencida em aberto
        </p>
      </div>

      {/* Card 2: Total em Atraso */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectTab?.('em_atraso')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('em_atraso');
          }
        }}
        className={`bg-white border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          emAtrasoActive ? 'border-rose-400 shadow-sm' : 'border-gray-200'
        }`}
        data-testid="kpi-total-em-atraso"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Total em Atraso
          </span>
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mb-2">
          <span className="text-2xl sm:text-3xl font-bold text-rose-700 tracking-tight">
            {formatCurrency(kpis.valorTotalEmAtraso)}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Soma de todas as parcelas vencidas em aberto
        </p>
      </div>

      {/* Card 3: Contratações Canceladas */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectTab?.('canceladas')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('canceladas');
          }
        }}
        className={`bg-white border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          canceladasActive ? 'border-red-500 shadow-sm ring-1 ring-red-500' : 'border-gray-200'
        }`}
        data-testid="kpi-contratacoes-canceladas"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Contratações Canceladas
          </span>
          <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <FileText className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {kpis.totalContratacoesCanceladas}
          </span>
          <span className="inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-red-50 border-red-200 text-red-800">
            Cancelados
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Inadimplência, recusa ou desistência
        </p>
      </div>

      {/* Card 4: Valor Original Cancelado */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectTab?.('canceladas')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab?.('canceladas');
          }
        }}
        className={`bg-white border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          canceladasActive ? 'border-red-400 shadow-sm' : 'border-gray-200'
        }`}
        data-testid="kpi-valor-original-cancelado"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Valor Original Cancelado
          </span>
          <div className="p-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mb-2">
          <span className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            {formatCurrency(kpis.valorOriginalTotalCanceladas)}
          </span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Valor original contratado; não representa prejuízo líquido efetivo
        </p>
      </div>
    </div>
  );
}

export default PendenciasKpiCards;
