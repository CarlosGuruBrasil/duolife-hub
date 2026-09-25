'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CreditCard,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  FileText,
  RefreshCw,
  Info,
  DollarSign,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatCurrency, formatDate } from '@/lib/format';

export type BillingTypeOption = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';

export interface CobrancaAsaasInitialData {
  valorTotal?: number;
  qtdParcelas?: number;
  dueDate?: string;
  billingType?: BillingTypeOption | string;
  description?: string;
  isAssinado?: boolean;
  existingPayment?: {
    id: string;
    externalId?: string | null;
    status: string;
    amount: number;
    installments: number;
    dueDate: string;
    bankSlipUrl?: string | null;
    invoiceUrl?: string | null;
    billingType?: string | null;
  } | null;
}

interface GerenciarCobrancaAsaasModalProps {
  cotacaoId: string;
  clientName?: string;
  initialData?: CobrancaAsaasInitialData;
  mode?: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GerenciarCobrancaAsaasModal({
  cotacaoId,
  clientName,
  initialData,
  mode = 'create',
  isOpen,
  onClose,
  onSuccess,
}: GerenciarCobrancaAsaasModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [valorTotal, setValorTotal] = useState<string>('0');
  const [qtdParcelas, setQtdParcelas] = useState<number>(1);
  const [dueDate, setDueDate] = useState<string>('');
  const [billingType, setBillingType] = useState<BillingTypeOption>('UNDEFINED');
  const [description, setDescription] = useState<string>('');

  // Impediment & Confirmation state
  const [impedimentReason, setImpedimentReason] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-fill form when opened or initialData changes
  useEffect(() => {
    if (!isOpen) {
      setImpedimentReason(null);
      return;
    }

    const initVal =
      initialData?.existingPayment?.amount ??
      initialData?.valorTotal ??
      0;
    setValorTotal(initVal > 0 ? String(initVal) : '');

    const initParcelas =
      initialData?.existingPayment?.installments ??
      initialData?.qtdParcelas ??
      1;
    setQtdParcelas(Math.max(1, Math.min(12, Number(initParcelas) || 1)));

    const initDue =
      initialData?.existingPayment?.dueDate ??
      initialData?.dueDate ??
      '';
    if (initDue) {
      setDueDate(initDue.slice(0, 10));
    } else {
      // Default to today + 2 days
      const d = new Date();
      d.setDate(d.getDate() + 2);
      setDueDate(d.toISOString().slice(0, 10));
    }

    const rawBt = (initialData?.existingPayment?.billingType || initialData?.billingType || 'UNDEFINED').toUpperCase() as BillingTypeOption;
    setBillingType(['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(rawBt) ? rawBt : 'UNDEFINED');

    setDescription(
      initialData?.description ||
      `Seguro RC Profissional - Proposta #${cotacaoId.slice(0, 8)}`
    );
    setImpedimentReason(null);
  }, [isOpen, initialData, cotacaoId]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  const numValorTotal = parseFloat(valorTotal.replace(',', '.')) || 0;
  const valorParcelaCalc =
    numValorTotal > 0 && qtdParcelas > 0 ? numValorTotal / qtdParcelas : 0;

  async function handleSubmit(e?: React.FormEvent, forceRecreate = false) {
    if (e) e.preventDefault();

    if (numValorTotal <= 0) {
      toast.error('Informe um valor total válido para a cobrança.');
      return;
    }

    if (!dueDate) {
      toast.error('Informe a data de vencimento da cobrança.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'edit' && !forceRecreate) {
        // Tenta atualizar via PATCH
        const res = await fetch(`/api/admin/cotacoes/${cotacaoId}/cobranca`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valorTotal: numValorTotal,
            qtdParcelas,
            dueDate,
            billingType,
            description,
            forceRecreate: false,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (data.requiresRecreate) {
            // Impedimento do Asaas detectado!
            setImpedimentReason(data.reason || 'O Asaas não permitiu alterar esta cobrança diretamente.');
            setLoading(false);
            return;
          }
          throw new Error(data.error || 'Erro ao atualizar cobrança no Asaas.');
        }

        if (data.requiresRecreate) {
          setImpedimentReason(data.reason || 'O Asaas não permitiu alterar esta cobrança diretamente.');
          setLoading(false);
          return;
        }

        toast.success(data.message || 'Cobrança atualizada com sucesso no Asaas!');
        onSuccess();
        onClose();
      } else {
        // Modo 'create' OU 'edit' com forceRecreate = true
        const endpoint =
          mode === 'edit'
            ? `/api/admin/cotacoes/${cotacaoId}/cobranca`
            : `/api/admin/cotacoes/${cotacaoId}/gerar-cobranca`;

        const method = mode === 'edit' ? 'PATCH' : 'POST';

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valorTotal: numValorTotal,
            qtdParcelas,
            dueDate,
            billingType,
            description,
            forceRecreate: forceRecreate || mode === 'edit',
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (data.alreadyExisted && !forceRecreate) {
            setImpedimentReason(
              data.error || 'Já existe uma cobrança gerada para esta cotação no Asaas.'
            );
            setLoading(false);
            return;
          }
          throw new Error(data.error || 'Erro ao processar cobrança no Asaas.');
        }

        toast.success(
          forceRecreate
            ? 'Cobrança anterior cancelada e nova cobrança gerada com sucesso!'
            : 'Cobrança gerada com sucesso no Asaas!'
        );
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao comunicar com o Asaas.');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-bold text-gray-900">
                {mode === 'edit' ? 'Editar Cobrança Asaas' : 'Criar Cobrança Asaas'}
              </h2>
              <p className="text-xs text-gray-500">
                {clientName ? `Cliente: ${clientName}` : `Cotação #${cotacaoId.slice(0, 8)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar modal"
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors cursor-pointer disabled:opacity-50 min-h-[36px] min-w-[36px]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Informações de status do contrato ZapSign */}
          {initialData?.isAssinado ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 flex items-center gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
              <span>
                <strong>Contrato Assinado:</strong> O proponente já assinou o contrato no ZapSign.
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 flex items-start gap-2.5 text-xs text-blue-900">
              <Info size={16} className="text-blue-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Emissão Administrativa (ZapSign Pendente):</strong>
                <span>
                  O contrato ainda não foi assinado pelo proponente, mas como administrador/desenvolvedor você pode emitir a cobrança antecipadamente.
                </span>
              </div>
            </div>
          )}

          {/* Banner de Cobrança Existente */}
          {initialData?.existingPayment && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs space-y-1">
              <div className="flex items-center justify-between text-gray-600 font-medium">
                <span>Cobrança Atual Registrada:</span>
                <span className="font-mono text-[11px] text-gray-700">
                  {initialData.existingPayment.id}
                </span>
              </div>
              <div className="text-gray-800 flex flex-wrap gap-x-4">
                <span>
                  Valor: <strong>{formatCurrency(initialData.existingPayment.amount)}</strong>
                </span>
                <span>
                  Parcelas: <strong>{initialData.existingPayment.installments}x</strong>
                </span>
                <span>
                  Vencimento: <strong>{formatDate(initialData.existingPayment.dueDate)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Diálogo de Impedimento do Asaas / Confirmação de Substituição */}
          {impedimentReason && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3 animate-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-950">
                  <h3 className="font-bold text-sm text-amber-900">
                    Impedimento de Alteração Direta no Asaas
                  </h3>
                  <p className="text-amber-800">{impedimentReason}</p>
                  <p className="mt-2 text-gray-700 font-medium">
                    Para aplicar estas alterações, o sistema irá <strong>cancelar/deletar a cobrança anterior no Asaas</strong> e <strong>emitir uma nova cobrança</strong> com os valores atualizados vinculada a esta mesma cotação.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-200 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImpedimentReason(null)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 transition-colors cursor-pointer min-h-[44px]"
                >
                  Voltar e Revisar
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, true)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Substituindo no Asaas...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      <span>Sim, Cancelar e Gerar Nova Cobrança</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Formulário com os campos configuráveis */}
          <form
            id="cobranca-form"
            onSubmit={(e) => handleSubmit(e, false)}
            className="space-y-4"
          >
            {/* Grid: Valor Total e Parcelas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="input-valor-total"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
                >
                  Valor Total do Prêmio (R$) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-gray-400">
                    R$
                  </span>
                  <input
                    id="input-valor-total"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={valorTotal}
                    onChange={(e) => setValorTotal(e.target.value)}
                    disabled={loading || !!impedimentReason}
                    placeholder="0,00"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all min-h-[44px] disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="select-qtd-parcelas"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
                >
                  Quantidade de Parcelas *
                </label>
                <select
                  id="select-qtd-parcelas"
                  value={qtdParcelas}
                  onChange={(e) => setQtdParcelas(Number(e.target.value))}
                  disabled={loading || !!impedimentReason}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all min-h-[44px] disabled:bg-gray-100"
                >
                  <option value={1}>1x À Vista</option>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                    <option key={num} value={num}>
                      {num}x Parcelas
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Simulação do Parcelamento */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between text-xs text-gray-700">
              <span className="font-medium text-gray-600">Simulação de Pagamento:</span>
              <span className="font-bold text-gray-900">
                {qtdParcelas > 1 ? (
                  <>
                    {qtdParcelas}x de{' '}
                    <span className="text-emerald-700">{formatCurrency(valorParcelaCalc)}</span>
                    <span className="text-gray-400 font-normal">
                      {' '}
                      (Total: {formatCurrency(numValorTotal)})
                    </span>
                  </>
                ) : (
                  <>
                    À Vista em 1x de{' '}
                    <span className="text-emerald-700">{formatCurrency(numValorTotal)}</span>
                  </>
                )}
              </span>
            </div>

            {/* Grid: Data de Vencimento e Forma de Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="input-due-date"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
                >
                  Data de Vencimento *
                </label>
                <div className="relative">
                  <input
                    id="input-due-date"
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={loading || !!impedimentReason}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all min-h-[44px] disabled:bg-gray-100"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Padrão do seguro: vigência + 2 dias úteis.
                </p>
              </div>

              <div>
                <label
                  htmlFor="select-billing-type"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
                >
                  Forma de Cobrança *
                </label>
                <select
                  id="select-billing-type"
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value as BillingTypeOption)}
                  disabled={loading || !!impedimentReason}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all min-h-[44px] disabled:bg-gray-100"
                >
                  <option value="UNDEFINED">Fatura (Cliente escolhe na hora de pagar)</option>
                  <option value="BOLETO">Boleto Bancário (com PIX incluso)</option>
                  <option value="PIX">PIX Direto (Instantâneo)</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  {billingType === 'UNDEFINED' && 'O cliente recebe o link da fatura e escolhe pagar com Cartão de Crédito, Boleto ou Pix.'}
                  {billingType === 'BOLETO' && 'Gera boleto bancário registrado com código de barras e QR Code Pix incluso na fatura.'}
                  {billingType === 'PIX' && 'Gera QR Code Pix instantâneo e chave Copia e Cola para pagamento imediato.'}
                  {billingType === 'CREDIT_CARD' && 'Gera link da fatura para o cliente preencher os dados do cartão de crédito com segurança.'}
                </p>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label
                htmlFor="input-description"
                className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
              >
                Descrição na Fatura Asaas
              </label>
              <input
                id="input-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading || !!impedimentReason}
                placeholder="Ex: Seguro RC Profissional - Plano Completo"
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all min-h-[44px] disabled:bg-gray-100"
              />
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        {!impedimentReason && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="cobranca-form"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50 min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>
                    {mode === 'edit' ? 'Salvando no Asaas...' : 'Emitindo no Asaas...'}
                  </span>
                </>
              ) : (
                <>
                  <CreditCard size={15} />
                  <span>
                    {mode === 'edit'
                      ? 'Salvar Alterações no Asaas'
                      : 'Emitir Cobrança no Asaas'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
