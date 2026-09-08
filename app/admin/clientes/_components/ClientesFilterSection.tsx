'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClientesFilterBar } from './ClientesFilterBar';
import { ClientesAdvancedFilters } from './ClientesAdvancedFilters';
import { ClientesActiveBadges } from './ClientesActiveBadges';
import { PageSizeOption } from '@/types/admin-clients';

interface ClientesFilterSectionProps {
  products: Array<{ id: string; name: string; code: string }>;
  partners: Array<{ id: string; name: string }>;
  pageSize: PageSizeOption;
}

export function ClientesFilterSection({
  products,
  partners,
  pageSize,
}: ClientesFilterSectionProps) {
  const searchParams = useSearchParams();
  const [isOpenAdvanced, setIsOpenAdvanced] = useState(false);

  const activeFiltersCount = [
    searchParams.get('productId'),
    searchParams.get('quotesFilter') && searchParams.get('quotesFilter') !== 'all',
    searchParams.get('quoteStatus'),
    searchParams.get('signatureStatus'),
    searchParams.get('paymentStatus'),
    searchParams.get('partnerId'),
    searchParams.get('periodPreset') && searchParams.get('periodPreset') !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <ClientesFilterBar
        activeFiltersCount={activeFiltersCount}
        isOpenAdvanced={isOpenAdvanced}
        onToggleAdvanced={() => setIsOpenAdvanced((prev) => !prev)}
        pageSize={pageSize}
      />

      <ClientesAdvancedFilters
        products={products}
        partners={partners}
        isOpen={isOpenAdvanced}
      />

      <ClientesActiveBadges products={products} partners={partners} />
    </div>
  );
}
