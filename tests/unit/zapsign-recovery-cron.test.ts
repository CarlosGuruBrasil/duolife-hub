import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  schemaReady: true,
  recentRun: false,
  runOpen: true,
  candidates: [] as Array<{ signature_document_id: string; cotacao_id: string; external_document_id: string }>,
  closedRun: null as null | unknown[],
}));

vi.mock('@/lib/pg', () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (text.includes('to_regclass')) {
      return [state.schemaReady ? { claims: 'signature_completion_claims', runs: 'zapsign_recovery_runs' } : { claims: null, runs: null }];
    }
    if (text.includes('FROM zapsign_recovery_runs')) return state.recentRun ? [{ id: 'old-run' }] : [];
    if (text.includes('INSERT INTO zapsign_recovery_runs')) return state.runOpen ? [{ id: 'run-1' }] : [];
    if (text.includes('UPDATE zapsign_recovery_runs') && text.includes('details =')) {
      state.closedRun = values;
      return [];
    }
    if (text.includes('FROM signature_documents sd')) return state.candidates;
    return [];
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/schema', () => ({ ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/system-settings', () => ({
  getZapSignConfig: vi.fn().mockResolvedValue({ apiToken: 'zap-token', baseUrl: 'https://zapsign.test/api/v1' }),
  sanitizeApiToken: (v: string) => (v || '').trim(),
  getSystemSetting: vi.fn(async (key: string, fallback?: string) => (key === 'CRON_SECRET' ? 'cron-secret-123' : fallback || '')),
}));
vi.mock('@/lib/webhook-processor', () => ({
  processZapSignPayload: vi.fn().mockResolvedValue({ success: true, details: { effects: 'executed', todasAssinadas: true } }),
}));
vi.mock('@/lib/auth', () => ({ verifyAdminAuth: vi.fn().mockResolvedValue(null) }));

import { processZapSignPayload } from '@/lib/webhook-processor';
import { getZapSignConfig } from '@/lib/system-settings';
import { verifyAdminAuth } from '@/lib/auth';
import {
  classifyZapSignDocument,
  subtractBusinessDays,
  buildRecoveryPayload,
  runZapSignSignatureRecovery,
  MAX_CONSECUTIVE_API_FAILURES,
} from '@/lib/zapsign-signature-recovery';

const cand = (n: number) => ({ signature_document_id: `sd-${n}`, cotacao_id: `cot-${n}`, external_document_id: `tok-${n}` });

function zapResponses(map: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (url: string) => {
    const token = decodeURIComponent(String(url).split('/docs/')[1].replace(/\/$/, ''));
    const r = map[token] || { status: 404 };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
}

const signedDoc = { status: 'signed', signed_file: 'https://zap/signed.pdf', signers: [{ status: 'signed' }, { status: 'signed' }] };

describe('helpers da contingência ZapSign', () => {
  it('classifica documentos de forma conservadora', () => {
    expect(classifyZapSignDocument({ status: 'signed' })).toBe('signed');
    expect(classifyZapSignDocument({ status: 'pending', signers: [{ status: 'signed' }, { status: 'signed' }] })).toBe('signed');
    expect(classifyZapSignDocument({ status: 'pending', signers: [{ status: 'signed' }, { status: 'new' }] })).toBe('pending');
    expect(classifyZapSignDocument({ status: 'pending', signers: [] })).toBe('pending');
    expect(classifyZapSignDocument({ status: 'pending', deleted: true, signers: [{ status: 'signed' }] })).toBe('canceled');
    expect(classifyZapSignDocument({ status: 'refused' })).toBe('refused');
    expect(classifyZapSignDocument({ status: 'expired' })).toBe('expired');
  });

  it('calcula a janela de dias úteis pulando fins de semana e feriados', () => {
    // Qui 12/11/2026 → 5 dias úteis antes = Qui 05/11/2026
    expect(subtractBusinessDays('2026-11-12', 5)).toBe('2026-11-05');
    // Ter 03/11/2026: Seg 02/11 é Finados → 26/10/2026
    expect(subtractBusinessDays('2026-11-03', 5)).toBe('2026-10-26');
  });

  it('monta payload equivalente ao webhook doc_signed', () => {
    const p = buildRecoveryPayload(signedDoc as any, cand(1));
    expect(p).toMatchObject({ event_type: 'doc_signed', doc_token: 'tok-1', external_id: 'cot-1', status: 'signed', signed_file: 'https://zap/signed.pdf' });
    expect(p.signers).toHaveLength(2);
  });
});

describe('runZapSignSignatureRecovery', () => {
  beforeEach(() => {
    state.schemaReady = true;
    state.recentRun = false;
    state.runOpen = true;
    state.candidates = [];
    state.closedRun = null;
    vi.mocked(processZapSignPayload).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recupera assinados, ignora cancelados, mantém pendentes e segue após erro da API', async () => {
    state.candidates = [cand(1), cand(2), cand(3), cand(4)];
    vi.stubGlobal(
      'fetch',
      zapResponses({
        'tok-1': { status: 200, body: signedDoc },
        'tok-2': { status: 500, body: { detail: 'boom' } },
        'tok-3': { status: 200, body: { status: 'pending', deleted: true } },
        'tok-4': { status: 200, body: { status: 'pending', signers: [{ status: 'new' }] } },
      })
    );

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron', requestDelayMs: 0, concurrency: 1 });

    expect(res.status).toBe('partial');
    expect(res.checked).toBe(4);
    expect(res.recovered).toBe(1);
    expect(res.errors).toBe(1);
    expect(res.ignored).toBe(1);
    expect(res.stillPending).toBe(1);
    expect(res.items.find((i) => i.cotacaoId === 'cot-3')?.action).toBe('ignored_canceled');

    expect(processZapSignPayload).toHaveBeenCalledTimes(1);
    expect(processZapSignPayload).toHaveBeenCalledWith(
      expect.objectContaining({ doc_token: 'tok-1', status: 'signed' }),
      { source: 'recovery_cron', claimFailureMode: 'fail_closed' }
    );
    expect(state.closedRun).not.toBeNull();
  });

  it('marca already_processed quando o webhook já havia disparado os efeitos', async () => {
    state.candidates = [cand(1)];
    vi.stubGlobal('fetch', zapResponses({ 'tok-1': { status: 200, body: signedDoc } }));
    vi.mocked(processZapSignPayload).mockResolvedValueOnce({ success: true, details: { effects: 'skipped_already_processed' } });

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron', requestDelayMs: 0 });
    expect(res.recovered).toBe(0);
    expect(res.items[0].action).toBe('already_processed');
  });

  it('dryRun consulta a ZapSign mas não processa nada', async () => {
    state.candidates = [cand(1)];
    vi.stubGlobal('fetch', zapResponses({ 'tok-1': { status: 200, body: signedDoc } }));

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'admin:x', dryRun: true, requestDelayMs: 0 });
    expect(res.items[0].action).toBe('would_recover');
    expect(processZapSignPayload).not.toHaveBeenCalled();
  });

  it('respeita o intervalo mínimo entre execuções', async () => {
    state.recentRun = true;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron' });
    expect(res.status).toBe('skipped');
    expect(res.skippedReason).toBe('interval_not_elapsed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não roda em paralelo com outra execução em andamento', async () => {
    state.runOpen = false;
    state.candidates = [cand(1)];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron', force: true });
    expect(res.skippedReason).toBe('already_running');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('interrompe a rodada (circuit breaker) quando a ZapSign está indisponível', async () => {
    state.candidates = Array.from({ length: MAX_CONSECUTIVE_API_FAILURES + 2 }, (_, i) => cand(i + 1));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron', requestDelayMs: 0, concurrency: 1 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('partial');
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONSECUTIVE_API_FAILURES);
    expect(res.items.filter((i) => i.action === 'aborted')).toHaveLength(2);
    expect(processZapSignPayload).not.toHaveBeenCalled();
  });

  it('falha de forma explícita sem a migração aplicada', async () => {
    state.schemaReady = false;
    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron' });
    expect(res.status).toBe('failed');
    expect(res.skippedReason).toBe('schema_missing');
  });

  it('não roda sem token da API ZapSign', async () => {
    vi.mocked(getZapSignConfig).mockResolvedValueOnce({ apiToken: '', baseUrl: 'x' } as any);
    const res = await runZapSignSignatureRecovery({ triggeredBy: 'cron' });
    expect(res.skippedReason).toBe('zapsign_not_configured');
  });
});

describe('rota /api/cron/zapsign-recovery', () => {
  beforeEach(() => {
    state.schemaReady = true;
    state.recentRun = false;
    state.runOpen = true;
    state.candidates = [];
    vi.mocked(verifyAdminAuth).mockResolvedValue(null);
  });

  it('rejeita chamadas sem segredo do cron', async () => {
    const { GET } = await import('@/../app/api/cron/zapsign-recovery/route');
    const res = await GET(new NextRequest('http://localhost/api/cron/zapsign-recovery'));
    expect(res.status).toBe(401);
  });

  it('rejeita segredo incorreto e não aceita segredo por query string', async () => {
    const { GET } = await import('@/../app/api/cron/zapsign-recovery/route');
    const wrong = await GET(
      new NextRequest('http://localhost/api/cron/zapsign-recovery', { headers: { authorization: 'Bearer errado' } })
    );
    expect(wrong.status).toBe(401);
    const query = await GET(new NextRequest('http://localhost/api/cron/zapsign-recovery?secret=cron-secret-123'));
    expect(query.status).toBe(401);
  });

  it('aceita o CRON_SECRET e não permite ao agendador forçar o intervalo', async () => {
    state.recentRun = true;
    const { POST } = await import('@/../app/api/cron/zapsign-recovery/route');
    const res = await POST(
      new NextRequest('http://localhost/api/cron/zapsign-recovery', {
        method: 'POST',
        headers: { 'x-cron-secret': 'cron-secret-123', 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skippedReason).toBe('interval_not_elapsed');
  });
});
