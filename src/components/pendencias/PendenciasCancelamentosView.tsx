'use client';

import React, { useState, useCallback, useTransition } from 'react';
import {
  ClockAlert,
  FileText,
  Layers,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  PendenciaTab,
  PendenciasFiltros,
  PendenciasPaginadasResult,
} from '@/types/pendencias-cancelamentos';
import { PendenciasKpiCards } from './PendenciasKpiCards';
import { PendenciasFiltrosBar } from './PendenciasFiltrosBar';
import { PendenciasTabela } from './PendenciasTabela';
import { toast } from '@/components/ui/toast';

export interface PendenciasCancelamentosViewProps {
  initialData: PendenciasPaginadasResult;
  initialTab?: PendenciaTab;
  baseRoute: '/portal' | '/admin';
}

export function PendenciasCancelamentosView({
  initialData,
  initialTab = 'em_atraso',
  baseRoute,
}: PendenciasCancelamentosViewProps) {
  const [data, setData] = useState<PendenciasPaginadasResult>(initialData);
  const [tab, setTab] = useState<PendenciaTab>(initialTab);
  const [filtros, setFiltros] = useState<PendenciasFiltros>({
    tab: initialTab,
    page: initialData.page || 1,
    pageSize: initialData.pageSize || 25,
    orderBy: initialTab === 'canceladas' ? 'data_cancelamento' : 'dias_atraso',
    orderDir: initialTab === 'canceladas' ? 'desc' : 'asc',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingAsaas, setIsSyncingAsaas] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Função centralizada para buscar dados da API
  const fetchData = useCallback(
    async (novosFiltros: PendenciasFiltros, targetTab: PendenciaTab) => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams();
        params.set('tab', targetTab);
        params.set('page', String(novosFiltros.page || 1));
        params.set('pageSize', String(novosFiltros.pageSize || 25));

        if (novosFiltros.q) params.set('q', novosFiltros.q);
        if (novosFiltros.corretoraId) params.set('corretoraId', novosFiltros.corretoraId);
        if (novosFiltros.partnerId) params.set('partnerId', novosFiltros.partnerId);
        if (novosFiltros.managerUserId) params.set('managerUserId', novosFiltros.managerUserId);
        if (novosFiltros.vendedorUserId) params.set('vendedorUserId', novosFiltros.vendedorUserId);
        if (novosFiltros.productId) params.set('productId', novosFiltros.productId);
        if (novosFiltros.tipoRegistro && novosFiltros.tipoRegistro !== 'todos') {
          params.set('tipoRegistro', novosFiltros.tipoRegistro);
        }
        if (novosFiltros.situacao) params.set('situacao', novosFiltros.situacao);
        if (novosFiltros.motivoCancelamento) {
          params.set('motivoCancelamento', novosFiltros.motivoCancelamento);
        }
        if (novosFiltros.diasAtrasoMin !== undefined) {
          params.set('diasAtrasoMin', String(novosFiltros.diasAtrasoMin));
        }
        if (novosFiltros.diasAtrasoMax !== undefined) {
          params.set('diasAtrasoMax', String(novosFiltros.diasAtrasoMax));
        }
        if (novosFiltros.vencimentoDe) params.set('vencimentoDe', novosFiltros.vencimentoDe);
        if (novosFiltros.vencimentoAte) params.set('vencimentoAte', novosFiltros.vencimentoAte);
        if (novosFiltros.cancelamentoDe) params.set('cancelamentoDe', novosFiltros.cancelamentoDe);
        if (novosFiltros.cancelamentoAte) params.set('cancelamentoAte', novosFiltros.cancelamentoAte);
        if (novosFiltros.orderBy) params.set('orderBy', novosFiltros.orderBy);
        if (novosFiltros.orderDir) params.set('orderDir', novosFiltros.orderDir);

        const response = await fetch(`/api/pendencias-cancelamentos?${params.toString()}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao carregar dados da central');
        }

        const jsonResult: PendenciasPaginadasResult = await response.json();
        startTransition(() => {
          setData(jsonResult);
        });
      } catch (err: any) {
        setErrorMessage(err.message || 'Falha na comunicação com o servidor');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Atualização com Sincronização Direta no Asaas
  const handleAtualizarComAsaas = async () => {
    setIsSyncingAsaas(true);
    setErrorMessage(null);

    try {
      // 1. Sincroniza em lote com o gateway Asaas
      const syncResponse = await fetch('/api/pendencias-cancelamentos/sync', {
        method: 'POST',
      });

      if (syncResponse.ok) {
        const syncData = await syncResponse.json().catch(() => ({}));
        if (syncData.updatedToPaid && syncData.updatedToPaid > 0) {
          toast.success(
            `Sincronizado com o Asaas! ${syncData.updatedToPaid} pagamento(s) confirmado(s) e baixado(s).`
          );
        } else {
          toast.success('Dados atualizados e sincronizados com o Asaas com sucesso!');
        }
      } else {
        toast.info('Sincronização externa temporariamente indisponível. Recarregando dados locais.');
      }
    } catch {
      toast.info('Sincronização externa temporariamente indisponível. Recarregando dados locais.');
    } finally {
      setIsSyncingAsaas(false);
      // 2. Recarrega os dados da central e indicadores (KPIs)
      await fetchData(filtros, tab);
    }
  };

  // Troca de aba
  const handleTabChange = (novaTab: PendenciaTab) => {
    if (novaTab === tab) return;
    setTab(novaTab);

    const novosFiltros: PendenciasFiltros = {
      ...filtros,
      tab: novaTab,
      page: 1,
      orderBy: novaTab === 'canceladas' ? 'data_cancelamento' : 'dias_atraso',
      orderDir: novaTab === 'canceladas' ? 'desc' : 'asc',
      // Reseta filtros específicos ao mudar de aba para evitar estados inconsistentes
      diasAtrasoMin: novaTab === 'canceladas' ? undefined : filtros.diasAtrasoMin,
      diasAtrasoMax: novaTab === 'canceladas' ? undefined : filtros.diasAtrasoMax,
      motivoCancelamento: novaTab === 'em_atraso' ? undefined : filtros.motivoCancelamento,
    };

    setFiltros(novosFiltros);
    fetchData(novosFiltros, novaTab);
  };

  // Alteração de filtros
  const handleFiltrosChange = (alteracoes: Partial<PendenciasFiltros>) => {
    const atualizados: PendenciasFiltros = {
      ...filtros,
      ...alteracoes,
      tab,
    };
    setFiltros(atualizados);
    fetchData(atualizados, tab);
  };

  // Limpeza de filtros
  const handleLimparFiltros = () => {
    const limpos: PendenciasFiltros = {
      tab,
      page: 1,
      pageSize: filtros.pageSize || 25,
      orderBy: tab === 'canceladas' ? 'data_cancelamento' : 'dias_atraso',
      orderDir: tab === 'canceladas' ? 'desc' : 'asc',
    };
    setFiltros(limpos);
    fetchData(limpos, tab);
  };

  // Ordenação
  const handleSort = (campo: PendenciasFiltros['orderBy']) => {
    if (!campo) return;
    const isSameField = filtros.orderBy === campo;
    const novoDir: 'asc' | 'desc' = isSameField && filtros.orderDir === 'asc' ? 'desc' : 'asc';

    const atualizados: PendenciasFiltros = {
      ...filtros,
      orderBy: campo,
      orderDir: novoDir,
      page: 1,
    };
    setFiltros(atualizados);
    fetchData(atualizados, tab);
  };

  // Paginação
  const handlePageChange = (novaPagina: number) => {
    if (novaPagina < 1 || novaPagina > data.totalPages || novaPagina === data.page) return;
    const atualizados = { ...filtros, page: novaPagina };
    setFiltros(atualizados);
    fetchData(atualizados, tab);
  };

  const handlePageSizeChange = (novoPageSize: number) => {
    const atualizados = { ...filtros, pageSize: novoPageSize, page: 1 };
    setFiltros(atualizados);
    fetchData(atualizados, tab);
  };

  // Cálculo de indicadores de página
  const inicioRegistro = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const fimRegistro = Math.min(data.page * data.pageSize, data.total);

  return (
    <div
      className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
      data-testid="pendencias-cancelamentos-view"
    >
      {/* Cabeçalho da Central */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Central de Pendências e Cancelamentos
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitore inadimplência, prazos de tolerância BR-031 e histórico de contratos cancelados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAtualizarComAsaas}
            disabled={isLoading || isSyncingAsaas}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl text-primary bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
            data-testid="btn-atualizar-dados"
            title="Sincronizar com o Asaas e atualizar dados da central"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncingAsaas || isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {isSyncingAsaas
                ? 'Sincronizando Asaas...'
                : isLoading
                ? 'Atualizando...'
                : 'Atualizar Dados'}
            </span>
          </button>
        </div>
      </div>

      {/* Alerta de Erro se houver */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start justify-between gap-3"
          data-testid="alert-erro-central"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Erro ao processar solicitação</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchData(filtros, tab)}
            className="text-xs font-semibold px-3 py-1.5 min-h-[36px] bg-white border border-rose-300 text-rose-800 rounded-lg hover:bg-rose-100 transition-colors shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPIs Cards Consolidados */}
      <section aria-label="Indicadores Consolidados da Central">
        <PendenciasKpiCards
          kpis={data.kpis}
          activeTab={tab}
          onSelectTab={handleTabChange}
          isLoading={isLoading && !data.items.length}
        />
      </section>

      {/* Abas Superiores Navegáveis */}
      <nav
        aria-label="Abas da Central de Pendências"
        className="border-b border-gray-200 flex space-x-2 sm:space-x-6 overflow-x-auto custom-scrollbar"
      >
        {/* Aba 1: Em Atraso */}
        <button
          type="button"
          onClick={() => handleTabChange('em_atraso')}
          aria-selected={tab === 'em_atraso'}
          role="tab"
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 whitespace-nowrap min-h-[44px] transition-colors focus:outline-none ${
            tab === 'em_atraso'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
          data-testid="tab-em-atraso"
        >
          <ClockAlert className="w-4 h-4" />
          <span>Em Atraso</span>
          <span
            className={`rounded-full text-xs font-bold px-2 py-0.5 border ${
              tab === 'em_atraso'
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-gray-100 border-gray-200 text-gray-700'
            }`}
          >
            {data.kpis.totalContratacoesEmAtraso}
          </span>
        </button>

        {/* Aba 2: Canceladas */}
        <button
          type="button"
          onClick={() => handleTabChange('canceladas')}
          aria-selected={tab === 'canceladas'}
          role="tab"
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 whitespace-nowrap min-h-[44px] transition-colors focus:outline-none ${
            tab === 'canceladas'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
          data-testid="tab-canceladas"
        >
          <FileText className="w-4 h-4" />
          <span>Canceladas</span>
          <span
            className={`rounded-full text-xs font-bold px-2 py-0.5 border ${
              tab === 'canceladas'
                ? 'bg-red-100 border-red-300 text-red-900'
                : 'bg-gray-100 border-gray-200 text-gray-700'
            }`}
          >
            {data.kpis.totalContratacoesCanceladas}
          </span>
        </button>

        {/* Aba 3: Visão Geral */}
        <button
          type="button"
          onClick={() => handleTabChange('visao_geral')}
          aria-selected={tab === 'visao_geral'}
          role="tab"
          className={`flex items-center gap-2 py-3 px-3 text-sm font-semibold border-b-2 whitespace-nowrap min-h-[44px] transition-colors focus:outline-none ${
            tab === 'visao_geral'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
          data-testid="tab-visao-geral"
        >
          <Layers className="w-4 h-4" />
          <span>Visão Geral</span>
          <span className="rounded-full text-xs font-bold px-2 py-0.5 border bg-gray-100 border-gray-200 text-gray-700">
            {data.kpis.totalContratacoesEmAtraso + data.kpis.totalContratacoesCanceladas}
          </span>
        </button>
      </nav>

      {/* Barra de Filtros */}
      <section aria-label="Filtros de Pesquisa">
        <PendenciasFiltrosBar
          filtros={filtros}
          onChange={handleFiltrosChange}
          onLimpar={handleLimparFiltros}
          tab={tab}
          isLoading={isLoading}
        />
      </section>

      {/* Tabela de Contratações e Parcelas */}
      <section aria-label="Tabela de Contratações">
        <PendenciasTabela
          items={data.items}
          tab={tab}
          baseRoute={baseRoute}
          orderBy={filtros.orderBy}
          orderDir={filtros.orderDir}
          onSort={handleSort}
          isLoading={isLoading}
        />
      </section>

      {/* Rodapé e Paginação Completa */}
      {data.total > 0 && (
        <div
          className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm"
          data-testid="pendencias-paginacao"
        >
          {/* Indicador de registros e Seletor de PageSize */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>
              Exibindo <strong className="text-gray-900">{inicioRegistro}</strong> a{' '}
              <strong className="text-gray-900">{fimRegistro}</strong> de{' '}
              <strong className="text-gray-900">{data.total}</strong> registros
            </span>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="select-page-size" className="text-xs text-gray-500">
                Itens por página:
              </label>
              <select
                id="select-page-size"
                value={data.pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="py-1 px-2 text-xs text-gray-800 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary min-h-[36px]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Botões de Navegação de Página */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(data.page - 1)}
              disabled={data.page <= 1 || isLoading}
              className="inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Números de página */}
            <div className="flex items-center gap-1">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  // Mostra primeira página, última página e páginas próximas à atual
                  return (
                    p === 1 ||
                    p === data.totalPages ||
                    Math.abs(p - data.page) <= 1
                  );
                })
                .map((p, idx, arr) => {
                  const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsisBefore && (
                        <span className="px-2 text-gray-400 text-xs">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePageChange(p)}
                        aria-current={p === data.page ? 'page' : undefined}
                        className={`min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-semibold rounded-lg border transition-colors focus:outline-none ${
                          p === data.page
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => handlePageChange(data.page + 1)}
              disabled={data.page >= data.totalPages || isLoading}
              className="inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Próxima página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PendenciasCancelamentosView;
