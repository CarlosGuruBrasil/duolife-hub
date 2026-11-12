-- Migração 036: Contingência de recuperação de contratos assinados (ZapSign)
--
-- 1) signature_completion_claims
--    Trava atômica de "efeitos de conclusão de assinatura" (gatilho CONTRATO_ASSINADO → e-mails,
--    e geração automática da cobrança Asaas). Uma linha por documento de assinatura.
--    Quem conseguir inserir a linha (webhook, cron de recuperação ou verificação manual) executa
--    os efeitos; os demais apenas atualizam estado. Impede e-mails/cobranças duplicados quando
--    webhook e cron (ou dois webhooks) processam o mesmo contrato, inclusive em paralelo.
--
-- 2) zapsign_recovery_runs
--    Log de cada execução do cron /api/cron/zapsign-recovery (contratos verificados, recuperados,
--    ignorados e erros). O índice único parcial garante no máximo UMA execução em andamento.

CREATE TABLE IF NOT EXISTS signature_completion_claims (
  signature_document_id  TEXT PRIMARY KEY,
  cotacao_id             TEXT NOT NULL,
  external_document_id   TEXT,
  source                 TEXT NOT NULL,
  claimed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signature_completion_claims_cotacao
  ON signature_completion_claims (cotacao_id);

CREATE TABLE IF NOT EXISTS zapsign_recovery_runs (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  triggered_by   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running', -- running | completed | partial | failed | abandoned
  dry_run        BOOLEAN NOT NULL DEFAULT false,
  window_start   TIMESTAMPTZ,
  checked        INTEGER NOT NULL DEFAULT 0,
  recovered      INTEGER NOT NULL DEFAULT 0,
  still_pending  INTEGER NOT NULL DEFAULT 0,
  ignored        INTEGER NOT NULL DEFAULT 0,
  errors         INTEGER NOT NULL DEFAULT 0,
  details        JSONB NOT NULL DEFAULT '[]',
  error_message  TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS zapsign_recovery_runs_single_running
  ON zapsign_recovery_runs ((true))
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_zapsign_recovery_runs_started
  ON zapsign_recovery_runs (started_at DESC);
