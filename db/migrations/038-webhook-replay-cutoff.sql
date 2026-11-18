-- Migração 038: Marco de corte para eventos de webhook entregues durante a falha de ON CONFLICT
--
-- Entre 04/11/2026 (Asaas) e 09/11/2026 (ZapSign) e o deploy desta correção, todo webhook autenticado
-- falhava com 500 (ON CONFLICT incompatível com o índice único parcial de webhook_events).
-- Decisão do negócio: esses eventos NÃO devem ser executados automaticamente quando o Asaas
-- (ao reativar a fila) ou a ZapSign os reenviarem, nem pela contingência de assinaturas.
--
-- Esta migração roda no boot do contêiner (npm run start → scripts/migrate.mjs), imediatamente
-- antes do servidor subir com a correção, gravando o instante do deploy uma única vez.
-- Eventos ocorridos ANTES deste marco são apenas registrados em webhook_events (retidos), sem efeito.
-- Ver src/lib/webhook-replay-guard.ts.

INSERT INTO system_settings (key, value, description, updated_by)
VALUES (
  'WEBHOOK_REPLAY_CUTOFF',
  to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'Eventos de webhook (Asaas/ZapSign) ocorridos antes deste instante são retidos sem execução automática.',
  'migration:038'
)
ON CONFLICT (key) DO NOTHING;
