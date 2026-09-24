'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { DATE_PRESET_OPTIONS, formatDateBR, PeriodPreset } from '@/lib/date-filters';

interface Option {
  id: string;
  name: string;
}

interface VendasActiveBadgesProps {
  products: Option[];
  corretoras: Option[];
  partners: Option[];
  statusLabels: Record<string, string>;
}

export function VendasActiveBadges({
  products,
  corretoras,
  partners,
  statusLabels,
}: VendasActiveBadgesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const q = searchParams.get('q');
  const status = searchParams.get('status');
  const productId = searchParams.get('productId');
  const corretoraId = searchParams.get('corretoraId');
  const partnerId = searchParams.get('partnerId');
  const isRenewal = searchParams.get('isRenewal');
  const periodPreset = searchParams.get('periodPreset');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const removeParam = (keys: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    keys.forEach((k) => params.delete(k));
    params.set('page', '1');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const badges = [];

  if (q) {
    badges.push({
      label: `Busca: "${q}"`,
      onRemove: () => {
        const input = document.querySelector('input[placeholder*="Buscar por cliente"]') as HTMLInputElement;
        if (input) input.value = '';
        removeParam(['q']);
      },
    });
  }

  if (status && statusLabels[status]) {
    badges.push({
      label: `Status: ${statusLabels[status]}`,
      onRemove: () => removeParam(['status']),
    });
  }

  if (productId) {
    const prod = products.find((p) => p.id === productId);
    badges.push({
      label: `Produto: ${prod ? prod.name : 'Selecionado'}`,
      onRemove: () => removeParam(['productId']),
    });
  }

  if (corretoraId) {
    const corr = corretoras.find((c) => c.id === corretoraId);
    badges.push({
      label: `Corretora: ${corr ? corr.name : 'Selecionada'}`,
      onRemove: () => removeParam(['corretoraId']),
    });
  }

  if (partnerId) {
    const part = partners.find((p) => p.id === partnerId);
    badges.push({
      label: `Vendedor: ${part ? part.name : 'Selecionado'}`,
      onRemove: () => removeParam(['partnerId']),
    });
  }

  if (isRenewal) {
    badges.push({
      label: isRenewal === 'true' || isRenewal === 'sim' ? 'Renovação: Sim' : 'Renovação: Não (Nova Venda)',
      onRemove: () => removeParam(['isRenewal']),
    });
  }

  const rawPeriodPreset = searchParams.get('periodPreset');
  const effectivePreset: PeriodPreset =
    (rawPeriodPreset as PeriodPreset) || (startDate || endDate ? 'custom' : '30d');

  if (effectivePreset !== 'all') {
    if (effectivePreset === 'custom') {
      let dateLabel = 'Período: Personalizado';
      if (startDate && endDate) {
        dateLabel = `Período: ${formatDateBR(startDate)} até ${formatDateBR(endDate)}`;
      } else if (startDate) {
        dateLabel = `Período: A partir de ${formatDateBR(startDate)}`;
      } else if (endDate) {
        dateLabel = `Período: Até ${formatDateBR(endDate)}`;
      }
      badges.push({
        label: dateLabel,
        onRemove: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('periodPreset', 'all');
          params.delete('startDate');
          params.delete('endDate');
          params.set('page', '1');
          startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          });
        },
      });
    } else {
      const preset = DATE_PRESET_OPTIONS.find((o) => o.value === effectivePreset);
      badges.push({
        label: `Período: ${preset ? preset.label : effectivePreset}`,
        onRemove: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('periodPreset', 'all');
          params.delete('startDate');
          params.delete('endDate');
          params.set('page', '1');
          startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          });
        },
      });
    }
  } else if (rawPeriodPreset === 'all') {
    badges.push({
      label: 'Período: Todo o histórico',
      onRemove: () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('periodPreset');
        params.delete('startDate');
        params.delete('endDate');
        params.set('page', '1');
        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
      },
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs font-semibold text-gray-500">Filtros ativos:</span>
      {badges.map((b, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs"
        >
          <span>{b.label}</span>
          <button
            type="button"
            onClick={b.onRemove}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 cursor-pointer transition-colors"
            title="Remover filtro"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
