export interface Partner {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  email: string;
  phone?: string;
  address: Record<string, string>;
  status: 'pending' | 'active' | 'suspended' | 'inactive';
  created_at: string;
}

export interface PartnerUser {
  id: string;
  partner_id: string;
  name: string;
  email: string;
  role: 'director' | 'manager' | 'broker' | 'partner';
  manager_user_id?: string | null;
  is_active: boolean;
  last_login_at?: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  insurer_name: string;
  description?: string;
  base_commission_rate: number;
  is_active: boolean;
}

export interface Lead {
  id: string;
  partner_id?: string;
  external_id?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  origem?: string;
  status: string;
  score?: number;
  temperatura?: string;
  data_cadastro?: string;
  source_system: string;
}

export interface InsuranceClient {
  id: string;
  document_number: string;
  document_type: 'cpf' | 'cnpj';
  full_name: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Cotacao {
  id: string;
  client_id?: string;
  partner_id: string;
  partner_user_id: string;
  product_id: string;
  lead_id?: string;
  client_name: string;
  client_cpf_cnpj: string;
  client_email?: string;
  client_phone?: string;
  importancia_segurada?: number;
  premio_calculado?: number;
  premio_final?: number;
  status: 'rascunho' | 'enviada' | 'contrato_gerado' | 'assinado' | 'pagamento_gerado' | 'aprovada' | 'recusada' | 'expirada' | 'emitida';
  valid_until?: string;
  notes?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  cotacao_id: string;
  client_id?: string;
  partner_id: string;
  product_id: string;
  policy_number?: string;
  importancia_segurada?: number;
  premio_total?: number;
  commission_rate?: number;
  commission_amount?: number;
  status: 'ativa' | 'cancelada' | 'expirada' | 'suspensa';
  issue_date: string;
  expiry_date: string;
  created_at: string;
}

export interface Commission {
  id: string;
  sale_id: string;
  partner_id: string;
  amount: number;
  rate: number;
  status: 'pendente' | 'aprovada' | 'paga' | 'estornada';
  reference_month?: string;
  payment_date?: string;
  created_at: string;
}

export interface PaymentOrder {
  id: string;
  cotacao_id: string;
  client_id?: string;
  partner_id: string;
  product_id: string;
  provider: string;
  provider_customer_id?: string;
  external_payment_id?: string;
  external_installment_id?: string;
  billing_type?: string;
  status: string;
  amount_total?: number;
  installment_count: number;
  paid_installments: number;
  paid_amount: number;
  due_date?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  description?: string;
}

export interface PaymentInstallment {
  id: string;
  payment_order_id: string;
  cotacao_id: string;
  client_id?: string;
  provider: string;
  external_payment_id: string;
  external_installment_id?: string;
  installment_number: number;
  status: string;
  billing_type?: string;
  amount?: number;
  net_amount?: number;
  due_date?: string;
  paid_at?: string;
  invoice_url?: string;
  bank_slip_url?: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}
