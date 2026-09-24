'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VendasFilterBar } from './VendasFilterBar';
import { VendasAdvancedFilters, CorretoraOption, PartnerOption } from './VendasAdvancedFilters';
import { VendasActiveBadges } from './VendasActiveBadges';

interface Option {
  id: string;
  name: string;
}

interface VendasFilterSectionProps {
  products: Option[];
  corretoras: CorretoraOption[];
  partners: PartnerOption[];
  statusLabels: Record<string, string>;
  pageSize: number;
}

export function VendasFilterSection({
  products,
  corretoras,
  partners,
  statusLabels,
  pageSize,
}: VendasFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('status'),
    searchParams.get('productId'),
    searchParams.get('corretoraId'),
    searchParams.get('partnerId'),
    searchParams.get('isRenewal'),
    searchParams.get('periodPreset') === 'custom' || searchParams.get('startDate') || searchParams.get('endDate'),
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <VendasFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        onOpenAdvanced={() => setIsOpenAdvanced(true)}
        pageSize={pageSize}
      />

      <VendasAdvancedFilters
        products={products}
        corretoras={corretoras}
        partners={partners}
        statusLabels={statusLabels}
        isOpen={isOpenAdvanced}
      />

      <VendasActiveBadges
        products={products}
        corretoras={corretoras}
        partners={partners}
        statusLabels={statusLabels}
      />
    </div>
  );
}
