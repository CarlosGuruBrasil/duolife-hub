-- Migração 019: Adiciona campos de retry e headers na tabela webhook_events
-- Permite auditoria completa e reprocessamento com rastreabilidade de tentativas.

ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_retried_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS request_headers JSONB;

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events (processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events (created_at DESC);
