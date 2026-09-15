'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalCotacoesFilterBar } from './PortalCotacoesFilterBar';
import { PortalCotacoesAdvancedFilters } from './PortalCotacoesAdvancedFilters';
import { PortalCotacoesActiveBadges } from './PortalCotacoesActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface PortalCotacoesFilterSectionProps {
  products: Option[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function PortalCotacoesFilterSection({
  products,
  statusLabels,
  pageSize,
}: PortalCotacoesFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('status'),
    searchParams.get('productId'),
    searchParams.get('periodPreset') && searchParams.get('periodPreset') !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <PortalCotacoesFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <PortalCotacoesAdvancedFilters
        products={products}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <PortalCotacoesActiveBadges
        products={products}
        statusLabels={statusLabels}
      />
    </div>
  );
}
