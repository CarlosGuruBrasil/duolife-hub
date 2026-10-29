'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  Clock,
  ArrowRight,
  Layers,
  Check,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { toast } from '@/components/ui/toast';

export interface ModalSincronizarAsaasProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SyncResult {
  totalProcessed: number;
  updatedToPaid: number;
  alreadyPaid: number;
  stillPending: number;
  errors: number;
  durationMs: number;
}

export function ModalSincronizarAsaas({
  isOpen,
  onClose,
  onSuccess,
}: ModalSincronizarAsaasProps) {
  const router = useRouter();
  const [onlyPending, setOnlyPending] = useState(true);
  const [limit, setLimit] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useBodyScrollLock(isOpen);

  // Fecha no ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  // Reseta estado ao abrir
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleStartSync = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync/asaas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          onlyPending,
          limit,
          skipNotifications: true, // Garante que nenhum e-mail seja disparado
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao sincronizar com o Asaas');
      }

      const syncResult: SyncResult = {
        totalProcessed: data.totalProcessed || 0,
        updatedToPaid: data.updatedToPaid || 0,
        alreadyPaid: data.alreadyPaid || 0,
        stillPending: data.stillPending || 0,
        errors: data.errors || 0,
        durationMs: data.durationMs || 0,
      };

      setResult(syncResult);
      toast.success(
        `Sincronização concluída! ${syncResult.updatedToPaid} cotação(ões) atualizada(s) para pago.`
      );
      router.refresh();
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado na sincronização';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-sync-asaas-title"
      aria-describedby="modal-sync-asaas-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-gray-200 bg-white">
          <div className="space-y-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Sincronização Silenciosa
            </div>
            <h2 id="modal-sync-asaas-title" className="text-lg font-bold text-gray-900 truncate">
              Sincronizar Cotações com Asaas
            </h2>
            <p id="modal-sync-asaas-desc" className="text-xs text-gray-500">
              Consulta o gateway financeiro e atualiza ordens, parcelas e status localmente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm text-gray-700">
          {/* Banner de Garantia Sem E-mails */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-xs leading-relaxed">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Sem Notificações Externas</strong>
              Esta sincronização opera em modo estritamente silencioso: nenhuma ação externa (como disparo de e-mails para cliente, corretor ou parceiro) será executada.
            </div>
          </div>

          {!result && !isLoading && (
            <div className="space-y-4">
              {/* Escopo da Sincronização */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-2">
                  Escopo da Consulta
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOnlyPending(true)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer min-h-[44px] ${
                      onlyPending
                        ? 'border-[#0e4a5a] bg-teal-50/30 text-gray-900 ring-1 ring-[#0e4a5a]'
                        : 'border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-gray-900">Apenas Pendentes</span>
                      {onlyPending && <Check className="h-4 w-4 text-[#0e4a5a]" />}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-normal">
                      Cotações aguardando pagamento ou com parcelas em aberto (Recomendado).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnlyPending(false)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer min-h-[44px] ${
                      !onlyPending
                        ? 'border-[#0e4a5a] bg-teal-50/30 text-gray-900 ring-1 ring-[#0e4a5a]'
                        : 'border-gray-200 bg-gray-50/50 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-gray-900">Todas as Cotações</span>
                      {!onlyPending && <Check className="h-4 w-4 text-[#0e4a5a]" />}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-normal">
                      Varredura integral de todas as cotações ativas da tabela.
                    </p>
                  </button>
                </div>
              </div>

              {/* Limite de Lote */}
              <div>
                <label htmlFor="limit-select" className="block text-xs font-bold text-gray-800 mb-1.5">
                  Quantidade Máxima a Processar
                </label>
                <select
                  id="limit-select"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full h-11 px-3 text-xs bg-white border border-gray-300 rounded-xl focus:outline-hidden focus:border-[#0e4a5a] focus:ring-1 focus:ring-[#0e4a5a] cursor-pointer"
                >
                  <option value={25}>25 cotações</option>
                  <option value={50}>50 cotações</option>
                  <option value={100}>100 cotações (Padrão)</option>
                  <option value={200}>200 cotações</option>
                  <option value={500}>500 cotações (Completo)</option>
                </select>
              </div>
            </div>
          )}

          {/* Estado de Carregamento */}
          {isLoading && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="h-8 w-8 text-[#0e4a5a] animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-gray-900">Sincronizando com o Asaas...</p>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Consultando status de cobranças e atualizando o banco de dados. Isso pode levar alguns segundos.
                </p>
              </div>
            </div>
          )}

          {/* Resultado da Sincronização */}
          {result && !isLoading && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
                  <span className="block text-[11px] text-gray-500 font-medium">Processadas</span>
                  <span className="text-lg font-bold text-gray-900">{result.totalProcessed}</span>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <span className="block text-[11px] text-emerald-700 font-medium">Atualizadas (Pago)</span>
                  <span className="text-lg font-bold text-emerald-800">{result.updatedToPaid}</span>
                </div>

                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-center">
                  <span className="block text-[11px] text-sky-700 font-medium">Já Quitadas</span>
                  <span className="text-lg font-bold text-sky-800">{result.alreadyPaid}</span>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <span className="block text-[11px] text-amber-700 font-medium">Ainda Pendentes</span>
                  <span className="text-lg font-bold text-amber-800">{result.stillPending}</span>
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                  <span className="block text-[11px] text-red-700 font-medium">Erros</span>
                  <span className="text-lg font-bold text-red-800">{result.errors}</span>
                </div>

                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
                  <span className="block text-[11px] text-gray-500 font-medium">Tempo Total</span>
                  <span className="text-lg font-bold text-gray-700">
                    {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 text-center">
                Os dados da tabela foram atualizados automaticamente.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-gray-200 bg-gray-50">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStartSync}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0e4a5a] rounded-xl hover:bg-[#072a33] transition-colors shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Sincronizando...' : 'Iniciar Sincronização'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#0e4a5a] rounded-xl hover:bg-[#072a33] transition-colors shadow-xs cursor-pointer min-h-[44px]"
            >
              Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
