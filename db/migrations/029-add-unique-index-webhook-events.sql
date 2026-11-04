-- 029-add-unique-index-webhook-events.sql
-- 1. Remove registros duplicados legados mantendo o evento mais recente
DELETE FROM webhook_events
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY provider, external_id
             ORDER BY created_at DESC, id DESC
           ) as rnum
    FROM webhook_events
    WHERE external_id IS NOT NULL
  ) t
  WHERE t.rnum > 1
);

-- 2. Garante a idempotência contra rajadas concorrentes de webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_external_id 
ON webhook_events (provider, external_id) 
WHERE external_id IS NOT NULL;
