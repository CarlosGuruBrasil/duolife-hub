'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VendasFilterBar } from './VendasFilterBar';
import { VendasAdvancedFilters } from './VendasAdvancedFilters';
import { VendasActiveBadges } from './VendasActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface VendasFilterSectionProps {
  products: Option[];
  partners: Option[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function VendasFilterSection({
  products,
  partners,
  statusLabels,
  pageSize,
}: VendasFilterSectionProps) {
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
      <VendasFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <VendasAdvancedFilters
        products={products}
        partners={partners}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <VendasActiveBadges
        products={products}
        partners={partners}
        statusLabels={statusLabels}
      />
    </div>
  );
}
