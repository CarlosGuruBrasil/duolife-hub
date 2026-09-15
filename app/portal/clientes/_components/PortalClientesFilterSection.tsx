'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalClientesFilterBar } from './PortalClientesFilterBar';
import { PortalClientesAdvancedFilters } from './PortalClientesAdvancedFilters';
import { PortalClientesActiveBadges } from './PortalClientesActiveBadges';
import { PageSizeOption } from '@/types/portal-clients';

interface PortalClientesFilterSectionProps {
  products: Array<{ id: string; name: string; code: string }>;
  pageSize: PageSizeOption;
}

export function PortalClientesFilterSection({
  products,
  pageSize,
}: PortalClientesFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('productId'),
    searchParams.get('signatureStatus'),
    searchParams.get('paymentStatus'),
    searchParams.get('periodPreset') && searchParams.get('periodPreset') !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <PortalClientesFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <PortalClientesAdvancedFilters
        products={products}
        isOpen={isOpenAdvanced}
      />

      <PortalClientesActiveBadges products={products} />
    </div>
  );
}
