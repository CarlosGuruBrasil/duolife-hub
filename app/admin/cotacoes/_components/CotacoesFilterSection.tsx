'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CotacoesFilterBar } from './CotacoesFilterBar';
import { CotacoesAdvancedFilters, CorretoraOption, PartnerOption } from './CotacoesAdvancedFilters';
import { CotacoesActiveBadges } from './CotacoesActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface CotacoesFilterSectionProps {
  products: Option[];
  corretoras: CorretoraOption[];
  partners: PartnerOption[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function CotacoesFilterSection({
  products,
  corretoras,
  partners,
  statusLabels,
  pageSize,
}: CotacoesFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('status'),
    searchParams.get('productId'),
    searchParams.get('corretoraId'),
    searchParams.get('partnerId'),
    searchParams.get('isRenewal'),
    searchParams.get('periodPreset') && searchParams.get('periodPreset') !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <CotacoesFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <CotacoesAdvancedFilters
        products={products}
        corretoras={corretoras}
        partners={partners}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <CotacoesActiveBadges
        products={products}
        corretoras={corretoras}
        partners={partners}
        statusLabels={statusLabels}
      />
    </div>
  );
}
