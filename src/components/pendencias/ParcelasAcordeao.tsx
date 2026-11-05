'use client';

import React from 'react';
import {
  FileText,
  QrCode,
  ExternalLink,
  AlertCircle,
  ClockAlert,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import type { ParcelaDetalhe } from '@/types/pendencias-cancelamentos';

export interface ParcelasAcordeaoProps {
  parcelas: ParcelaDetalhe[];
  cotacaoId?: string;
  policyNumber?: string | null;
}

export function ParcelasAcordeao({
  parcelas,
  cotacaoId,
  policyNumber,
}: ParcelasAcordeaoProps) {
  if (!parcelas || parcelas.length === 0) {
    return (
      <div
        className="p-5 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-center"
        data-testid="parcelas-empty"
      >
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-50 border border-amber-200 text-amber-700 mb-2">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-gray-900">
          Nenhuma parcela gerada no gateway
        </p>
        <p className="text-xs text-gray-500 mt-1">
          As cobranças ainda não foram emitidas pelo Asaas ou não constam nesta contratação.
        </p>
      </div>
    );
  }

  const getStatusBadge = (parcela: ParcelaDetalhe) => {
    switch (parcela.status?.toLowerCase()) {
      case 'paid':
      case 'paga':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-emerald-50 border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            Paga
          </span>
        );
      case 'overdue':
      case 'vencida':
        return (
          <span className="inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-amber-50 border-amber-200 text-amber-800">
            <ClockAlert className="w-3 h-3" />
            Vencida
          </span>
        );
      case 'cancelled':
      case 'cancelada':
        return (
          <span className="inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-gray-100 border-gray-200 text-gray-700">
            Cancelada
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-0.5 border bg-sky-50 border-sky-200 text-sky-800">
            Pendente
          </span>
        );
    }
  };

  return (
    <div
      className="bg-gray-50/80 border-t border-b border-gray-200 p-4 sm:p-5 rounded-b-lg"
      data-testid="parcelas-acordeao"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
            <span>Demonstrativo de Parcelas</span>
            <span className="text-gray-400 font-normal">|</span>
            <span className="text-gray-500 font-normal">
              {parcelas.length} {parcelas.length === 1 ? 'parcela' : 'parcelas'} registradas
            </span>
          </h4>
        </div>
        {policyNumber && (
          <span className="text-xs text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded font-mono">
            Apólice #{policyNumber}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-gray-100/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              <th scope="col" className="px-4 py-3">Parcela</th>
              <th scope="col" className="px-4 py-3">Valor</th>
              <th scope="col" className="px-4 py-3">Vencimento</th>
              <th scope="col" className="px-4 py-3">Situação</th>
              <th scope="col" className="px-4 py-3">Atraso</th>
              <th scope="col" className="px-4 py-3">Limite Cancelamento (BR-031)</th>
              <th scope="col" className="px-4 py-3 text-right">Ações / Asaas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {parcelas.map((parcela) => {
              const hasActions = Boolean(
                parcela.bankSlipUrl || parcela.pixQrCodeUrl || parcela.invoiceUrl
              );

              return (
                <tr
                  key={parcela.id || parcela.installmentNumber}
                  className="hover:bg-gray-50/60 transition-colors"
                  data-testid={`parcela-row-${parcela.installmentNumber}`}
                >
                  {/* Parcela */}
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium text-gray-900">
                    #{parcela.installmentNumber}
                  </td>

                  {/* Valor */}
                  <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-gray-900">
                    {formatCurrency(parcela.amount)}
                  </td>

                  {/* Vencimento */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDate(parcela.dueDate)}</span>
                    </div>
                    {parcela.paidAt && (
                      <span className="block text-[11px] text-emerald-700 mt-0.5">
                        Pago em {formatDate(parcela.paidAt)}
                      </span>
                    )}
                  </td>

                  {/* Situação */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {getStatusBadge(parcela)}
                  </td>

                  {/* Atraso */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {parcela.daysOverdue > 0 ? (
                      <span className="text-rose-700 font-semibold text-xs inline-flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                        <ClockAlert className="w-3 h-3 text-rose-600" />
                        {parcela.daysOverdue} {parcela.daysOverdue === 1 ? 'dia' : 'dias'}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Em dia</span>
                    )}
                  </td>

                  {/* Limite Cancelamento BR-031 */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {parcela.cancellationDeadline ? (
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-800 font-medium">
                          {formatDate(parcela.cancellationDeadline)}
                        </span>
                        {parcela.isPastDeadline ? (
                          <span className="text-[11px] text-rose-700 font-semibold inline-flex items-center gap-1">
                            Prazo expirado
                          </span>
                        ) : parcela.daysOverdue > 0 ? (
                          <span className="text-[11px] text-amber-700 font-medium">
                            Dentro do prazo
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>

                  {/* Ações / Gateway Asaas */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    {hasActions ? (
                      <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                        {parcela.bankSlipUrl && (
                          <a
                            href={parcela.bankSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Visualizar boleto da parcela #${parcela.installmentNumber}`}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-fit text-xs font-medium rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                            title="Boleto bancário"
                          >
                            <FileText className="w-3.5 h-3.5 text-gray-600" />
                            <span className="hidden sm:inline">Boleto</span>
                          </a>
                        )}

                        {parcela.pixQrCodeUrl && (
                          <a
                            href={parcela.pixQrCodeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Visualizar Pix da parcela #${parcela.installmentNumber}`}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-fit text-xs font-medium rounded-lg text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            title="Código ou QR Code Pix"
                          >
                            <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="hidden sm:inline">Pix</span>
                          </a>
                        )}

                        {parcela.invoiceUrl && (
                          <a
                            href={parcela.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir fatura Asaas da parcela #${parcela.installmentNumber}`}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-fit text-xs font-medium rounded-lg text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                            title="Fatura do gateway Asaas"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-primary" />
                            <span className="hidden sm:inline">Fatura</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs" title="Sem link gerado">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ParcelasAcordeao;
