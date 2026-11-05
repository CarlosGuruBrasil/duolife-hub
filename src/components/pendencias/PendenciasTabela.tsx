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
} from 'lucide-react';
import { formatCurrency, formatDate, formatarDocumento } from '@/lib/format';
import type {
  PendenciaCancelamentoItem,
  PendenciaTab,
  PendenciasFiltros,
  PendenciasSortField,
  SituacaoContrato,
} from '@/types/pendencias-cancelamentos';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { ParcelasAcordeao } from './ParcelasAcordeao';

export interface PendenciasTabelaProps {
  items: PendenciaCancelamentoItem[];
  tab: PendenciaTab;
  baseRoute: '/portal' | '/admin';
  orderBy?: PendenciasFiltros['orderBy'];
  orderDir?: PendenciasFiltros['orderDir'];
  onSort?: (campo: PendenciasSortField) => void;
  isLoading?: boolean;
}

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return 'DL';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PendenciasTabela({
  items,
  tab,
  baseRoute,
  orderBy = 'dias_atraso',
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

  const renderSortIndicator = (campo: PendenciasSortField) => {
    if (orderBy !== campo) {
      return (
        <ArrowUpDown
          className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 ml-1.5"
          aria-hidden="true"
        />
      );
    }
    return orderDir === 'asc' ? (
      <ArrowUp
        className="w-3.5 h-3.5 text-[#0e4a5a] font-bold shrink-0 ml-1.5"
        aria-hidden="true"
      />
    ) : (
      <ArrowDown
        className="w-3.5 h-3.5 text-[#0e4a5a] font-bold shrink-0 ml-1.5"
        aria-hidden="true"
      />
    );
  };

  const renderSituacaoBadge = (situacao: SituacaoContrato) => {
    switch (situacao) {
      case 'em_atraso_tolerancia':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold px-2.5 py-0.5 border bg-amber-50 border-amber-200 text-amber-800 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Atraso (Tolerância)
          </span>
        );
      case 'em_atraso_critico':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold px-2.5 py-0.5 border bg-rose-50 border-rose-200 text-rose-800 shadow-2xs">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Atraso Crítico (BR-031)
          </span>
        );
      case 'cancelada':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold px-2.5 py-0.5 border bg-rose-50 border-rose-200 text-rose-800 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            Cancelada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full text-[11px] font-semibold px-2.5 py-0.5 border bg-slate-100 border-slate-200 text-slate-700 shadow-2xs">
            {situacao}
          </span>
        );
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs"
        data-testid="tabela-loading-skeleton"
      >
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div className="h-4 bg-slate-200 rounded w-48 animate-pulse" />
          <div className="h-4 bg-slate-200 rounded w-24 animate-pulse" />
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-6 animate-pulse flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 bg-slate-200 rounded w-64" />
                <div className="h-3 bg-slate-200 rounded w-40" />
              </div>
              <div className="h-6 bg-slate-200 rounded-full w-28" />
              <div className="h-4 bg-slate-200 rounded w-20" />
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
        className="bg-white border border-slate-200/80 rounded-2xl p-8 sm:p-14 text-center shadow-xs"
        data-testid="tabela-empty-state"
      >
        <div className="inline-flex items-center justify-center p-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 mb-4 shadow-2xs">
          {tab === 'em_atraso' ? (
            <CheckCircle2 className="w-9 h-9" />
          ) : (
            <FileText className="w-9 h-9 text-slate-400" />
          )}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
          {tab === 'em_atraso'
            ? 'Nenhuma contratação em atraso!'
            : tab === 'canceladas'
            ? 'Nenhuma contratação cancelada no filtro selecionado'
            : 'Nenhum registro encontrado'}
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
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
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
      data-testid="pendencias-tabela"
    >
      <TableScrollContainer minWidth="1100px">
        <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap border-separate border-spacing-0">
          <thead className="table-sticky-head bg-slate-50/95 backdrop-blur-sm text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              {/* 1. Cliente / CPF */}
              <th className="px-6 py-4 border-b border-slate-200 rounded-tl-2xl">
                <button
                  type="button"
                  onClick={() => onSort?.('cliente')}
                  className="group inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por nome do cliente"
                >
                  <span>Cliente / CPF</span>
                  {renderSortIndicator('cliente')}
                </button>
              </th>

              {/* 2. Contratação & Plano */}
              <th className="px-6 py-4 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => onSort?.('contratacao')}
                  className="group inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por código de contratação ou apólice"
                >
                  <span>Contratação & Plano</span>
                  {renderSortIndicator('contratacao')}
                </button>
              </th>

              {/* 3. Situação / Status */}
              <th className="px-6 py-4 border-b border-slate-200 text-center">
                <button
                  type="button"
                  onClick={() => onSort?.(tab === 'canceladas' ? 'data_cancelamento' : 'dias_atraso')}
                  className="group inline-flex items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label={
                    tab === 'canceladas'
                      ? 'Ordenar por data de cancelamento'
                      : 'Ordenar por dias de atraso'
                  }
                >
                  <span>Situação / Status</span>
                  {renderSortIndicator(tab === 'canceladas' ? 'data_cancelamento' : 'dias_atraso')}
                </button>
              </th>

              {/* 4. Valor Total */}
              <th className="px-6 py-4 border-b border-slate-200 text-right">
                <button
                  type="button"
                  onClick={() => onSort?.('valor')}
                  className="group inline-flex items-center justify-end text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 ml-auto"
                  aria-label="Ordenar por valor total"
                >
                  <span>Valor Total</span>
                  {renderSortIndicator('valor')}
                </button>
              </th>

              {/* 5. Parceiro / Vendedor */}
              <th className="px-6 py-4 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => onSort?.('corretora')}
                  className="group inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por corretora ou parceiro"
                >
                  <span>Parceiro / Vendedor</span>
                  {renderSortIndicator('corretora')}
                </button>
              </th>

              {/* 6. Vencimento & Parcelas */}
              <th className="px-6 py-4 border-b border-slate-200 text-center rounded-tr-2xl">
                <button
                  type="button"
                  onClick={() => onSort?.('vencimento')}
                  className="group inline-flex items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Ordenar por data de vencimento mais antiga"
                >
                  <span>Vencimento & Parcelas</span>
                  {renderSortIndicator('vencimento')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const isExpanded = expandedIds.has(item.cotacaoId);
              const linkDestino =
                item.tipoRegistro === 'venda' && item.saleId
                  ? `${baseRoute}/vendas/${item.saleId}`
                  : `${baseRoute}/cotacoes/${item.cotacaoId}`;

              const initials = getInitials(item.vendedorNome || item.corretoraNome || item.partnerNome);

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={`hover:bg-slate-50/60 transition-colors duration-150 group ${
                      isExpanded ? 'bg-slate-50/40' : ''
                    }`}
                    data-testid={`linha-pendencia-${item.cotacaoId}`}
                  >
                    {/* 1. Cliente / CPF */}
                    <td className="px-6 py-4">
                      <Link
                        href={linkDestino}
                        className="font-semibold text-slate-900 hover:text-emerald-600 hover:underline block max-w-[260px] truncate uppercase"
                        title={item.clientName}
                      >
                        {item.clientName}
                      </Link>
                      <div className="text-xs text-slate-500 font-normal mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
                        <span>{formatarDocumento(item.clientCpfCnpj)}</span>
                        {item.clientPhone && <span>· {item.clientPhone}</span>}
                      </div>
                    </td>

                    {/* 2. Contratação & Plano */}
                    <td className="px-6 py-4 border-b border-slate-100">
                      <span
                        className="text-sm font-semibold text-slate-900 block max-w-[240px] truncate"
                        title={item.productName || 'Seguro RC Profissional'}
                      >
                        {item.productName || 'Seguro RC Profissional'}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Link
                          href={linkDestino}
                          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#0e4a5a] hover:underline"
                          title="Abrir detalhes da contratação"
                        >
                          <span>#{item.cotacaoId.slice(0, 8).toUpperCase()}</span>
                          <ExternalLink className="w-3 h-3 text-[#0e4a5a]/70" />
                        </Link>
                        {item.policyNumber ? (
                          <span className="inline-flex items-center font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                            Apólice: {item.policyNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {item.tipoRegistro === 'venda' ? 'Venda (Sem apólice)' : 'Cotação / Proposta'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Situação / Status */}
                    <td className="px-6 py-4 text-center border-b border-slate-100">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        {renderSituacaoBadge(item.situacaoContrato)}

                        {item.situacaoContrato === 'cancelada' ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 max-w-[190px] truncate"
                            title={`Motivo: ${item.motivoCancelamento || 'Inadimplência'}`}
                          >
                            Motivo: {item.motivoCancelamento || 'Inadimplência'}
                          </span>
                        ) : item.maiorDiasAtraso > 0 ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              item.situacaoContrato === 'em_atraso_critico'
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            ⏱️ {item.maiorDiasAtraso} {item.maiorDiasAtraso === 1 ? 'dia' : 'dias'} de atraso
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-semibold">Sem atraso</span>
                        )}
                      </div>
                    </td>

                    {/* 4. Valor Total */}
                    <td className="px-6 py-4 text-right border-b border-slate-100">
                      <span className="text-sm font-bold text-slate-900 block">
                        {formatCurrency(item.valorTotalContratacao)}
                      </span>
                      {item.valorTotalAtraso > 0 ? (
                        <span className="text-[11px] text-rose-600 font-semibold block mt-0.5">
                          {formatCurrency(item.valorTotalAtraso)} em atraso
                        </span>
                      ) : item.situacaoContrato === 'cancelada' && item.valorRecebidoAntesCancelamento !== undefined ? (
                        <span className="text-[10px] text-slate-500 font-normal block mt-0.5">
                          Recebido: {formatCurrency(item.valorRecebidoAntesCancelamento)}
                        </span>
                      ) : item.parcelas.length > 0 ? (
                        <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                          {item.parcelas.length}x parcelado
                        </span>
                      ) : null}
                    </td>

                    {/* 5. Parceiro / Vendedor */}
                    <td className="px-6 py-4 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 uppercase shrink-0 shadow-2xs"
                          title={item.vendedorNome || item.corretoraNome || 'DuoLife'}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <span
                            className="text-xs font-semibold text-slate-900 truncate max-w-[170px]"
                            title={item.vendedorNome || item.managerNome || 'Venda Direta'}
                          >
                            {item.vendedorNome || item.managerNome || 'Venda Direta'}
                          </span>
                          <span
                            className="text-[10px] text-slate-400 font-normal truncate max-w-[170px]"
                            title={item.corretoraNome || item.partnerNome}
                          >
                            {item.corretoraNome || item.partnerNome || 'DuoLife Hub'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 6. Vencimento & Parcelas */}
                    <td className="px-6 py-4 text-center border-b border-slate-100">
                      <div className="flex flex-col items-center justify-center">
                        {item.situacaoContrato === 'cancelada' ? (
                          <span className="text-xs font-semibold text-slate-700">
                            Rescisão: {formatDate(item.dataCancelamento)}
                          </span>
                        ) : (
                          <div className="flex flex-col items-center">
                            {item.dataVencimentoMaisAntiga ? (
                              <span className="text-xs font-medium text-slate-700">
                                Venc: {formatDate(item.dataVencimentoMaisAntiga)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                            {item.dataLimiteCancelamentoMaisCritica && (
                              <span className="text-[10px] font-bold text-rose-600 mt-0.5">
                                Limite: {formatDate(item.dataLimiteCancelamentoMaisCritica)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Botão Pílula Interativo para Expandir/Recolher Parcelas */}
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
                          className={`mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all shadow-2xs min-h-[32px] ${
                            isExpanded
                              ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <span>{isExpanded ? 'Ocultar' : `Parcelas (${item.parcelas.length})`}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Linha Expansível do Acordeão de Parcelas */}
                  {isExpanded && (
                    <tr id={`acordeao-detalhe-${item.cotacaoId}`}>
                      <td colSpan={6} className="p-0 border-b border-slate-200 bg-slate-50/40">
                        <div className="p-4 sm:p-6">
                          <ParcelasAcordeao
                            parcelas={item.parcelas}
                            cotacaoId={item.cotacaoId}
                            policyNumber={item.policyNumber}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScrollContainer>
    </div>
  );
}

export default PendenciasTabela;
