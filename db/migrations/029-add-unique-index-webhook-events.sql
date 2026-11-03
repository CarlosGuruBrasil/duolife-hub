-- 029-add-unique-index-webhook-events.sql
-- Garante a idempotência contra rajadas concorrentes de webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_external_id 
ON webhook_events (provider, external_id) 
WHERE external_id IS NOT NULL;
