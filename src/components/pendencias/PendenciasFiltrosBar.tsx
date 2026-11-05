'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import type { PendenciasFiltros, PendenciaTab, TipoRegistro } from '@/types/pendencias-cancelamentos';

export interface PendenciasFiltrosBarProps {
  filtros: PendenciasFiltros;
  onChange: (novosFiltros: Partial<PendenciasFiltros>) => void;
  onLimpar: () => void;
  tab: PendenciaTab;
  isLoading?: boolean;
}

export function PendenciasFiltrosBar({
  filtros,
  onChange,
  onLimpar,
  tab,
  isLoading = false,
}: PendenciasFiltrosBarProps) {
  // Local state for debounced search input
  const [buscaLocal, setBuscaLocal] = useState(filtros.q || '');
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize local input if props change externally
  useEffect(() => {
    setBuscaLocal(filtros.q || '');
  }, [filtros.q]);

  const handleSearchChange = (value: string) => {
    setBuscaLocal(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onChange({ q: value.trim() ? value : undefined, page: 1 });
    }, 350);
  };

  const handleClearSearch = () => {
    setBuscaLocal('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onChange({ q: undefined, page: 1 });
  };

  // Helper to determine current faixa de atraso select value
  const getFaixaAtrasoValue = (): string => {
    const { diasAtrasoMin, diasAtrasoMax } = filtros;
    if (diasAtrasoMin === 1 && diasAtrasoMax === 5) return '1-5';
    if (diasAtrasoMin === 6 && diasAtrasoMax === 15) return '6-15';
    if (diasAtrasoMin === 16 && diasAtrasoMax === 30) return '16-30';
    if (diasAtrasoMin === 31 && !diasAtrasoMax) return '31+';
    return '';
  };

  const handleFaixaAtrasoChange = (val: string) => {
    switch (val) {
      case '1-5':
        onChange({ diasAtrasoMin: 1, diasAtrasoMax: 5, page: 1 });
        break;
      case '6-15':
        onChange({ diasAtrasoMin: 6, diasAtrasoMax: 15, page: 1 });
        break;
      case '16-30':
        onChange({ diasAtrasoMin: 16, diasAtrasoMax: 30, page: 1 });
        break;
      case '31+':
        onChange({ diasAtrasoMin: 31, diasAtrasoMax: undefined, page: 1 });
        break;
      default:
        onChange({ diasAtrasoMin: undefined, diasAtrasoMax: undefined, page: 1 });
        break;
    }
  };

  // Checks if any non-default filter is currently applied
  const temFiltrosAtivos = Boolean(
    filtros.q ||
    (filtros.tipoRegistro && filtros.tipoRegistro !== 'todos') ||
    filtros.diasAtrasoMin !== undefined ||
    filtros.diasAtrasoMax !== undefined ||
    filtros.motivoCancelamento ||
    filtros.vencimentoDe ||
    filtros.vencimentoAte ||
    filtros.cancelamentoDe ||
    filtros.cancelamentoAte
  );

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
      data-testid="pendencias-filtros-bar"
    >
      {/* Linha Principal de Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Input de Busca Universal */}
        <div className="md:col-span-5 relative">
          <label htmlFor="input-busca-pendencias" className="sr-only">
            Buscar cliente, CPF/CNPJ, cotação ou apólice
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="input-busca-pendencias"
              type="text"
              value={buscaLocal}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar cliente, CPF/CNPJ, cotação ou apólice..."
              className="w-full pl-9 pr-10 py-2.5 min-h-[44px] text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            {buscaLocal && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Limpar campo de busca"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none min-h-[44px] min-w-[36px]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Select Tipo de Registro */}
        <div className="md:col-span-2">
          <label htmlFor="select-tipo-registro" className="sr-only">
            Tipo de Registro
          </label>
          <select
            id="select-tipo-registro"
            value={filtros.tipoRegistro || 'todos'}
            onChange={(e) =>
              onChange({
                tipoRegistro: (e.target.value === 'todos' ? undefined : e.target.value) as
                  | TipoRegistro
                  | undefined,
                page: 1,
              })
            }
            className="w-full py-2.5 px-3 min-h-[44px] text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          >
            <option value="todos">Todos os Tipos</option>
            <option value="cotacao">Cotações</option>
            <option value="venda">Vendas / Apólices</option>
          </select>
        </div>

        {/* Select Faixa de Atraso (ocultar se tab for puramente canceladas) */}
        {tab !== 'canceladas' ? (
          <div className="md:col-span-3">
            <label htmlFor="select-faixa-atraso" className="sr-only">
              Faixa de Atraso
            </label>
            <select
              id="select-faixa-atraso"
              value={getFaixaAtrasoValue()}
              onChange={(e) => handleFaixaAtrasoChange(e.target.value)}
              className="w-full py-2.5 px-3 min-h-[44px] text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            >
              <option value="">Todas as Faixas de Atraso</option>
              <option value="1-5">Até 5 dias (Tolerância inicial)</option>
              <option value="6-15">6 a 15 dias</option>
              <option value="16-30">16 a 30 dias (Risco iminente)</option>
              <option value="31+">Mais de 30 dias (Crítico BR-031)</option>
            </select>
          </div>
        ) : (
          /* Select Motivo de Cancelamento quando tab for canceladas */
          <div className="md:col-span-3">
            <label htmlFor="select-motivo-cancelamento" className="sr-only">
              Motivo do Cancelamento
            </label>
            <select
              id="select-motivo-cancelamento"
              value={filtros.motivoCancelamento || ''}
              onChange={(e) =>
                onChange({
                  motivoCancelamento: e.target.value || undefined,
                  page: 1,
                })
              }
              className="w-full py-2.5 px-3 min-h-[44px] text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            >
              <option value="">Todos os Motivos</option>
              <option value="inadimplencia">Inadimplência</option>
              <option value="recusa_assinatura">Recusa de Assinatura</option>
              <option value="desistencia">Desistência do Cliente</option>
              <option value="administrativo">Administrativo</option>
            </select>
          </div>
        )}

        {/* Botões de Ação Rápida */}
        <div className="md:col-span-2 flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setMostrarFiltrosAvancados(!mostrarFiltrosAvancados)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              mostrarFiltrosAvancados || filtros.vencimentoDe || filtros.cancelamentoDe
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            aria-expanded={mostrarFiltrosAvancados}
            aria-label="Alternar filtros por período"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Período</span>
            {mostrarFiltrosAvancados ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {temFiltrosAtivos && (
            <button
              type="button"
              onClick={onLimpar}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-medium rounded-lg text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400/20"
              title="Limpar todos os filtros aplicados"
              data-testid="btn-limpar-filtros"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </div>

      {/* Painel Expansível de Filtros Avançados / Datas */}
      {mostrarFiltrosAvancados && (
        <div
          className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50/50 p-3 rounded-lg"
          data-testid="painel-filtros-avancados"
        >
          {/* Período de Vencimento */}
          <div>
            <label
              htmlFor="filtro-vencimento-de"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Vencimento A Partir De:
            </label>
            <input
              id="filtro-vencimento-de"
              type="date"
              value={filtros.vencimentoDe || ''}
              onChange={(e) =>
                onChange({ vencimentoDe: e.target.value || undefined, page: 1 })
              }
              className="w-full py-2 px-2.5 min-h-[40px] text-xs text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="filtro-vencimento-ate"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Vencimento Até:
            </label>
            <input
              id="filtro-vencimento-ate"
              type="date"
              value={filtros.vencimentoAte || ''}
              onChange={(e) =>
                onChange({ vencimentoAte: e.target.value || undefined, page: 1 })
              }
              className="w-full py-2 px-2.5 min-h-[40px] text-xs text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Período de Cancelamento */}
          <div>
            <label
              htmlFor="filtro-cancelamento-de"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Cancelado A Partir De:
            </label>
            <input
              id="filtro-cancelamento-de"
              type="date"
              value={filtros.cancelamentoDe || ''}
              onChange={(e) =>
                onChange({ cancelamentoDe: e.target.value || undefined, page: 1 })
              }
              className="w-full py-2 px-2.5 min-h-[40px] text-xs text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="filtro-cancelamento-ate"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Cancelado Até:
            </label>
            <input
              id="filtro-cancelamento-ate"
              type="date"
              value={filtros.cancelamentoAte || ''}
              onChange={(e) =>
                onChange({ cancelamentoAte: e.target.value || undefined, page: 1 })
              }
              className="w-full py-2 px-2.5 min-h-[40px] text-xs text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PendenciasFiltrosBar;
