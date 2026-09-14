-- Migration: 011-lifecycle-renewal-and-retention.sql
-- Régua Automatizada de Renovação e Retenção (Lifecycle do Segurado)
-- Rastreamento de alertas por apólice e parcela com garantia estrita de idempotência

-- 1. Notificações de Renovação de Apólices (D-60, D-30, D-15, D-0)
CREATE TABLE IF NOT EXISTS policy_renewal_notifications (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sale_id         TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  cotacao_id      TEXT NOT NULL REFERENCES cotacoes(id),
  client_id       TEXT REFERENCES insurance_clients(id),
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  partner_user_id TEXT REFERENCES partner_users(id),
  window_days     INTEGER NOT NULL,
  target_date     DATE NOT NULL,
  recipient_email TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent',
  email_log_id    TEXT REFERENCES email_dispatch_logs(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sale_id, window_days, target_date)
);

CREATE INDEX IF NOT EXISTS idx_renewal_notif_sale_id ON policy_renewal_notifications (sale_id);
CREATE INDEX IF NOT EXISTS idx_renewal_notif_partner_id ON policy_renewal_notifications (partner_id);
CREATE INDEX IF NOT EXISTS idx_renewal_notif_target_date ON policy_renewal_notifications (target_date);
CREATE INDEX IF NOT EXISTS idx_renewal_notif_sent_at ON policy_renewal_notifications (sent_at DESC);

-- 2. Notificações de Inadimplência Asaas (A Vencer e Vencidas)
CREATE TABLE IF NOT EXISTS delinquency_notifications (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  installment_id    TEXT NOT NULL REFERENCES payment_installments(id) ON DELETE CASCADE,
  payment_order_id  TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  cotacao_id        TEXT NOT NULL REFERENCES cotacoes(id),
  client_id         TEXT REFERENCES insurance_clients(id),
  partner_id        TEXT NOT NULL REFERENCES partners(id),
  notification_type TEXT NOT NULL, -- 'a_vencer' | 'vencida'
  trigger_day       INTEGER NOT NULL, -- ex: -3, -1 (a vencer) ou 1, 3, 7, 15 (vencidas)
  due_date          DATE NOT NULL,
  recipient_email   TEXT NOT NULL,
  recipient_type    TEXT NOT NULL DEFAULT 'broker', -- 'broker' | 'client' | 'admin'
  status            TEXT NOT NULL DEFAULT 'sent',
  email_log_id      TEXT REFERENCES email_dispatch_logs(id),
  metadata          JSONB NOT NULL DEFAULT '{}',
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (installment_id, notification_type, trigger_day)
);

CREATE INDEX IF NOT EXISTS idx_delinquency_notif_installment_id ON delinquency_notifications (installment_id);
CREATE INDEX IF NOT EXISTS idx_delinquency_notif_partner_id ON delinquency_notifications (partner_id);
CREATE INDEX IF NOT EXISTS idx_delinquency_notif_due_date ON delinquency_notifications (due_date);
CREATE INDEX IF NOT EXISTS idx_delinquency_notif_sent_at ON delinquency_notifications (sent_at DESC);

-- 3. Histórico e Logs de Execução do Cronjob de Lifecycle
CREATE TABLE IF NOT EXISTS lifecycle_cron_logs (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_type             TEXT NOT NULL DEFAULT 'full', -- 'full' | 'renewal' | 'delinquency'
  status               TEXT NOT NULL DEFAULT 'success', -- 'success' | 'partial' | 'failed'
  renewals_scanned     INTEGER NOT NULL DEFAULT 0,
  renewals_notified    INTEGER NOT NULL DEFAULT 0,
  renewals_skipped     INTEGER NOT NULL DEFAULT 0,
  delinquency_scanned  INTEGER NOT NULL DEFAULT 0,
  delinquency_notified INTEGER NOT NULL DEFAULT 0,
  delinquency_skipped  INTEGER NOT NULL DEFAULT 0,
  errors               JSONB NOT NULL DEFAULT '[]',
  duration_ms          INTEGER NOT NULL DEFAULT 0,
  triggered_by         TEXT NOT NULL DEFAULT 'cron', -- 'cron' | 'manual_admin' | 'cli'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_cron_logs_created_at ON lifecycle_cron_logs (created_at DESC);
