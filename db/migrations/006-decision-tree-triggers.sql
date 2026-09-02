-- Migration: 006-decision-tree-triggers.sql
-- Módulo de Gatilhos e Árvore de Decisão

CREATE TABLE IF NOT EXISTS automation_triggers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  event_type      TEXT NOT NULL, -- 'COTACAO_CRIADA', 'CONTRATO_ASSINADO', 'PAGAMENTO_CONFIRMADO', 'FATURA_VENCIDA', etc.
  is_active       BOOLEAN NOT NULL DEFAULT true,
  tree_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_event ON automation_triggers (event_type);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_active ON automation_triggers (is_active);

CREATE TABLE IF NOT EXISTS automation_trigger_logs (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trigger_id       TEXT REFERENCES automation_triggers(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  context_id       TEXT,
  context_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_nodes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL DEFAULT 'success', -- 'success', 'partial', 'failed', 'no_action'
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_event ON automation_trigger_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_trigger ON automation_trigger_logs (trigger_id);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_status ON automation_trigger_logs (status);
