'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  X,
  ArrowRightLeft,
  Building2,
  User,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Info,
  DollarSign,
} from 'lucide-react';

export interface PartnerUserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface PartnerOption {
  id: string;
  name: string;
  razaoSocial: string;
  documento: string;
  status: string;
  isActive: boolean;
  corretoraId: string | null;
  users: PartnerUserOption[];
}

export interface TransferirParceiroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tipo: 'cotacao' | 'cliente';
  targetId: string;
  targetTitle: string; // Ex: "Cotação #c12345" ou "Cliente: João da Silva"
  currentPartner?: {
    id?: string | null;
    name?: string | null;
    userName?: string | null;
    isActive?: boolean;
  };
  totalQuotesCount?: number;
}

export default function TransferirParceiroModal({
  isOpen,
  onClose,
  onSuccess,
  tipo,
  targetId,
  targetTitle,
  currentPartner,
  totalQuotesCount = 1,
}: TransferirParceiroModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Estados de dados
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [motivo, setMotivo] = useState('');

  // Opções de negócio
  const [transferAllQuotes, setTransferAllQuotes] = useState(true);
  const [migrarComissoes, setMigrarComissoes] = useState(false);

  // Estados de submissão e feedback
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Bloqueio de scroll da página quando modal está aberto
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, submitting]);

  // Carrega a lista de parceiros ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    setLoadingPartners(true);
    setErrorMsg(null);

    fetch('/api/admin/parceiros/selecao')
      .then((res) => res.json())
      .then((data) => {
        if (!isSubscribed) return;
        if (data.ok && Array.isArray(data.partners)) {
          setPartners(data.partners);
        } else {
          setErrorMsg(data.error || 'Não foi possível listar os parceiros.');
        }
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setErrorMsg('Falha de conexão ao carregar parceiros.');
      })
      .finally(() => {
        if (isSubscribed) setLoadingPartners(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  // Parceiro selecionado atualmente
  const selectedPartner = useMemo(() => {
    return partners.find((p) => p.id === selectedPartnerId) || null;
  }, [partners, selectedPartnerId]);

  // Filtragem rápida de parceiros na busca
  const filteredPartners = useMemo(() => {
    if (!partnerSearch.trim()) return partners;
    const q = partnerSearch.toLowerCase();
    return partners.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.razaoSocial.toLowerCase().includes(q) ||
        p.documento.includes(q)
      );
    });
  }, [partners, partnerSearch]);

  // Verifica se o parceiro original é detectado como inativo
  const isOriginalPartnerInactive = useMemo(() => {
    if (currentPartner?.isActive === false) return true;
    if (currentPartner?.id && partners.length > 0) {
      const match = partners.find((p) => p.id === currentPartner.id);
      if (match && !match.isActive) return true;
    }
    return false;
  }, [currentPartner, partners]);

  // Atualiza comissão padrão se o original for inativo
  useEffect(() => {
    if (isOriginalPartnerInactive) {
      setMigrarComissoes(true);
    }
  }, [isOriginalPartnerInactive]);

  if (!isOpen || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPartnerId) {
      setErrorMsg('Selecione o novo parceiro de destino.');
      return;
    }

    if (selectedPartnerId === currentPartner?.id && !selectedUserId) {
      setErrorMsg('O destino selecionado é o mesmo parceiro atual.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const url =
        tipo === 'cotacao'
          ? `/api/admin/cotacoes/${targetId}/transferir-parceiro`
          : `/api/admin/clientes/${targetId}/transferir-parceiro`;

      const payload =
        tipo === 'cotacao'
          ? {
              newPartnerId: selectedPartnerId,
              newPartnerUserId: selectedUserId || null,
              migrarComissoes,
              motivo: motivo.trim() || undefined,
            }
          : {
              newPartnerId: selectedPartnerId,
              newPartnerUserId: selectedUserId || null,
              transferAllQuotes,
              migrarComissoes,
              motivo: motivo.trim() || undefined,
            };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao executar a transferência.');
      }

      setSuccessMsg(data.message || 'Transferência realizada com sucesso!');

      setTimeout(() => {
        if (onSuccess) onSuccess();
        router.refresh();
        onClose();
      }, 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao transferir parceiro.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e4a5a]/10 flex items-center justify-center text-[#0e4a5a]">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {tipo === 'cotacao' ? 'Transferir Parceiro da Cotação' : 'Transferir Carteira de Parceiro'}
              </h2>
              <p className="text-xs text-gray-500 line-clamp-1">{targetTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {/* Alertas de Erro e Sucesso */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2.5 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Parceiro Atual */}
          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                Parceiro Atual
              </span>
              <span className="font-semibold text-gray-900">
                {currentPartner?.name || 'Não atribuído ou NET4Life'}
              </span>
              {currentPartner?.userName && (
                <span className="text-xs text-gray-500 block">
                  Corretor: {currentPartner.userName}
                </span>
              )}
            </div>
            {currentPartner?.id && (
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  isOriginalPartnerInactive
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isOriginalPartnerInactive ? 'Inativo no banco' : 'Ativo'}
              </span>
            )}
          </div>

          {/* Seletor do Novo Parceiro */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
              Novo Parceiro (Empresa / Corretor) <span className="text-rose-500">*</span>
            </label>

            {loadingPartners ? (
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-[#0e4a5a]" />
                <span>Carregando parceiros cadastrados...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Pesquisar parceiro por nome ou documento..."
                  value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/30 focus:border-[#0e4a5a]"
                />

                <select
                  value={selectedPartnerId}
                  onChange={(e) => {
                    setSelectedPartnerId(e.target.value);
                    setSelectedUserId('');
                  }}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/30 focus:border-[#0e4a5a] cursor-pointer"
                >
                  <option value="">Selecione o parceiro de destino...</option>
                  {filteredPartners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.documento ? `(${p.documento})` : ''} {!p.isActive ? '[Inativo]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Seletor do Corretor / Usuário do Parceiro Selecionado */}
          {selectedPartner && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                Corretor / Consultor Responsável (Opcional)
              </label>
              {selectedPartner.users && selectedPartner.users.length > 0 ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/30 focus:border-[#0e4a5a] cursor-pointer"
                >
                  <option value="">Sem usuário específico (vincular apenas à empresa)</option>
                  {selectedPartner.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-500 italic p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  Este parceiro não possui usuários ativos vinculados. A transferência será atribuída à empresa parceira.
                </p>
              )}
            </div>
          )}

          {/* Regra de Comissões (Ressalva Aprovada) */}
          <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0e4a5a] uppercase tracking-wider">
              <DollarSign className="w-4 h-4" />
              <span>Regra de Comissões de Vendas</span>
            </div>

            {isOriginalPartnerInactive ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Parceiro original desativado no sistema</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Como o parceiro/vendedor anterior não está mais ativo, as comissões das vendas serão migradas automaticamente para o novo parceiro selecionado.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-gray-600">
                  Por padrão, a comissão de qualquer venda realizada <strong>permanece com o vendedor original</strong>.
                </p>

                <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-gray-800 font-medium pt-1">
                  <input
                    type="checkbox"
                    checked={migrarComissoes}
                    onChange={(e) => setMigrarComissoes(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a] cursor-pointer"
                  />
                  <span>
                    <strong>Migrar também as comissões para o novo parceiro</strong>
                    <span className="block text-[11px] text-gray-500 font-normal">
                      Marque apenas se você (admin/dev) desejar deliberadamente repassar os direitos de comissão desta venda para o novo parceiro.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Opção para Cliente: Transferir todas as cotações */}
          {tipo === 'cliente' && (
            <div className="rounded-xl border border-gray-200 bg-white p-3.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-gray-800 font-medium">
                <input
                  type="checkbox"
                  checked={transferAllQuotes}
                  onChange={(e) => setTransferAllQuotes(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a] cursor-pointer"
                />
                <span>
                  <strong>Transferir todas as cotações da carteira deste cliente ({totalQuotesCount} {totalQuotesCount === 1 ? 'cotação' : 'cotações'})</strong>
                  <span className="block text-[11px] text-gray-500 font-normal">
                    Atualiza a titularidade do cadastro do cliente, todas as suas propostas e leads vinculados.
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Motivo da Transferência (Auditoria) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
              Justificativa / Motivo da Troca (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Cessão de carteira solicitada pelo cliente, correção cadastral..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/30 focus:border-[#0e4a5a]"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedPartnerId}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#0e4a5a] hover:bg-[#072a33] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando transferência...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Confirmar Transferência</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
