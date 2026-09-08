'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { ClientSortField, SortDirection } from '@/types/admin-clients';

interface ClientesSortHeaderProps {
  field: ClientSortField;
  currentSort?: ClientSortField;
  currentDirection?: SortDirection;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function ClientesSortHeader({
  field,
  currentSort,
  currentDirection = 'desc',
  children,
  align = 'left',
  className = '',
}: ClientesSortHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // O padrão do sistema é created_at DESC se nenhum sort for especificado
  const activeSort = currentSort || 'created_at';
  const isActive = activeSort === field;
  const activeDir = isActive ? currentDirection : 'desc';

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (!isActive) {
      params.set('sort', field);
      // Para datas ou contadores, começar em desc costuma ser mais intuitivo,
      // mas para textos (nome, email), asc é natural.
      const defaultDir: SortDirection = ['full_name', 'email', 'partner_names'].includes(field) ? 'asc' : 'desc';
      params.set('direction', defaultDir);
    } else {
      params.set('sort', field);
      params.set('direction', activeDir === 'asc' ? 'desc' : 'asc');
    }

    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const alignmentClass =
    align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';

  return (
    <th
      scope="col"
      className={`px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none ${className}`}
    >
      <button
        type="button"
        onClick={handleSort}
        className={`group inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4e0] rounded-md ${alignmentClass} ${
          isActive ? 'text-[#0e4a5a] font-bold' : 'hover:text-gray-900 text-gray-500'
        }`}
        aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        title={`Ordenar por ${typeof children === 'string' ? children : field}`}
      >
        <span>{children}</span>
        <span className="shrink-0 transition-transform">
          {isActive ? (
            activeDir === 'asc' ? (
              <ArrowUp size={13} className="text-[#0e4a5a] stroke-[2.5]" />
            ) : (
              <ArrowDown size={13} className="text-[#0e4a5a] stroke-[2.5]" />
            )
          ) : (
            <ChevronsUpDown size={13} className="text-gray-400 opacity-60 group-hover:opacity-100 group-hover:text-gray-600" />
          )}
        </span>
      </button>
    </th>
  );
}
