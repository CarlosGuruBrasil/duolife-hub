-- Migração 031: Rascunhos de cotação do fluxo interno (portal/admin) — TD-009
-- Tabela isolada de `cotacoes` de propósito: rascunho não cria cliente, não entra no funil,
-- não dispara gatilhos e não é tocado por webhooks. Expira em 30 dias (purga no cron lifecycle).

CREATE TABLE IF NOT EXISTS cotacao_rascunhos (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,
  partner_id      TEXT REFERENCES partners(id) ON DELETE CASCADE,
  product_id      TEXT,
  step            INT NOT NULL DEFAULT 1,
  client_name     TEXT,
  client_cpf_cnpj TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_cotacao_rascunhos_user_updated ON cotacao_rascunhos (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotacao_rascunhos_expires_at   ON cotacao_rascunhos (expires_at);
