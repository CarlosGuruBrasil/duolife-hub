'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CotacoesFilterBar } from './CotacoesFilterBar';
import { CotacoesAdvancedFilters } from './CotacoesAdvancedFilters';
import { CotacoesActiveBadges } from './CotacoesActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface CotacoesFilterSectionProps {
  products: Option[];
  partners: Option[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function CotacoesFilterSection({
  products,
  partners,
  statusLabels,
  pageSize,
}: CotacoesFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('status'),
    searchParams.get('productId'),
    searchParams.get('partnerId'),
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
        partners={partners}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <CotacoesActiveBadges
        products={products}
        partners={partners}
        statusLabels={statusLabels}
      />
    </div>
  );
}
