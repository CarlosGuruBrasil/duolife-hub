'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  Check,
  ShieldAlert,
  ArrowRight,
  Database,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { toast } from '@/components/ui/toast/toast';
import { useRouter } from 'next/navigation';

export interface CadastralConflictData {
  hasConflict: boolean;
  resolved: boolean;
  resolution?: 'MANTER_ORIGINAL' | 'USAR_NOVOS' | null;
  resolvedAt?: string | null;
  originalClientId: string;
  originalData: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    metadata?: Record<string, unknown>;
  };
  submittedData: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    metadata?: Record<string, unknown>;
  };
  divergentFields: string[];
  detectedAt?: string;
}

interface ModalResolverDuplicidadeProps {
  isOpen: boolean;
  onClose: () => void;
  cotacaoId: string;
  conflict: CadastralConflictData;
  documentNumber: string;
}

export default function ModalResolverDuplicidade({
  isOpen,
  onClose,
  cotacaoId,
  conflict,
  documentNumber,
}: ModalResolverDuplicidadeProps) {
  const router = useRouter();
  const [loadingChoice, setLoadingChoice] = useState<'MANTER_ORIGINAL' | 'USAR_NOVOS' | null>(null);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleResolve = async (choice: 'MANTER_ORIGINAL' | 'USAR_NOVOS') => {
    setLoadingChoice(choice);
    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/resolver-duplicidade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erro ao processar resolução de duplicidade');
        setLoadingChoice(null);
        return;
      }

      toast.success(data.message || 'Decisão cadastral salva com sucesso!');
      onClose();
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao salvar decisão');
      setLoadingChoice(null);
    }
  };

  const isDivergent = (field: string) => conflict.divergentFields?.includes(field);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-amber-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>Resolução Obrigatória de Duplicidade Cadastral</span>
                <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold border border-amber-200">
                  Ação Necessária
                </span>
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                O cliente contratou pelo link público, mas o documento{' '}
                <strong className="font-mono text-gray-800">{documentNumber}</strong> já existia na base de dados.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Comparador */}
        <div className="p-6 space-y-6">
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 leading-relaxed">
            ℹ️ <strong>Regra de Segurança & Conformidade:</strong> Escolha se deseja manter os dados históricos já
            armazenados no banco ou atualizar o cadastro com as novas informações preenchidas pelo cliente.
          </div>

          {/* Grid Comparativo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna 1: Dados Originais no Banco */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4.5 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200 text-gray-700">
                <Database className="w-4 h-4 text-gray-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">1. Cadastro Original no Banco</h4>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-gray-500 block text-[11px]">Nome Completo</span>
                  <span className="font-semibold text-gray-900">{conflict.originalData.fullName || '—'}</span>
                </div>

                <div>
                  <span className="text-gray-500 block text-[11px]">E-mail</span>
                  <span className="font-semibold text-gray-900">{conflict.originalData.email || '—'}</span>
                </div>

                <div>
                  <span className="text-gray-500 block text-[11px]">Telefone / Celular</span>
                  <span className="font-semibold text-gray-900">{conflict.originalData.phone || '—'}</span>
                </div>

                {conflict.originalData.birthDate && (
                  <div>
                    <span className="text-gray-500 block text-[11px]">Data de Nascimento</span>
                    <span className="font-semibold text-gray-900">{conflict.originalData.birthDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 2: Novos Dados do Cliente */}
            <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-4.5 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-amber-200 text-amber-900">
                <UserCheck className="w-4 h-4 text-amber-700" />
                <h4 className="text-xs font-bold uppercase tracking-wider">2. Novos Dados Digitados</h4>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-gray-500 block text-[11px]">Nome Completo</span>
                  <span
                    className={`font-semibold ${
                      isDivergent('nome')
                        ? 'text-amber-900 bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-200 inline-block'
                        : 'text-gray-900'
                    }`}
                  >
                    {conflict.submittedData.fullName || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-500 block text-[11px]">E-mail</span>
                  <span
                    className={`font-semibold ${
                      isDivergent('email')
                        ? 'text-amber-900 bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-200 inline-block'
                        : 'text-gray-900'
                    }`}
                  >
                    {conflict.submittedData.email || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-500 block text-[11px]">Telefone / Celular</span>
                  <span
                    className={`font-semibold ${
                      isDivergent('celular')
                        ? 'text-amber-900 bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-200 inline-block'
                        : 'text-gray-900'
                    }`}
                  >
                    {conflict.submittedData.phone || '—'}
                  </span>
                </div>

                {conflict.submittedData.birthDate && (
                  <div>
                    <span className="text-gray-500 block text-[11px]">Data de Nascimento</span>
                    <span className="font-semibold text-gray-900">{conflict.submittedData.birthDate}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Botões de Escolha */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs px-4 py-2.5 w-full sm:w-auto"
            disabled={loadingChoice !== null}
          >
            Cancelar
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleResolve('MANTER_ORIGINAL')}
              disabled={loadingChoice !== null}
              className="btn btn-secondary text-xs px-4 py-2.5 w-full sm:w-auto font-bold border-gray-300 text-gray-800 hover:bg-gray-100 cursor-pointer"
            >
              {loadingChoice === 'MANTER_ORIGINAL' ? (
                'Processando...'
              ) : (
                '1. Manter Cadastro Original do Banco'
              )}
            </button>

            <button
              type="button"
              onClick={() => handleResolve('USAR_NOVOS')}
              disabled={loadingChoice !== null}
              className="btn btn-primary text-xs px-5 py-2.5 w-full sm:w-auto font-bold shadow-sm cursor-pointer"
            >
              {loadingChoice === 'USAR_NOVOS' ? (
                'Processando...'
              ) : (
                '2. Atualizar Base com Novos Dados'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
