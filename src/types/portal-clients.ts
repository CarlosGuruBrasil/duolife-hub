import { PageSizeOption, PeriodPreset, SortDirection } from './admin-clients';

export type { PageSizeOption, PeriodPreset, SortDirection };

export type PortalClientSortField =
  | 'created_at'
  | 'full_name'
  | 'document_number'
  | 'email'
  | 'phone'
  | 'products_count'
  | 'cotacoes_count'
  | 'paid_installments'
  | 'last_payment_status'
  | 'last_quote_status'
  | 'last_signature_status'
  | 'updated_at';

export interface PortalClientsFilterParams {
  page?: number;
  pageSize?: PageSizeOption;
  sort?: PortalClientSortField;
  direction?: SortDirection;
  q?: string;
  productId?: string;
  signatureStatus?: string;
  paymentStatus?: string;
  periodPreset?: PeriodPreset;
  startDate?: string;
  endDate?: string;
}

export interface PortalClientRow {
  id: string;
  full_name: string;
  document_number: string;
  email: string | null;
  phone: string | null;
  products_count: number;
  cotacoes_count: number;
  last_quote_status: string | null;
  last_signature_status: string | null;
  last_payment_status: string | null;
  paid_installments: number;
  total_installments: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedPortalClientsResult {
  items: PortalClientRow[];
  pagination: {
    page: number;
    pageSize: PageSizeOption;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {
    availableProducts: Array<{ id: string; name: string; code: string }>;
  };
}
