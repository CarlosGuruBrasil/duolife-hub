/**
 * Tipos, Enums e Contratos Estruturados da Camada MCP (Model Context Protocol).
 * DuoLife Hub — Vendas Assistidas por IA.
 */

export type SalesSessionStatus =
  | 'started'
  | 'collecting_data'
  | 'ready_to_quote'
  | 'quoted'
  | 'quote_accepted'
  | 'underwriting_review'
  | 'contract_created'
  | 'awaiting_signature'
  | 'signed'
  | 'awaiting_payment'
  | 'paid'
  | 'policy_issued'
  | 'human_handoff'
  | 'cancelled'
  | 'expired';

export type HandoffReason =
  | 'underwriting_review'
  | 'customer_requested'
  | 'inconsistent_data'
  | 'unsupported_product'
  | 'system_error'
  | 'compliance_review'
  | 'unusual_request';

export type McpScope =
  | 'insurance:catalog:read'
  | 'insurance:quote'
  | 'insurance:sale:create'
  | 'insurance:sale:read'
  | 'insurance:contract:create'
  | 'insurance:payment:read';

export type McpErrorCode =
  | 'INVALID_INPUT'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_STATE_TRANSITION'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_PRODUCT'
  | 'INVALID_PLAN'
  | 'PRICING_FAILED'
  | 'UNDERWRITING_REVIEW_REQUIRED'
  | 'CONTRACT_NOT_READY'
  | 'SIGNATURE_PENDING'
  | 'PAYMENT_NOT_READY'
  | 'HUMAN_HANDOFF_REQUIRED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export interface McpErrorPayload {
  errorCode: McpErrorCode;
  recoverable: boolean;
  message: string;
  details?: Record<string, unknown> | null;
  suggestedAction?: string;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data: McpErrorPayload;
}

export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: McpJsonRpcError;
  id: string | number | null;
}

export interface McpClientAuthContext {
  clientId: string;
  clientName: string;
  scopes: string[];
  rateLimitPerMinute: number;
}

export interface NextStepField {
  field: string;
  label: string;
  type:
    | 'text'
    | 'cpf_cnpj'
    | 'phone'
    | 'email'
    | 'date'
    | 'currency'
    | 'select'
    | 'multiselect'
    | 'boolean'
    | 'textarea';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ key: string; label: string }>;
}

export interface NextStepResponse {
  status: SalesSessionStatus;
  progressPercent: number;
  next: NextStepField | null;
}

export interface QuoteSimulationResult {
  plan: string;
  coverage: string;
  deductible: string;
  originalPrice: number;
  discountPercent: number;
  discountValue: number;
  total: number;
  installments: number;
  installmentValue: number;
  currency: string;
}
