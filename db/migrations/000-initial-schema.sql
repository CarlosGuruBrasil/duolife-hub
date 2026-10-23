-- ============================================================================
-- Migração 000: Schema Inicial Base do DuoLife Hub
-- ============================================================================
-- Criação de todas as tabelas e índices fundamentais anteriores à trilha 001+.
-- 100% idempotente (CREATE TABLE/INDEX IF NOT EXISTS e ON CONFLICT DO NOTHING),
-- garantindo que:
-- 1. Novos ambientes e testes de disaster recovery subam do zero sem quebrar no 001.
-- 2. Ambientes existentes (onde 001..024 já rodaram) apliquem esta migração sem impacto.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Configurações do Sistema e Chaves de Integração
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Usuários Administrativos Internos
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Parceiros Comerciais (Corretores / Canais)
CREATE TABLE IF NOT EXISTS partners (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj          TEXT UNIQUE,
  email         TEXT NOT NULL,
  phone         TEXT,
  address       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS partners_email_key ON partners (email);

-- 4. Usuários Vinculados a Parceiros
CREATE TABLE IF NOT EXISTS partner_users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'broker',
  manager_user_id TEXT,
  permissions     JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS partner_users_partner_id ON partner_users (partner_id);

-- 5. API Tokens Machine-to-Machine
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id   TEXT NOT NULL REFERENCES partners(id),
  name         TEXT NOT NULL,
  token_hash   TEXT UNIQUE NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Refresh Tokens de Sessão
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_user_id TEXT NOT NULL,
  token_hash      TEXT UNIQUE NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_partner_user_id ON refresh_tokens(partner_user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- 7. Tokens para Recuperação de Senha
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL,
  user_type  TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Catálogo Base de Produtos
CREATE TABLE IF NOT EXISTS products (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                 TEXT NOT NULL,
  code                 TEXT UNIQUE NOT NULL,
  category             TEXT NOT NULL,
  insurer_name         TEXT,
  insurer_cnpj         TEXT,
  description          TEXT,
  base_commission_rate NUMERIC(5,2),
  min_premium          NUMERIC(12,2),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Réplicas e Cache do Wix
CREATE TABLE IF NOT EXISTS wix_collections (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  collection_id   TEXT UNIQUE NOT NULL,
  collection_name TEXT NOT NULL,
  source_system   TEXT NOT NULL DEFAULT 'wix',
  last_synced_at  TIMESTAMPTZ,
  sync_cursor     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wix_items (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wix_collection_id TEXT NOT NULL REFERENCES wix_collections(id),
  wix_item_id       TEXT NOT NULL,
  external_id       TEXT,
  document_number   TEXT,
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  status            TEXT,
  partner_code      TEXT,
  payload           JSONB NOT NULL DEFAULT '{}',
  payload_hash      TEXT,
  wix_created_at    TIMESTAMPTZ,
  wix_updated_at    TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wix_collection_id, wix_item_id)
);
CREATE INDEX IF NOT EXISTS wix_items_collection_id ON wix_items (wix_collection_id);
CREATE INDEX IF NOT EXISTS wix_items_document_number ON wix_items (document_number);
CREATE INDEX IF NOT EXISTS wix_items_external_id ON wix_items (external_id);
CREATE INDEX IF NOT EXISTS wix_items_partner_code ON wix_items (partner_code);

-- 10. Grade de Comissionamento por Parceiro
CREATE TABLE IF NOT EXISTS partner_commission_rates (
  partner_id  TEXT NOT NULL REFERENCES partners(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  rate        NUMERIC(5,2) NOT NULL,
  valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  PRIMARY KEY (partner_id, product_id, valid_from)
);

-- 11. Leads Operacionais
CREATE TABLE IF NOT EXISTS leads (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id       TEXT REFERENCES partners(id),
  external_id      TEXT,
  document_number  TEXT,
  nome             TEXT,
  email            TEXT,
  telefone         TEXT,
  origem           TEXT,
  status           TEXT NOT NULL DEFAULT 'novo',
  product_id       TEXT REFERENCES products(id),
  score            INTEGER,
  temperatura      TEXT,
  data_cadastro    TIMESTAMPTZ,
  data_atualizacao TIMESTAMPTZ,
  raw              JSONB NOT NULL DEFAULT '{}',
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_system    TEXT NOT NULL DEFAULT 'duolife'
);
CREATE INDEX IF NOT EXISTS leads_partner_id    ON leads (partner_id);
CREATE INDEX IF NOT EXISTS leads_data_cadastro ON leads (data_cadastro DESC);
CREATE INDEX IF NOT EXISTS leads_external_id   ON leads (external_id);
CREATE INDEX IF NOT EXISTS leads_document_number ON leads (document_number);

-- 12. Clientes Segurados Finais
CREATE TABLE IF NOT EXISTS insurance_clients (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_number TEXT NOT NULL,
  document_type   TEXT NOT NULL DEFAULT 'cpf',
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  birth_date      DATE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_number)
);
CREATE INDEX IF NOT EXISTS insurance_clients_email ON insurance_clients (email);

-- 13. Cotações e Propostas
CREATE TABLE IF NOT EXISTS cotacoes (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id            TEXT REFERENCES insurance_clients(id),
  partner_id           TEXT NOT NULL REFERENCES partners(id),
  partner_user_id      TEXT REFERENCES partner_users(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  lead_id              TEXT REFERENCES leads(id),
  client_name          TEXT NOT NULL,
  client_cpf_cnpj      TEXT NOT NULL,
  client_email         TEXT,
  client_phone         TEXT,
  client_data          JSONB NOT NULL DEFAULT '{}',
  importancia_segurada NUMERIC(12,2),
  premio_calculado     NUMERIC(12,2),
  premio_final         NUMERIC(12,2),
  status               TEXT NOT NULL DEFAULT 'rascunho',
  flow_type            TEXT NOT NULL DEFAULT 'internal',
  source_token         TEXT,
  external_ref         TEXT,
  valid_until          DATE,
  notes                TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cotacoes_partner_id   ON cotacoes (partner_id);
CREATE INDEX IF NOT EXISTS cotacoes_status       ON cotacoes (status);
CREATE INDEX IF NOT EXISTS cotacoes_source_token ON cotacoes (source_token);
CREATE INDEX IF NOT EXISTS cotacoes_client_id    ON cotacoes (client_id);

-- 14. Vendas / Apólices Emitidas
CREATE TABLE IF NOT EXISTS sales (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cotacao_id           TEXT NOT NULL REFERENCES cotacoes(id),
  client_id            TEXT REFERENCES insurance_clients(id),
  partner_id           TEXT NOT NULL REFERENCES partners(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  policy_number        TEXT UNIQUE,
  importancia_segurada NUMERIC(12,2),
  premio_total         NUMERIC(12,2),
  commission_rate      NUMERIC(5,2),
  commission_amount    NUMERIC(12,2),
  status               TEXT NOT NULL DEFAULT 'ativa',
  issue_date           DATE NOT NULL,
  expiry_date          DATE NOT NULL,
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_partner_id ON sales (partner_id);
CREATE INDEX IF NOT EXISTS sales_client_id  ON sales (client_id);

-- 15. Comissões a Pagar
CREATE TABLE IF NOT EXISTS commissions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sale_id         TEXT NOT NULL REFERENCES sales(id),
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  amount          NUMERIC(12,2) NOT NULL,
  rate            NUMERIC(5,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente',
  reference_month TEXT,
  payment_date    DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Log de Sincronização
CREATE TABLE IF NOT EXISTS sync_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  source_system TEXT NOT NULL,
  direction     TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sync_log_entity  ON sync_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sync_log_created ON sync_log (created_at DESC);

-- 17. Links Públicos de Auto-Contratação
CREATE TABLE IF NOT EXISTS public_sale_links (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token              TEXT UNIQUE NOT NULL,
  partner_id         TEXT NOT NULL REFERENCES partners(id),
  product_id         TEXT REFERENCES products(id),
  flow_type          TEXT NOT NULL DEFAULT 'external',
  label              TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  expires_at         TIMESTAMPTZ,
  used_at            TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS public_sale_links_partner_id ON public_sale_links (partner_id);
CREATE INDEX IF NOT EXISTS public_sale_links_token      ON public_sale_links (token);

-- 18. Documentos de Assinatura Eletrônica (ZapSign)
CREATE TABLE IF NOT EXISTS signature_documents (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cotacao_id            TEXT NOT NULL REFERENCES cotacoes(id),
  client_id             TEXT REFERENCES insurance_clients(id),
  provider              TEXT NOT NULL DEFAULT 'zapsign',
  external_document_id  TEXT,
  template_id           TEXT,
  sign_url              TEXT,
  signed_file_url       TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
  signed_at             TIMESTAMPTZ,
  last_event_type       TEXT,
  raw_payload           JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_document_id)
);
CREATE INDEX IF NOT EXISTS signature_documents_cotacao_id ON signature_documents (cotacao_id);
CREATE INDEX IF NOT EXISTS signature_documents_client_id  ON signature_documents (client_id);

-- 19. Controle Atômico de Uso de Cupons
CREATE TABLE IF NOT EXISTS cupom_usos (
  cupom_codigo TEXT PRIMARY KEY,
  usos         INTEGER NOT NULL DEFAULT 0,
  limite       INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cupom_uso_eventos (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cupom_codigo TEXT NOT NULL,
  cotacao_id   TEXT NOT NULL UNIQUE REFERENCES cotacoes(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Ordens de Pagamento (Asaas)
CREATE TABLE IF NOT EXISTS payment_orders (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cotacao_id              TEXT NOT NULL REFERENCES cotacoes(id),
  client_id               TEXT REFERENCES insurance_clients(id),
  partner_id              TEXT NOT NULL REFERENCES partners(id),
  product_id              TEXT NOT NULL REFERENCES products(id),
  provider                TEXT NOT NULL DEFAULT 'asaas',
  provider_customer_id    TEXT,
  external_payment_id     TEXT,
  external_installment_id TEXT,
  billing_type            TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  amount_total            NUMERIC(12,2),
  installment_count       INTEGER NOT NULL DEFAULT 1,
  paid_installments       INTEGER NOT NULL DEFAULT 0,
  paid_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date                DATE,
  invoice_url             TEXT,
  bank_slip_url           TEXT,
  pix_qr_code_url         TEXT,
  description             TEXT,
  raw_payload             JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_orders_cotacao_id              ON payment_orders (cotacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_unique_cotacao   ON payment_orders (cotacao_id);
CREATE INDEX IF NOT EXISTS payment_orders_client_id               ON payment_orders (client_id);
CREATE INDEX IF NOT EXISTS payment_orders_external_payment_id     ON payment_orders (external_payment_id);
CREATE INDEX IF NOT EXISTS payment_orders_external_installment_id ON payment_orders (external_installment_id);

-- 21. Parcelas de Pagamento
CREATE TABLE IF NOT EXISTS payment_installments (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_order_id        TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  cotacao_id              TEXT NOT NULL REFERENCES cotacoes(id),
  client_id               TEXT REFERENCES insurance_clients(id),
  provider                TEXT NOT NULL DEFAULT 'asaas',
  external_payment_id     TEXT NOT NULL,
  external_installment_id TEXT,
  installment_number      INTEGER NOT NULL DEFAULT 1,
  status                  TEXT NOT NULL DEFAULT 'pending',
  billing_type            TEXT,
  amount                  NUMERIC(12,2),
  net_amount              NUMERIC(12,2),
  due_date                DATE,
  paid_at                 TIMESTAMPTZ,
  invoice_url             TEXT,
  bank_slip_url           TEXT,
  pix_qr_code_url         TEXT,
  raw_payload             JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_payment_id)
);
CREATE INDEX IF NOT EXISTS payment_installments_order_id ON payment_installments (payment_order_id);
CREATE INDEX IF NOT EXISTS payment_installments_cotacao_id ON payment_installments (cotacao_id);
CREATE INDEX IF NOT EXISTS payment_installments_client_id ON payment_installments (client_id);
CREATE INDEX IF NOT EXISTS payment_installments_external_installment_id ON payment_installments (external_installment_id);

-- 22. Trilhas de Webhook de Entrada
CREATE TABLE IF NOT EXISTS webhook_events (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider        TEXT NOT NULL,
  event_type      TEXT,
  external_id     TEXT,
  signature_valid BOOLEAN,
  payload         JSONB NOT NULL DEFAULT '{}',
  processed       BOOLEAN NOT NULL DEFAULT false,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webhook_events_provider_created_at ON webhook_events (provider, created_at DESC);

-- ============================================================================
-- Seeds Iniciais Fundamentais (Idempotentes)
-- ============================================================================

-- Produto Base RC-001 (necessário para a migração 001 poder aplicar ALTER/UPDATE)
INSERT INTO products (
  id,
  name,
  code,
  category,
  insurer_name,
  is_active
)
VALUES (
  'prod-rc-001',
  'RC Profissional — Advogados & Escritórios',
  'RC-001',
  'Responsabilidade Civil',
  'KEV Seguros',
  true
)
ON CONFLICT (code) DO NOTHING;

-- Usuários Administradores Iniciais
INSERT INTO admin_users (id, name, email, password_hash, role, is_active)
VALUES (
  'user_admin_duolife_master',
  'Admin DuoLife',
  'carlos@guru.dev.br',
  '$2a$10$6mCsz4rD1bQpLqXQx6VjOe7kY0U7d4gK6H1Z5K7X0K4w8v2Q4s8Ye',
  'duolife_admin',
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO admin_users (id, name, email, password_hash, role, is_active)
VALUES (
  'user_admin_carlosad',
  'Carlos Eduardo',
  'carlosad1981@gmail.com',
  '$2a$10$6mCsz4rD1bQpLqXQx6VjOe7kY0U7d4gK6H1Z5K7X0K4w8v2Q4s8Ye',
  'duolife_dev',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Parceiro Master Inicial
INSERT INTO partners (id, razao_social, nome_fantasia, email, status)
VALUES (
  'partner_duolife_master',
  'DuoLife Hub Seguros',
  'DuoLife',
  'contato@duolife.com.br',
  'active'
)
ON CONFLICT (id) DO NOTHING;
