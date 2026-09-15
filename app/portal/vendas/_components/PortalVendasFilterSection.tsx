'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalVendasFilterBar } from './PortalVendasFilterBar';
import { PortalVendasAdvancedFilters } from './PortalVendasAdvancedFilters';
import { PortalVendasActiveBadges } from './PortalVendasActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface PortalVendasFilterSectionProps {
  products: Option[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function PortalVendasFilterSection({
  products,
  statusLabels,
  pageSize,
}: PortalVendasFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('status'),
    searchParams.get('productId'),
    searchParams.get('periodPreset') && searchParams.get('periodPreset') !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <PortalVendasFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <PortalVendasAdvancedFilters
        products={products}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <PortalVendasActiveBadges
        products={products}
        statusLabels={statusLabels}
      />
    </div>
  );
}
