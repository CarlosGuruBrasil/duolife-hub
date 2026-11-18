import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

/**
 * Trava de reexecução de webhooks antigos.
 *
 * Contexto: entre 04/11/2026 (Asaas) e 09/11/2026 (ZapSign) e o deploy da correção, todo webhook
 * autenticado falhava com 500 (ON CONFLICT incompatível com o índice único parcial de
 * webhook_events). Por decisão do negócio, esses eventos que falharam NÃO podem ser executados
 * quando o provedor os reenviar (fila do Asaas reativada, retentativas da ZapSign) nem pela
 * contingência de assinaturas.
 *
 * O marco é gravado uma única vez pela migração 038 no boot do deploy da correção
 * (system_settings.WEBHOOK_REPLAY_CUTOFF). Eventos ocorridos antes dele são apenas registrados
 * em webhook_events como retidos (processed = false), sem nenhum efeito. A reexecução continua
 * possível apenas por decisão individual de um administrador na Auditoria de Webhooks.
 */

export const WEBHOOK_REPLAY_CUTOFF_KEY = 'WEBHOOK_REPLAY_CUTOFF';

export const WEBHOOK_HELD_MESSAGE_PREFIX = 'Retido sem execução';

let cachedCutoff: Date | null = null;

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Lê o marco de corte. O valor é imutável depois de gravado, então fica em memória após a
 * primeira leitura bem-sucedida. Sem marco configurado (ex.: ambiente local sem a migração),
 * retorna null e nenhum evento é retido.
 */
export async function getWebhookReplayCutoff(): Promise<Date | null> {
  if (cachedCutoff) return cachedCutoff;

  const fromEnv = parseDate(process.env.WEBHOOK_REPLAY_CUTOFF);

  try {
    const rows = await sql<{ value: string }[]>`
      SELECT value FROM system_settings WHERE key = ${WEBHOOK_REPLAY_CUTOFF_KEY} LIMIT 1
    `;
    const fromDb = parseDate(rows[0]?.value);
    cachedCutoff = fromDb || fromEnv;
  } catch (err) {
    // Falha de leitura propaga: a rota responde 500 e o provedor tenta de novo depois.
    // Nunca executar um evento possivelmente antigo por não conseguir ler o marco.
    logger.error({ err }, 'webhook.replay_guard.cutoff_read_failed');
    throw err;
  }

  return cachedCutoff;
}

/** Apenas para testes. */
export function resetWebhookReplayCutoffCache() {
  cachedCutoff = null;
}

/**
 * `dateCreated` do evento Asaas chega no horário de Brasília sem fuso ("2026-11-04 10:01:27").
 * Também aceita ISO com fuso explícito.
 */
export function parseAsaasEventDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const naive = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  if (naive) return parseDate(`${naive[1]}T${naive[2]}-03:00`);
  const dateOnly = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnly) return parseDate(`${raw}T00:00:00-03:00`);
  return parseDate(raw);
}

/**
 * Instante em que o evento ZapSign ocorreu: o mais recente entre `last_update_at` do documento
 * e os `signed_at` dos signatários (todos em ISO com fuso).
 */
export function resolveZapSignEventDate(payload: any): Date | null {
  const doc = payload?.doc || payload?.document || payload;
  const signers: any[] = Array.isArray(doc?.signers)
    ? doc.signers
    : Array.isArray(payload?.signers)
      ? payload.signers
      : [];

  const candidates = [
    payload?.last_update_at,
    doc?.last_update_at,
    payload?.signed_at,
    ...signers.map((s) => s?.signed_at),
  ]
    .map(parseDate)
    .filter((d): d is Date => d !== null);

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

/**
 * Instante em que o documento ZapSign foi concluído, para a contingência (que consulta o estado
 * ATUAL do documento, cujo `last_update_at` pode avançar depois da assinatura): o `signed_at`
 * mais recente dos signatários; sem nenhum, cai para `last_update_at`.
 */
export function resolveZapSignCompletionDate(doc: any): Date | null {
  const signers: any[] = Array.isArray(doc?.signers) ? doc.signers : [];
  const signedDates = signers
    .map((s) => parseDate(s?.signed_at))
    .filter((d): d is Date => d !== null);
  if (signedDates.length > 0) {
    return new Date(Math.max(...signedDates.map((d) => d.getTime())));
  }
  return parseDate(doc?.last_update_at);
}

/** Verdadeiro quando o evento ocorreu antes do marco de corte (deve ser retido). */
export function isBeforeReplayCutoff(eventDate: Date | null, cutoff: Date | null): boolean {
  if (!eventDate || !cutoff) return false;
  return eventDate.getTime() < cutoff.getTime();
}

export function buildHeldMessage(eventDate: Date, cutoff: Date): string {
  return (
    `${WEBHOOK_HELD_MESSAGE_PREFIX}: evento de ${eventDate.toISOString()} é anterior à correção dos webhooks ` +
    `(${cutoff.toISOString()}). Não executado automaticamente; reexecução apenas por decisão do administrador.`
  );
}
