-- Migration: 010-email-template-sync.sql
-- Suporte à sincronização bidirecional de templates com a API Net4Life Info / FluxoSend

ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT NULL;

ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_external_id ON email_templates (external_id);
