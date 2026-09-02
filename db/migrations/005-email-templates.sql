-- Migration: 005-email-templates.sql
-- Módulo de Gerenciamento e Disparo de Templates de E-mail

CREATE TABLE IF NOT EXISTS email_templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  body_text   TEXT,
  variables   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates (code);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates (is_active);

CREATE TABLE IF NOT EXISTS email_dispatch_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_code   TEXT,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'mocked'
  provider        TEXT NOT NULL DEFAULT 'nodemailer_smtp',
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_template ON email_dispatch_logs (template_code);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_created ON email_dispatch_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_status ON email_dispatch_logs (status);
