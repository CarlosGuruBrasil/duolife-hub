-- Migração 022: Criação da infraestrutura de tabelas para a Camada MCP (Model Context Protocol)

-- 1. Tabela de Chaves de API MCP (Autenticação Server-to-Server com Scopes)
CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INT NOT NULL DEFAULT 120,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_hash ON mcp_api_keys (key_hash) WHERE is_active = true;

-- 2. Tabela de Sessões Comerciais Assistidas por IA (AI Sales Sessions)
CREATE TABLE IF NOT EXISTS ai_sales_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  external_conversation_id TEXT NOT NULL,
  external_customer_id TEXT,
  phone TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  flow_key TEXT NOT NULL DEFAULT 'rc_professional_v1',
  status TEXT NOT NULL DEFAULT 'started',
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  cotacao_id TEXT REFERENCES cotacoes(id),
  signature_document_id TEXT REFERENCES signature_documents(id),
  payment_order_id TEXT REFERENCES payment_orders(id),
  sale_id TEXT REFERENCES sales(id),
  human_handoff_required BOOLEAN NOT NULL DEFAULT false,
  human_handoff_reason TEXT,
  human_handoff_notes TEXT,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único condicional para idempotência de conversas ativas no canal
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_sales_sessions_active_convo
  ON ai_sales_sessions (channel, external_conversation_id)
  WHERE status NOT IN ('cancelled', 'expired', 'policy_issued');

CREATE INDEX IF NOT EXISTS idx_ai_sales_sessions_phone ON ai_sales_sessions (phone);
CREATE INDEX IF NOT EXISTS idx_ai_sales_sessions_status ON ai_sales_sessions (status);
CREATE INDEX IF NOT EXISTS idx_ai_sales_sessions_cotacao_id ON ai_sales_sessions (cotacao_id);

-- 3. Tabela de Auditoria de Invocações MCP (mcp_audit_logs)
CREATE TABLE IF NOT EXISTS mcp_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id TEXT NOT NULL,
  client_id TEXT REFERENCES mcp_api_keys(id),
  tool TEXT NOT NULL,
  sale_session_id TEXT REFERENCES ai_sales_sessions(id) ON DELETE SET NULL,
  result_status TEXT NOT NULL,
  error_code TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  input_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_logs_session ON mcp_audit_logs (sale_session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_logs_tool ON mcp_audit_logs (tool);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_logs_created_at ON mcp_audit_logs (created_at DESC);
