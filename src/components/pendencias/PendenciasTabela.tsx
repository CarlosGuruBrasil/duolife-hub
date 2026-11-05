'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ClockAlert,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency, formatDate, formatarDocumento } from '@/lib/format';
import type {
  PendenciaCancelamentoItem,
  PendenciaTab,
  PendenciasFiltros,
  SituacaoContrato,
} from '@/types/pendencias-cancelamentos';
import { ParcelasAcordeao } from './ParcelasAcordeao';

export interface PendenciasTabelaProps {
  items: PendenciaCancelamentoItem[];
  tab: PendenciaTab;
  baseRoute: '/portal' | '/admin';
  orderBy?: PendenciasFiltros['orderBy'];
  orderDir?: PendenciasFiltros['orderDir'];
  onSort?: (campo: PendenciasFiltros['orderBy']) => void;
  isLoading?: boolean;
}

export function PendenciasTabela({
  items,
  tab,
  baseRoute,
  orderBy,
  orderDir = 'asc',
  onSort,
  isLoading = false,
}: PendenciasTabelaProps) {
  // Set of expanded cotacaoIds for accordion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSortIcon = (campo: PendenciasFiltros['orderBy']) => {
    if (orderBy !== campo) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 ml-1" />;
    }
    return orderDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-primary ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-primary ml-1" />
    );
  };

  const renderSituacaoBadge = (situacao: SituacaoContrato, item: PendenciaCancelamentoItem) => {
    switch (situacao) {
      case 'em_atraso_tolerancia':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-amber-50 border-amber-200 text-amber-800">
            <ClockAlert className="w-3 h-3 text-amber-600" />
            Atraso (Tolerância)
          </span>
        );
      case 'em_atraso_critico':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-rose-50 border-rose-200 text-rose-800">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Atraso Crítico (BR-031)
          </span>
        );
      case 'cancelada':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-red-50 border-red-200 text-red-800">
            <FileText className="w-3 h-3 text-red-600" />
            Cancelada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-gray-100 border-gray-200 text-gray-700">
            {situacao}
          </span>
        );
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
        data-testid="tabela-loading-skeleton"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="h-4 bg-gray-200 rounded w-48 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 animate-pulse flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-64" />
                <div className="h-3 bg-gray-200 rounded w-40" />
              </div>
              <div className="h-6 bg-gray-200 rounded-full w-28" />
              <div className="h-4 bg-gray-200 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-xl p-8 sm:p-12 text-center shadow-sm"
        data-testid="tabela-empty-state"
      >
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 mb-3">
          {tab === 'em_atraso' ? (
            <CheckCircle2 className="w-8 h-8" />
          ) : (
            <FileText className="w-8 h-8 text-gray-500" />
          )}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
          {tab === 'em_atraso'
            ? 'Nenhuma contratação em atraso!'
            : tab === 'canceladas'
            ? 'Nenhuma contratação cancelada no filtro selecionado'
            : 'Nenhum registro encontrado'}
        </h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {tab === 'em_atraso'
            ? 'Todas as parcelas e cobranças estão em dia ou não há contratos inadimplentes registrados no período.'
            : tab === 'canceladas'
            ? 'Não constam contratações canceladas para os filtros aplicados. Tente ajustar os parâmetros de busca.'
            : 'Tente alterar ou limpar os filtros de pesquisa para visualizar outros registros.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
      data-testid="pendencias-tabela"
    >
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              {/* Botão de expansão */}
              <th scope="col" className="w-10 px-3 py-3.5 text-center">
                <span className="sr-only">Expandir detalhes</span>
              </th>

              {/* Contratação / Identificador */}
              <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                Contratação / Ref
              </th>

              {/* Cliente */}
              <th scope="col" className="px-4 py-3.5">
                Cliente
              </th>

              {/* Corretora & Vendedor */}
              <th scope="col" className="px-4 py-3.5">
                Corretora & Vendedor
              </th>

              {/* Produto */}
              <th scope="col" className="px-4 py-3.5">
                Produto / Plano
              </th>

              {/* Valor Total Contratação (Ordenável) */}
              <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onSort?.('valor')}
                  className="group inline-flex items-center text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por valor total"
                >
                  <span>Valor Contrato</span>
                  {getSortIcon('valor')}
                </button>
              </th>

              {/* Situação e Atraso (Ordenável) */}
              <th scope="col" className="px-4 py-3.5 whitespace-nowrap">
                {tab === 'canceladas' ? (
                  <button
                    type="button"
                    onClick={() => onSort?.('data_cancelamento')}
                    className="group inline-flex items-center text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                    aria-label="Ordenar por data de cancelamento"
                  >
                    <span>Cancelamento</span>
                    {getSortIcon('data_cancelamento')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSort?.('dias_atraso')}
                    className="group inline-flex items-center text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                    aria-label="Ordenar por dias de atraso"
                  >
                    <span>Situação / Atraso</span>
                    {getSortIcon('dias_atraso')}
                  </button>
                )}
              </th>

              {/* Vencimento / Limite BR-031 (Ordenável) */}
              <th scope="col" className="px-4 py-3.5 whitespace-nowrap text-right">
                <button
                  type="button"
                  onClick={() => onSort?.('vencimento')}
                  className="group inline-flex items-center text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por data de vencimento mais antiga"
                >
                  <span>{tab === 'canceladas' ? 'Detalhe Rescisão' : 'Vencimento / Limite'}</span>
                  {getSortIcon('vencimento')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.map((item) => {
              const isExpanded = expandedIds.has(item.cotacaoId);
              const linkDestino =
                item.tipoRegistro === 'venda' && item.saleId
                  ? `${baseRoute}/vendas/${item.saleId}`
                  : `${baseRoute}/cotacoes/${item.cotacaoId}`;

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={`hover:bg-gray-50/80 transition-colors ${
                      isExpanded ? 'bg-gray-50/40' : ''
                    }`}
                    data-testid={`linha-pendencia-${item.cotacaoId}`}
                  >
                    {/* Botão de Toggle do Acordeão */}
                    <td className="px-3 py-3.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.cotacaoId)}
                        aria-expanded={isExpanded}
                        aria-controls={`acordeao-detalhe-${item.cotacaoId}`}
                        aria-label={
                          isExpanded
                            ? `Recolher parcelas da cotação #${item.cotacaoId.slice(0, 8)}`
                            : `Expandir parcelas da cotação #${item.cotacaoId.slice(0, 8)}`
                        }
                        className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Contratação / Links */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={linkDestino}
                          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-primary hover:underline"
                          title="Abrir detalhes da contratação"
                        >
                          <span>#{item.cotacaoId.slice(0, 8).toUpperCase()}</span>
                          <ExternalLink className="w-3 h-3 text-primary/70" />
                        </Link>
                        {item.policyNumber ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.2 rounded w-fit">
                            Apólice: {item.policyNumber}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500">
                            {item.tipoRegistro === 'venda' ? 'Venda (Sem apólice)' : 'Cotação / Proposta'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 leading-tight">
                          {item.clientName}
                        </span>
                        <span className="text-xs text-gray-500 font-mono mt-0.5">
                          {formatarDocumento(item.clientCpfCnpj)}
                        </span>
                        {(item.clientEmail || item.clientPhone) && (
                          <span className="text-[11px] text-gray-500 truncate max-w-[200px] mt-0.5" title={`${item.clientEmail || ''} ${item.clientPhone || ''}`}>
                            {item.clientPhone || item.clientEmail}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Corretora & Vendedor */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col text-xs text-gray-700">
                        <span className="font-medium text-gray-900 truncate max-w-[180px]" title={item.corretoraNome || item.partnerNome}>
                          {item.corretoraNome || item.partnerNome}
                        </span>
                        <span className="text-gray-500 text-[11px] mt-0.5">
                          Vendedor: {item.vendedorNome || item.managerNome || 'Venda Direta'}
                        </span>
                      </div>
                    </td>

                    {/* Produto / Plano */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="text-xs font-medium text-gray-800">
                        {item.productName || 'Seguro RC Profissional'}
                      </span>
                    </td>

                    {/* Valor Contratação & Atraso */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">
                          {formatCurrency(item.valorTotalContratacao)}
                        </span>
                        {item.valorTotalAtraso > 0 && (
                          <span className="text-xs font-semibold text-rose-700 mt-0.5">
                            {formatCurrency(item.valorTotalAtraso)} em atraso
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Situação Contratual / Prazos */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        {renderSituacaoBadge(item.situacaoContrato, item)}

                        {item.situacaoContrato === 'cancelada' ? (
                          <span className="text-[11px] text-gray-500">
                            Motivo: {item.motivoCancelamento || 'Inadimplência'}
                          </span>
                        ) : item.maiorDiasAtraso > 0 ? (
                          <span className="text-xs font-medium text-gray-700">
                            {item.maiorDiasAtraso} {item.maiorDiasAtraso === 1 ? 'dia' : 'dias'} de atraso
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-700">Sem atraso</span>
                        )}
                      </div>
                    </td>

                    {/* Vencimento / Limite BR-031 ou Rescisão */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      {item.situacaoContrato === 'cancelada' ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-semibold text-gray-800">
                            Cancelado em {formatDate(item.dataCancelamento)}
                          </span>
                          {item.valorRecebidoAntesCancelamento !== undefined && (
                            <span className="text-[11px] text-gray-500">
                              Recebido: {formatCurrency(item.valorRecebidoAntesCancelamento)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          {item.dataVencimentoMaisAntiga ? (
                            <span className="text-xs text-gray-700">
                              Venc: {formatDate(item.dataVencimentoMaisAntiga)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}

                          {item.dataLimiteCancelamentoMaisCritica && (
                            <span className="text-[11px] text-rose-700 font-medium">
                              Limite: {formatDate(item.dataLimiteCancelamentoMaisCritica)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Linha Expansível do Acordeão de Parcelas */}
                  {isExpanded && (
                    <tr id={`acordeao-detalhe-${item.cotacaoId}`}>
                      <td colSpan={8} className="p-0 border-b border-gray-200">
                        <ParcelasAcordeao
                          parcelas={item.parcelas}
                          cotacaoId={item.cotacaoId}
                          policyNumber={item.policyNumber}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PendenciasTabela;
