'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { X } from 'lucide-react';

interface ClientesActiveBadgesProps {
  products: Array<{ id: string; name: string; code: string }>;
  partners: Array<{ id: string; name: string }>;
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguard. assinatura',
  assinado: 'Assinado',
  signed: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  paid: 'Pago',
  confirmed: 'Confirmado',
  received: 'Recebido',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  pending: 'Pendente',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
  refused: 'Recusado',
};

const quotesFilterLabel: Record<string, string> = {
  with_quotes: 'Com cotação',
  without_quotes: 'Sem cotação',
  multiple: '2+ cotações',
};

const periodPresetLabel: Record<string, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
  this_year: 'Este ano',
};

export function ClientesActiveBadges({ products, partners }: ClientesActiveBadgesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const q = searchParams.get('q');
  const productId = searchParams.get('productId');
  const quotesFilter = searchParams.get('quotesFilter');
  const quoteStatus = searchParams.get('quoteStatus');
  const signatureStatus = searchParams.get('signatureStatus');
  const paymentStatus = searchParams.get('paymentStatus');
  const partnerId = searchParams.get('partnerId');
  const periodPreset = searchParams.get('periodPreset');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    if (key === 'periodPreset') {
      params.delete('startDate');
      params.delete('endDate');
    }
    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    const pageSize = params.get('pageSize');
    const sort = params.get('sort');
    const direction = params.get('direction');

    const newParams = new URLSearchParams();
    if (pageSize) newParams.set('pageSize', pageSize);
    if (sort) newParams.set('sort', sort);
    if (direction) newParams.set('direction', direction);

    startTransition(() => {
      const qs = newParams.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    });
  };

  const badges: Array<{ id: string; label: string; onRemove: () => void }> = [];

  if (q) {
    badges.push({
      id: 'q',
      label: `Busca: "${q}"`,
      onRemove: () => removeFilter('q'),
    });
  }

  if (productId) {
    const prod = products.find((p) => p.id === productId);
    badges.push({
      id: 'productId',
      label: `Produto: ${prod ? prod.name : productId}`,
      onRemove: () => removeFilter('productId'),
    });
  }

  if (quotesFilter && quotesFilter !== 'all') {
    badges.push({
      id: 'quotesFilter',
      label: `Cotações: ${quotesFilterLabel[quotesFilter] || quotesFilter}`,
      onRemove: () => removeFilter('quotesFilter'),
    });
  }

  if (quoteStatus) {
    badges.push({
      id: 'quoteStatus',
      label: `Status Cotação: ${statusLabel[quoteStatus] || quoteStatus}`,
      onRemove: () => removeFilter('quoteStatus'),
    });
  }

  if (signatureStatus) {
    badges.push({
      id: 'signatureStatus',
      label: `Assinatura: ${statusLabel[signatureStatus] || signatureStatus}`,
      onRemove: () => removeFilter('signatureStatus'),
    });
  }

  if (paymentStatus) {
    badges.push({
      id: 'paymentStatus',
      label: `Pagamento: ${statusLabel[paymentStatus] || paymentStatus}`,
      onRemove: () => removeFilter('paymentStatus'),
    });
  }

  if (partnerId) {
    const part = partners.find((p) => p.id === partnerId);
    badges.push({
      id: 'partnerId',
      label: `Parceiro: ${part ? part.name : partnerId}`,
      onRemove: () => removeFilter('partnerId'),
    });
  }

  if (periodPreset && periodPreset !== 'all') {
    if (periodPreset === 'custom' && (startDate || endDate)) {
      badges.push({
        id: 'periodPreset',
        label: `Cadastro: ${startDate || 'início'} até ${endDate || 'fim'}`,
        onRemove: () => removeFilter('periodPreset'),
      });
    } else {
      badges.push({
        id: 'periodPreset',
        label: `Cadastro: ${periodPresetLabel[periodPreset] || periodPreset}`,
        onRemove: () => removeFilter('periodPreset'),
      });
    }
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        Filtros ativos:
      </span>

      {badges.map((b) => (
        <span
          key={b.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200/80 transition-colors shadow-2xs"
        >
          <span>{b.label}</span>
          <button
            type="button"
            onClick={b.onRemove}
            className="text-gray-400 hover:text-red-600 rounded-full p-0.5 transition-colors"
            aria-label={`Remover filtro ${b.label}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={clearAllFilters}
        className="text-xs font-bold text-rose-600 hover:text-rose-700 underline underline-offset-2 ml-1 cursor-pointer transition-colors"
      >
        Limpar todos
      </button>
    </div>
  );
}
