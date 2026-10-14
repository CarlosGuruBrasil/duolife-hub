'use client';

import React from 'react';
import {
  StatusCliente,
  StatusGeral,
  StatusPagamento,
  MatrixStatusInput,
  MatrixStatusResult,
  calculateMatrixStatus,
  getStatusClienteBadge,
  getStatusGeralBadge,
  getStatusPagamentoBadge,
} from '@/lib/status-matrix';

export interface MatrixStatusBadgeProps {
  /** Resultado já calculado pelo motor de status */
  result?: MatrixStatusResult | null;
  /** Ou valores individuais de status */
  statusCliente?: StatusCliente | string | null;
  statusGeral?: StatusGeral | string | null;
  statusPagamento?: StatusPagamento | string | null;
  /** Ou objeto de entrada bruto para cálculo dinâmico */
  input?: MatrixStatusInput;
  /** Formato de exibição */
  variant?: 'table-cell' | 'card' | 'inline' | 'pill-only';
  /** Se deve exibir os status secundários (Status Geral e Pagamento) */
  showSecondary?: boolean;
  /** Classes extras para o container */
  className?: string;
}

export function MatrixStatusBadge({
  result,
  statusCliente,
  statusGeral,
  statusPagamento,
  input,
  variant = 'table-cell',
  showSecondary = true,
  className = '',
}: MatrixStatusBadgeProps) {
  // Resolve o resultado consolidado
  const computed: MatrixStatusResult = React.useMemo(() => {
    if (result) return result;
    return calculateMatrixStatus({
      ...input,
      rawStatusCliente: statusCliente,
      rawStatusGeral: statusGeral,
      rawStatusPagamento: statusPagamento,
    });
  }, [result, statusCliente, statusGeral, statusPagamento, input]);

  const clienteBadge = getStatusClienteBadge(computed.statusCliente);
  const geralBadge = getStatusGeralBadge(computed.statusGeral);
  const pagamentoBadge = getStatusPagamentoBadge(computed.statusPagamento);

  // Variante: Apenas o pill principal do Status do Cliente
  if (variant === 'pill-only') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${clienteBadge.bgClass} ${clienteBadge.borderClass} ${clienteBadge.textClass} ${className}`}
        title={`Status do Cliente: ${computed.statusCliente}\nStatus Geral: ${computed.statusGeral}\nStatus de Pagamento: ${computed.statusPagamento}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${clienteBadge.dotClass}`} />
        {computed.statusCliente}
      </span>
    );
  }

  // Variante: Inline horizontal
  if (variant === 'inline') {
    return (
      <div className={`inline-flex items-center flex-wrap gap-1.5 ${className}`}>
        {/* Principal: Status do Cliente */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-xs ${clienteBadge.bgClass} ${clienteBadge.borderClass} ${clienteBadge.textClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${clienteBadge.dotClass}`} />
          {computed.statusCliente}
        </span>

        {showSecondary && (
          <>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${geralBadge.bgClass} ${geralBadge.borderClass} ${geralBadge.textClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${geralBadge.dotClass}`} />
              {computed.statusGeral}
            </span>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${pagamentoBadge.bgClass} ${pagamentoBadge.borderClass} ${pagamentoBadge.textClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${pagamentoBadge.dotClass}`} />
              {computed.statusPagamento}
            </span>
          </>
        )}
      </div>
    );
  }

  // Variante: Card para páginas de detalhes
  if (variant === 'card') {
    return (
      <div
        className={`rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3 ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Situação do Segurado
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${clienteBadge.bgClass} ${clienteBadge.borderClass} ${clienteBadge.textClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${clienteBadge.dotClass}`} />
            {computed.statusCliente}
          </span>
        </div>

        {showSecondary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-gray-500 font-medium">Status Geral:</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border text-[11px] ${geralBadge.bgClass} ${geralBadge.borderClass} ${geralBadge.textClass}`}
              >
                {computed.statusGeral}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-gray-500 font-medium">Pagamento:</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border text-[11px] ${pagamentoBadge.bgClass} ${pagamentoBadge.borderClass} ${pagamentoBadge.textClass}`}
              >
                {computed.statusPagamento}
              </span>
            </div>
          </div>
        )}

        {computed.descricao && (
          <p className="text-[11px] text-gray-500 font-normal leading-relaxed">
            {computed.descricao}
          </p>
        )}
      </div>
    );
  }

  // Variante Padrão: table-cell (ideal para colunas de tabelas do Admin e Portal)
  return (
    <div className={`flex flex-col items-center gap-1 text-center ${className}`}>
      {/* 1. Status Principal: Status do Cliente */}
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${clienteBadge.bgClass} ${clienteBadge.borderClass} ${clienteBadge.textClass}`}
        title={`Status do Cliente: ${computed.statusCliente}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${clienteBadge.dotClass}`} />
        <span className="whitespace-nowrap">{computed.statusCliente}</span>
      </span>

      {/* 2. Status Secundários: Status Geral + Pagamento */}
      {showSecondary && (
        <div className="flex items-center justify-center flex-wrap gap-1 mt-0.5 max-w-[200px]">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${geralBadge.bgClass} ${geralBadge.borderClass} ${geralBadge.textClass}`}
            title={`Status Geral: ${computed.statusGeral}`}
          >
            <span className="whitespace-nowrap">{computed.statusGeral}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pagamentoBadge.bgClass} ${pagamentoBadge.borderClass} ${pagamentoBadge.textClass}`}
            title={`Status de Pagamento: ${computed.statusPagamento}`}
          >
            <span className="whitespace-nowrap">{computed.statusPagamento}</span>
          </span>
        </div>
      )}
    </div>
  );
}
