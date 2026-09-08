'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Filter, RotateCcw } from 'lucide-react';
import { PeriodPreset, QuotesFilterType } from '@/types/admin-clients';

interface Option {
  id: string;
  name: string;
}

interface ClientesAdvancedFiltersProps {
  products: Array<{ id: string; name: string; code: string }>;
  partners: Option[];
  isOpen: boolean;
}

export function ClientesAdvancedFilters({ products, partners, isOpen }: ClientesAdvancedFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Estados locais sincronizados com searchParams
  const [productId, setProductId] = useState(searchParams.get('productId') || '');
  const [quotesFilter, setQuotesFilter] = useState<QuotesFilterType>(
    (searchParams.get('quotesFilter') as QuotesFilterType) || 'all'
  );
  const [quoteStatus, setQuoteStatus] = useState(searchParams.get('quoteStatus') || '');
  const [signatureStatus, setSignatureStatus] = useState(searchParams.get('signatureStatus') || '');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('paymentStatus') || '');
  const [partnerId, setPartnerId] = useState(searchParams.get('partnerId') || '');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(
    (searchParams.get('periodPreset') as PeriodPreset) || 'all'
  );
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');

  // Sincroniza quando a URL mudar externamente
  useEffect(() => {
    setProductId(searchParams.get('productId') || '');
    setQuotesFilter((searchParams.get('quotesFilter') as QuotesFilterType) || 'all');
    setQuoteStatus(searchParams.get('quoteStatus') || '');
    setSignatureStatus(searchParams.get('signatureStatus') || '');
    setPaymentStatus(searchParams.get('paymentStatus') || '');
    setPartnerId(searchParams.get('partnerId') || '');
    setPeriodPreset((searchParams.get('periodPreset') as PeriodPreset) || 'all');
    setStartDate(searchParams.get('startDate') || '');
    setEndDate(searchParams.get('endDate') || '');
  }, [searchParams]);

  if (!isOpen) return null;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const params = new URLSearchParams(searchParams.toString());

    if (productId) params.set('productId', productId);
    else params.delete('productId');

    if (quotesFilter && quotesFilter !== 'all') params.set('quotesFilter', quotesFilter);
    else params.delete('quotesFilter');

    if (quoteStatus) params.set('quoteStatus', quoteStatus);
    else params.delete('quoteStatus');

    if (signatureStatus) params.set('signatureStatus', signatureStatus);
    else params.delete('signatureStatus');

    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    else params.delete('paymentStatus');

    if (partnerId) params.set('partnerId', partnerId);
    else params.delete('partnerId');

    if (periodPreset && periodPreset !== 'all') params.set('periodPreset', periodPreset);
    else params.delete('periodPreset');

    if (periodPreset === 'custom') {
      if (startDate) params.set('startDate', startDate);
      else params.delete('startDate');
      if (endDate) params.set('endDate', endDate);
      else params.delete('endDate');
    } else {
      params.delete('startDate');
      params.delete('endDate');
    }

    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setProductId('');
    setQuotesFilter('all');
    setQuoteStatus('');
    setSignatureStatus('');
    setPaymentStatus('');
    setPartnerId('');
    setPeriodPreset('all');
    setStartDate('');
    setEndDate('');

    const params = new URLSearchParams(searchParams.toString());
    params.delete('productId');
    params.delete('quotesFilter');
    params.delete('quoteStatus');
    params.delete('signatureStatus');
    params.delete('paymentStatus');
    params.delete('partnerId');
    params.delete('periodPreset');
    params.delete('startDate');
    params.delete('endDate');
    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <form
      onSubmit={handleApply}
      className="bg-gray-50/95 backdrop-blur-sm rounded-2xl border border-gray-200/90 p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[#0e4a5a]" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#0e4a5a]">
            Filtros Avançados
          </span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
        >
          <RotateCcw size={12} /> Limpar campos
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Produto */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Produto
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Cotações */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Cotações
          </label>
          <select
            value={quotesFilter}
            onChange={(e) => setQuotesFilter(e.target.value as QuotesFilterType)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="all">Todas</option>
            <option value="with_quotes">Com cotação</option>
            <option value="without_quotes">Sem cotação</option>
            <option value="multiple">2 ou mais cotações</option>
          </select>
        </div>

        {/* 3. Situação da Cotação */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Status Cotação
          </label>
          <select
            value={quoteStatus}
            onChange={(e) => setQuoteStatus(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os status</option>
            <option value="rascunho">Rascunho</option>
            <option value="enviada">Enviada</option>
            <option value="contrato_gerado">Aguard. Assinatura</option>
            <option value="assinado">Assinado</option>
            <option value="pagamento_gerado">Cobrança Gerada</option>
            <option value="aprovada">Aprovada (Venda)</option>
            <option value="recusada">Recusada</option>
            <option value="expirada">Expirada</option>
          </select>
        </div>

        {/* 4. Assinatura ZapSign */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Assinatura
          </label>
          <select
            value={signatureStatus}
            onChange={(e) => setSignatureStatus(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todas as situações</option>
            <option value="signed">Assinado</option>
            <option value="assinado">Assinado (Cotação)</option>
            <option value="pending">Aguardando Assinatura</option>
            <option value="contrato_gerado">Contrato Gerado</option>
            <option value="cancelled">Cancelado</option>
            <option value="refused">Recusado</option>
          </select>
        </div>

        {/* 5. Status Financeiro (Asaas) */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Status Financeiro
          </label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os status</option>
            <option value="paid">Pago / Em dia</option>
            <option value="confirmed">Confirmado</option>
            <option value="received">Recebido</option>
            <option value="partially_paid">Parcialmente Pago</option>
            <option value="pending">Pendente</option>
            <option value="overdue">Vencido</option>
            <option value="refunded">Estornado</option>
          </select>
        </div>

        {/* 6. Parceiro / Corretor */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Parceiro
          </label>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none cursor-pointer"
          >
            <option value="">Todos os parceiros</option>
            {partners.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Linha Secundária: Período de Cadastro */}
      <div className="pt-2 border-t border-gray-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mr-1">
            Cadastro:
          </span>
          {[
            { key: 'all', label: 'Todo o período' },
            { key: 'today', label: 'Hoje' },
            { key: '7d', label: 'Últimos 7 dias' },
            { key: '30d', label: 'Últimos 30 dias' },
            { key: 'this_month', label: 'Este mês' },
            { key: 'custom', label: 'Personalizado' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriodPreset(item.key as PeriodPreset)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                periodPreset === item.key
                  ? 'bg-[#0e4a5a] text-white shadow-2xs'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Data inicial"
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00d4e0]/20"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Data final"
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00d4e0]/20"
            />
          </div>
        )}

        {/* Botão de Submeter Filtros */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0e4a5a] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-[#072a33] transition-colors shadow-xs"
          >
            Aplicar Filtros
          </button>
        </div>
      </div>
    </form>
  );
}
