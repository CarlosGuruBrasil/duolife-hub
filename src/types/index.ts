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
  role: 'admin' | 'seller' | 'viewer';
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

export interface Cotacao {
  id: string;
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
  status: 'rascunho' | 'enviada' | 'aprovada' | 'recusada' | 'expirada' | 'emitida';
  valid_until?: string;
  notes?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  cotacao_id: string;
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

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}
