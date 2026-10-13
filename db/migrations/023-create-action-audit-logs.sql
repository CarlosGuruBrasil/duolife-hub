-- Migração 023: Criação da tabela action_audit_logs para auditoria de ações e mutações
CREATE TABLE IF NOT EXISTS action_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  description TEXT NOT NULL,
  old_state JSONB DEFAULT NULL,
  new_state JSONB DEFAULT NULL,
  diff JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_audit_logs_created_at ON action_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_module ON action_audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_action ON action_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_user_id ON action_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_target ON action_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_status ON action_audit_logs (status);
