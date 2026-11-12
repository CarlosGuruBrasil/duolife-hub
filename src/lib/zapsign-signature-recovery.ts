import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { getSystemSetting, getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { getTodayISODate, isBusinessDay, parseDateSafe, formatToISODate } from '@/lib/business-days';
import { processZapSignPayload } from '@/lib/webhook-processor';

/**
 * Contingência para webhooks ZapSign perdidos.
 *
 * Consulta na API da ZapSign os contratos que ainda constam como NÃO assinados no sistema e
 * foram gerados nos últimos N dias úteis. Ao encontrar um documento com todas as assinaturas
 * concluídas, entrega um payload equivalente ao do webhook para `processZapSignPayload` — a
 * MESMA regra de negócio do webhook (cotação, gatilho CONTRATO_ASSINADO, cobrança Asaas).
 *
 * Não é um fluxo paralelo: não grava estado próprio de negócio. A idempotência vem da trava
 * `signature_completion_claims` (compartilhada com webhook e verificação manual) e do índice
 * único de execução em andamento em `zapsign_recovery_runs`.
 */

export const DEFAULT_LOOKBACK_BUSINESS_DAYS = 5;
export const DEFAULT_INTERVAL_MINUTES = 15;
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_REQUEST_DELAY_MS = 300;
/** Execução "running" mais antiga que isso é considerada abandonada (processo morreu). */
export const STALE_RUN_MINUTES = 30;
/** Falhas consecutivas da API (5xx, timeout, rede) que interrompem a rodada (circuit breaker). */
export const MAX_CONSECUTIVE_API_FAILURES = 5;

export type RecoveryItemAction =
  | 'recovered'
  | 'would_recover'
  | 'already_processed'
  | 'still_pending'
  | 'ignored_canceled'
  | 'ignored_refused'
  | 'ignored_expired'
  | 'not_found'
  | 'error'
  | 'aborted';

export interface RecoveryItem {
  cotacaoId: string;
  signatureDocumentId: string;
  docToken: string;
  zapStatus?: string;
  action: RecoveryItemAction;
  error?: string;
}

export interface RecoveryOptions {
  triggeredBy: string;
  dryRun?: boolean;
  /** Ignora o intervalo mínimo entre execuções (disparo manual de admin). */
  force?: boolean;
  lookbackBusinessDays?: number;
  batchSize?: number;
  concurrency?: number;
  requestDelayMs?: number;
}

export interface RecoveryRunResult {
  ok: boolean;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  skippedReason?: 'interval_not_elapsed' | 'already_running' | 'zapsign_not_configured' | 'schema_missing';
  runId?: string;
  dryRun: boolean;
  windowStart?: string;
  intervalMinutes: number;
  checked: number;
  recovered: number;
  stillPending: number;
  ignored: number;
  errors: number;
  items: RecoveryItem[];
  message?: string;
  durationMs: number;
}

interface CandidateRow {
  signature_document_id: string;
  cotacao_id: string;
  external_document_id: string;
}

interface ZapSignDocResponse {
  status?: string;
  deleted?: boolean;
  external_id?: string | null;
  signed_file?: string | null;
  signed_file_url?: string | null;
  original_file?: string | null;
  last_update_at?: string | null;
  signers?: Array<{ status?: string; email?: string; name?: string; token?: string }>;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers puros (testáveis)
// ─────────────────────────────────────────────────────────────────────────────

/** Data (YYYY-MM-DD, fuso de Brasília) que fica N dias úteis antes de `today`. */
export function subtractBusinessDays(today: string, days: number): string {
  const current = parseDateSafe(today) || parseDateSafe(getTodayISODate())!;
  let count = 0;
  while (count < days) {
    current.setDate(current.getDate() - 1);
    if (isBusinessDay(current)) count++;
  }
  return formatToISODate(current);
}

/** Início (00:00 de Brasília) da janela de N dias úteis. */
export function computeRecoveryWindowStart(lookbackBusinessDays: number, today = getTodayISODate()): string {
  return `${subtractBusinessDays(today, lookbackBusinessDays)}T00:00:00-03:00`;
}

export type ZapSignDocClassification = 'signed' | 'pending' | 'canceled' | 'refused' | 'expired';

/**
 * Classifica o documento retornado pela API da ZapSign. Conservador: só considera assinado quando
 * a ZapSign marca o documento como concluído ou TODOS os signatários assinaram.
 */
export function classifyZapSignDocument(doc: ZapSignDocResponse): ZapSignDocClassification {
  const status = String(doc?.status || '').toLowerCase();
  if (doc?.deleted === true || ['canceled', 'cancelled', 'deleted', 'doc_deleted'].includes(status)) return 'canceled';
  if (['refused', 'rejected'].includes(status)) return 'refused';
  if (['expired', 'deadline_exceeded'].includes(status)) return 'expired';
  if (['signed', 'completed'].includes(status)) return 'signed';

  const signers = Array.isArray(doc?.signers) ? doc.signers : [];
  if (signers.length > 0 && signers.every((s) => String(s?.status || '').toLowerCase() === 'signed')) {
    return 'signed';
  }
  return 'pending';
}

/** Payload equivalente ao do webhook "doc_signed", montado a partir da resposta da API. */
export function buildRecoveryPayload(doc: ZapSignDocResponse, candidate: CandidateRow) {
  return {
    event_type: 'doc_signed',
    doc_token: candidate.external_document_id,
    external_id: doc.external_id || candidate.cotacao_id,
    status: 'signed',
    signed_file: doc.signed_file || doc.signed_file_url || null,
    signers: Array.isArray(doc.signers) ? doc.signers : [],
    last_update_at: doc.last_update_at || null,
    _source: 'zapsign_recovery_cron',
  };
}

function toPositiveInt(raw: unknown, fallback: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intervalo mínimo entre execuções (minutos). Configurável por `system_settings` ou env
 * `ZAPSIGN_RECOVERY_INTERVAL_MINUTES`. O agendador externo pode chamar com frequência maior:
 * o endpoint responde "skipped" até o intervalo vencer.
 */
export async function getRecoveryIntervalMinutes(): Promise<number> {
  const raw = await getSystemSetting(
    'ZAPSIGN_RECOVERY_INTERVAL_MINUTES',
    process.env.ZAPSIGN_RECOVERY_INTERVAL_MINUTES || String(DEFAULT_INTERVAL_MINUTES)
  );
  return toPositiveInt(raw, DEFAULT_INTERVAL_MINUTES, 24 * 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// ZapSign API
// ─────────────────────────────────────────────────────────────────────────────

type FetchDocResult =
  | { kind: 'ok'; doc: ZapSignDocResponse }
  | { kind: 'not_found' }
  | { kind: 'api_failure'; error: string };

async function fetchZapSignDoc(baseUrl: string, apiToken: string, docToken: string): Promise<FetchDocResult> {
  const url = `${baseUrl}/docs/${encodeURIComponent(docToken)}/`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) return { kind: 'ok', doc: (await res.json()) as ZapSignDocResponse };
      if (res.status === 404) return { kind: 'not_found' };

      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 2000);
        continue;
      }

      const text = await res.text().catch(() => '');
      return { kind: 'api_failure', error: `ZapSign HTTP ${res.status}: ${text.slice(0, 140)}` };
    } catch (err) {
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      return { kind: 'api_failure', error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { kind: 'api_failure', error: 'ZapSign indisponível após nova tentativa' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Controle de execução (single-run + intervalo)
// ─────────────────────────────────────────────────────────────────────────────

async function schemaReady(): Promise<boolean> {
  const [row] = await sql<{ claims: string | null; runs: string | null }[]>`
    SELECT
      to_regclass('public.signature_completion_claims')::text AS claims,
      to_regclass('public.zapsign_recovery_runs')::text AS runs
  `;
  return Boolean(row?.claims && row?.runs);
}

async function lastRunStartedWithin(minutes: number): Promise<boolean> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id
    FROM zapsign_recovery_runs
    WHERE dry_run = false
      AND status IN ('completed', 'partial', 'running')
      AND started_at > NOW() - (${minutes}::int * INTERVAL '1 minute')
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return Boolean(row);
}

/** Tenta abrir uma execução. Retorna null se outra já estiver em andamento (índice único parcial). */
async function openRun(triggeredBy: string, dryRun: boolean, windowStart: string): Promise<string | null> {
  await sql`
    UPDATE zapsign_recovery_runs
    SET status = 'abandoned',
        finished_at = NOW(),
        error_message = 'Execução anterior não finalizou (processo interrompido)'
    WHERE status = 'running'
      AND started_at < NOW() - (${STALE_RUN_MINUTES}::int * INTERVAL '1 minute')
  `;

  const rows = await sql<{ id: string }[]>`
    INSERT INTO zapsign_recovery_runs (triggered_by, status, dry_run, window_start)
    VALUES (${triggeredBy}, 'running', ${dryRun}, ${windowStart}::timestamptz)
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id || null;
}

async function closeRun(runId: string, result: RecoveryRunResult): Promise<void> {
  try {
    await sql`
      UPDATE zapsign_recovery_runs
      SET status = ${result.status},
          checked = ${result.checked},
          recovered = ${result.recovered},
          still_pending = ${result.stillPending},
          ignored = ${result.ignored},
          errors = ${result.errors},
          details = ${JSON.stringify(result.items)}::jsonb,
          error_message = ${result.message || null},
          finished_at = NOW()
      WHERE id = ${runId}
    `;
  } catch (err) {
    logger.error({ err, runId }, 'zapsign.recovery.close_run_failed');
  }
}

async function loadCandidates(windowStart: string, batchSize: number): Promise<CandidateRow[]> {
  return sql<CandidateRow[]>`
    SELECT
      sd.id AS signature_document_id,
      sd.cotacao_id,
      sd.external_document_id
    FROM signature_documents sd
    JOIN cotacoes c ON c.id = sd.cotacao_id
    WHERE sd.provider = 'zapsign'
      AND sd.created_at >= ${windowStart}::timestamptz
      AND sd.status NOT IN ('signed', 'cancelled', 'canceled', 'refused', 'expired')
      AND sd.external_document_id IS NOT NULL
      AND sd.external_document_id <> ''
      AND sd.external_document_id NOT LIKE 'ZAP-%'
      AND sd.external_document_id NOT LIKE '%-ZAP-%'
      AND c.status IN ('contrato_gerado', 'enviada', 'rascunho')
      AND COALESCE(c.client_data->>'statusAssinatura', '') <> 'todas_assinadas'
      AND NOT EXISTS (
        SELECT 1 FROM signature_completion_claims scc
        WHERE scc.signature_document_id = sd.id
      )
    ORDER BY sd.created_at ASC
    LIMIT ${batchSize}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

export async function runZapSignSignatureRecovery(options: RecoveryOptions): Promise<RecoveryRunResult> {
  const startedAt = Date.now();
  const dryRun = Boolean(options.dryRun);
  const lookback = toPositiveInt(options.lookbackBusinessDays, DEFAULT_LOOKBACK_BUSINESS_DAYS, 30);
  const batchSize = toPositiveInt(options.batchSize, DEFAULT_BATCH_SIZE, 500);
  const concurrency = toPositiveInt(options.concurrency, DEFAULT_CONCURRENCY, 5);
  const requestDelayMs = Math.max(0, Number(options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS) || 0);
  const intervalMinutes = await getRecoveryIntervalMinutes();

  const result: RecoveryRunResult = {
    ok: true,
    status: 'completed',
    dryRun,
    intervalMinutes,
    checked: 0,
    recovered: 0,
    stillPending: 0,
    ignored: 0,
    errors: 0,
    items: [],
    durationMs: 0,
  };
  const finish = (patch: Partial<RecoveryRunResult>) => {
    Object.assign(result, patch);
    result.durationMs = Date.now() - startedAt;
    return result;
  };

  if (!(await schemaReady())) {
    logger.error('zapsign.recovery.schema_missing: aplique a migração 036 (node scripts/migrate.mjs)');
    return finish({
      ok: false,
      status: 'failed',
      skippedReason: 'schema_missing',
      message: 'Tabelas da contingência ausentes. Execute "node scripts/migrate.mjs" (migração 036).',
    });
  }

  const zapConfig = await getZapSignConfig();
  const apiToken = sanitizeApiToken(zapConfig.apiToken);
  if (!apiToken) {
    logger.warn('zapsign.recovery.not_configured: token da API ZapSign ausente');
    return finish({
      ok: false,
      status: 'skipped',
      skippedReason: 'zapsign_not_configured',
      message: 'Token da API da ZapSign não configurado.',
    });
  }

  if (!options.force && !dryRun && (await lastRunStartedWithin(intervalMinutes))) {
    return finish({
      status: 'skipped',
      skippedReason: 'interval_not_elapsed',
      message: `Última execução há menos de ${intervalMinutes} minuto(s).`,
    });
  }

  const windowStart = computeRecoveryWindowStart(lookback);
  result.windowStart = windowStart;

  const runId = await openRun(options.triggeredBy, dryRun, windowStart);
  if (!runId) {
    logger.info({ triggeredBy: options.triggeredBy }, 'zapsign.recovery.already_running');
    return finish({
      status: 'skipped',
      skippedReason: 'already_running',
      message: 'Outra execução da contingência está em andamento.',
    });
  }
  result.runId = runId;

  logger.info({ runId, windowStart, dryRun, batchSize, triggeredBy: options.triggeredBy }, 'zapsign.recovery.started');

  try {
    const candidates = await loadCandidates(windowStart, batchSize);
    let cursor = 0;
    let consecutiveApiFailures = 0;
    let circuitOpen = false;

    const record = (item: RecoveryItem) => {
      result.items.push(item);
      switch (item.action) {
        case 'recovered':
        case 'would_recover':
          result.recovered++;
          break;
        case 'still_pending':
          result.stillPending++;
          break;
        case 'error':
        case 'aborted':
          result.errors++;
          break;
        default:
          result.ignored++;
      }
      const level = item.action === 'error' ? 'warn' : 'info';
      logger[level]({ runId, ...item }, `zapsign.recovery.item.${item.action}`);
    };

    const processCandidate = async (candidate: CandidateRow) => {
      const base = {
        cotacaoId: candidate.cotacao_id,
        signatureDocumentId: candidate.signature_document_id,
        docToken: candidate.external_document_id,
      };

      if (circuitOpen) {
        record({ ...base, action: 'aborted', error: 'Rodada interrompida: API ZapSign indisponível' });
        return;
      }

      result.checked++;
      const fetched = await fetchZapSignDoc(zapConfig.baseUrl, apiToken, candidate.external_document_id);

      if (fetched.kind === 'api_failure') {
        consecutiveApiFailures++;
        if (consecutiveApiFailures >= MAX_CONSECUTIVE_API_FAILURES) circuitOpen = true;
        record({ ...base, action: 'error', error: fetched.error });
        return;
      }
      consecutiveApiFailures = 0;

      if (fetched.kind === 'not_found') {
        record({ ...base, action: 'not_found' });
        return;
      }

      const zapStatus = String(fetched.doc.status || '').toLowerCase();
      const classification = classifyZapSignDocument(fetched.doc);

      if (classification === 'pending') {
        record({ ...base, zapStatus, action: 'still_pending' });
        return;
      }
      if (classification !== 'signed') {
        record({ ...base, zapStatus, action: `ignored_${classification}` as RecoveryItemAction });
        return;
      }

      if (dryRun) {
        record({ ...base, zapStatus, action: 'would_recover' });
        return;
      }

      try {
        const processed = await processZapSignPayload(buildRecoveryPayload(fetched.doc, candidate), {
          source: 'recovery_cron',
          claimFailureMode: 'fail_closed',
        });

        if (!processed.success) {
          record({ ...base, zapStatus, action: 'error', error: processed.message || 'Falha no processamento' });
        } else if (processed.details?.effects === 'executed') {
          record({ ...base, zapStatus, action: 'recovered' });
        } else {
          record({ ...base, zapStatus, action: 'already_processed' });
        }
      } catch (err) {
        record({ ...base, zapStatus, action: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    };

    const worker = async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];
        try {
          await processCandidate(candidate);
        } catch (err) {
          record({
            cotacaoId: candidate.cotacao_id,
            signatureDocumentId: candidate.signature_document_id,
            docToken: candidate.external_document_id,
            action: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (requestDelayMs > 0 && cursor < candidates.length) await sleep(requestDelayMs);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(candidates.length, 1)) }, worker));

    if (circuitOpen) {
      finish({ ok: false, status: 'partial', message: 'API ZapSign indisponível; rodada interrompida e retomada na próxima execução.' });
    } else if (result.errors > 0) {
      finish({ ok: true, status: 'partial' });
    } else {
      finish({ status: 'completed' });
    }
  } catch (err) {
    logger.error({ err, runId }, 'zapsign.recovery.failed');
    finish({ ok: false, status: 'failed', message: err instanceof Error ? err.message : String(err) });
  }

  await closeRun(runId, result);
  logger.info(
    {
      runId,
      status: result.status,
      checked: result.checked,
      recovered: result.recovered,
      stillPending: result.stillPending,
      ignored: result.ignored,
      errors: result.errors,
      durationMs: result.durationMs,
    },
    'zapsign.recovery.finished'
  );
  return result;
}
