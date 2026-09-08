export type PageSizeOption = 10 | 20 | 50 | 100;

export type ClientSortField =
  | 'created_at'
  | 'full_name'
  | 'document_number'
  | 'email'
  | 'phone'
  | 'partner_names'
  | 'products_count'
  | 'cotacoes_count'
  | 'paid_installments'
  | 'last_payment_status'
  | 'last_quote_status'
  | 'last_signature_status'
  | 'updated_at';

export type SortDirection = 'asc' | 'desc';

export type PeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export type QuotesFilterType = 'all' | 'with_quotes' | 'without_quotes' | 'multiple';

export interface AdminClientsFilterParams {
  page?: number;
  pageSize?: PageSizeOption;
  sort?: ClientSortField;
  direction?: SortDirection;
  q?: string;
  productId?: string;
  quotesFilter?: QuotesFilterType;
  quoteStatus?: string;
  signatureStatus?: string;
  paymentStatus?: string;
  partnerId?: string;
  periodPreset?: PeriodPreset;
  startDate?: string;
  endDate?: string;
}

export interface AdminClientRow {
  id: string;
  full_name: string;
  document_number: string;
  email: string | null;
  phone: string | null;
  partner_names: string | null;
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

export interface PaginatedClientsResult {
  items: AdminClientRow[];
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
    availablePartners: Array<{ id: string; name: string }>;
  };
}
