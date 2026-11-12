import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Garante que webhook ZapSign, cron de recuperação e reenvios do webhook nunca disparam
 * CONTRATO_ASSINADO (e-mails) nem geram cobrança duas vezes para o mesmo documento.
 *
 * O banco é simulado em memória; a tabela signature_completion_claims reproduz a semântica
 * atômica do INSERT ... ON CONFLICT DO NOTHING.
 */

const db = vi.hoisted(() => ({
  claims: new Set<string>(),
  claimShouldFail: false,
  webhookEventSeq: 0,
  cotacaoStatus: 'contrato_gerado',
}));

vi.mock('@/lib/pg', () => {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    // Cede o event loop para permitir intercalação real entre chamadas concorrentes.
    await new Promise((r) => setTimeout(r, 0));

    if (text.includes('INSERT INTO signature_completion_claims')) {
      if (db.claimShouldFail) throw new Error('relation "signature_completion_claims" does not exist');
      const id = String(values[0]);
      if (db.claims.has(id)) return [];
      db.claims.add(id);
      return [{ signature_document_id: id }];
    }
    if (text.includes('FROM webhook_events') && text.includes('processed = true')) return [];
    if (text.includes('INSERT INTO webhook_events')) return [{ id: `ev-${++db.webhookEventSeq}` }];
    if (text.includes('FROM signature_documents') && text.includes('external_document_id =')) {
      return [{ id: 'sd-1', cotacao_id: 'cot-1' }];
    }
    if (text.includes('FROM cotacoes c') && text.includes('LEFT JOIN products')) {
      return [
        {
          client_data: { email: 'cliente@example.com', nome: 'Cliente Teste' },
          status: db.cotacaoStatus,
          client_name: 'Cliente Teste',
          client_email: 'cliente@example.com',
          product_id: null,
          product_flow_key: null,
        },
      ];
    }
    if (text.includes('SELECT client_id, partner_id, partner_user_id')) {
      return [{ client_id: null, partner_id: null, partner_user_id: null, client_name: 'Cliente Teste', premio_final: 100, premio_calculado: 100, importancia_segurada: 100000 }];
    }
    if (text.includes('FROM payment_orders')) return [];
    return [];
  });
  return { sql };
});

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/schema', () => ({ ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/system-settings', () => ({
  getZapSignConfig: vi.fn().mockResolvedValue({ apiToken: '', webhookSecret: 'segredo-webhook', baseUrl: 'https://zapsign.test/api/v1' }),
  sanitizeApiToken: (v: string) => (v || '').trim(),
  getSystemSetting: vi.fn().mockResolvedValue(''),
}));
vi.mock('@/lib/triggers/dispatcher', () => ({
  dispatchDomainEvent: vi.fn().mockResolvedValue({ emailsSent: 2, errors: [] }),
}));
vi.mock('@/lib/asaas-service', () => ({
  generateAsaasPaymentForQuote: vi.fn().mockResolvedValue({ ok: true, checkoutId: 'pay_1', linkBoleto: 'https://boleto' }),
}));

import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { processZapSignPayload } from '@/lib/webhook-processor';
import { runWithSideEffectsSuppressed } from '@/lib/side-effects-guard';
import { claimSignatureCompletionEffects, shouldRunCompletionEffects } from '@/lib/signature-completion-claim';

const signers = [
  { email: 'cliente@example.com', name: 'Cliente Teste', status: 'signed' },
  { email: 'contato@net4life.com.br', name: 'Corretora Net4Life', status: 'signed' },
];

function webhookRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/webhook/zapsign', {
    method: 'POST',
    headers: { 'x-zapsign-webhook-secret': 'segredo-webhook', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const webhookBody = (lastUpdate: string) => ({
  event_type: 'doc_signed',
  doc_token: 'doc-token-1',
  external_id: 'cot-1',
  status: 'signed',
  signed_file: 'https://zapsign.test/signed.pdf',
  signers,
  last_update_at: lastUpdate,
});

const cronPayload = {
  event_type: 'doc_signed',
  doc_token: 'doc-token-1',
  external_id: 'cot-1',
  status: 'signed',
  signed_file: 'https://zapsign.test/signed.pdf',
  signers,
  _source: 'zapsign_recovery_cron',
};

describe('Idempotência da conclusão de assinatura ZapSign (webhook × cron)', () => {
  beforeEach(() => {
    db.claims.clear();
    db.claimShouldFail = false;
    db.webhookEventSeq = 0;
    db.cotacaoStatus = 'contrato_gerado';
    vi.mocked(dispatchDomainEvent).mockClear();
    vi.mocked(generateAsaasPaymentForQuote).mockClear();
  });

  it('webhook processa primeiro; cron no mesmo documento não reenvia e-mail nem gera cobrança', async () => {
    const { POST } = await import('@/../app/api/webhook/zapsign/route');
    const res = await POST(webhookRequest(webhookBody('2026-11-12T10:00:00Z')));
    expect(res.status).toBe(200);
    expect((await res.json()).todasAssinadas).toBe(true);

    const cron = await processZapSignPayload(cronPayload, { source: 'recovery_cron', claimFailureMode: 'fail_closed' });

    expect(cron.success).toBe(true);
    expect(cron.details?.effects).toBe('skipped_already_processed');
    expect(dispatchDomainEvent).toHaveBeenCalledTimes(1);
    expect(generateAsaasPaymentForQuote).toHaveBeenCalledTimes(1);
  });

  it('cron recupera primeiro; webhook atrasado não duplica e-mail nem cobrança', async () => {
    const cron = await processZapSignPayload(cronPayload, { source: 'recovery_cron', claimFailureMode: 'fail_closed' });
    expect(cron.details?.effects).toBe('executed');

    const { POST } = await import('@/../app/api/webhook/zapsign/route');
    const res = await POST(webhookRequest(webhookBody('2026-11-12T10:05:00Z')));
    expect(res.status).toBe(200);

    expect(dispatchDomainEvent).toHaveBeenCalledTimes(1);
    expect(generateAsaasPaymentForQuote).toHaveBeenCalledTimes(1);
  });

  it('webhook e cron simultâneos no mesmo contrato disparam os efeitos uma única vez', async () => {
    const { POST } = await import('@/../app/api/webhook/zapsign/route');
    const [res, cron] = await Promise.all([
      POST(webhookRequest(webhookBody('2026-11-12T11:00:00Z'))),
      processZapSignPayload(cronPayload, { source: 'recovery_cron', claimFailureMode: 'fail_closed' }),
    ]);

    expect(res.status).toBe(200);
    expect(cron.success).toBe(true);
    expect(dispatchDomainEvent).toHaveBeenCalledTimes(1);
    expect(generateAsaasPaymentForQuote).toHaveBeenCalledTimes(1);
  });

  it('dois webhooks "assinado" distintos (chaves de evento diferentes) disparam e-mail uma vez', async () => {
    const { POST } = await import('@/../app/api/webhook/zapsign/route');
    await POST(webhookRequest(webhookBody('2026-11-12T12:00:00Z')));
    await POST(webhookRequest({ ...webhookBody('2026-11-12T12:00:09Z'), event_type: 'signer_signed' }));

    expect(dispatchDomainEvent).toHaveBeenCalledTimes(1);
    expect(generateAsaasPaymentForQuote).toHaveBeenCalledTimes(1);
  });

  it('cron é fail-closed: se a trava falhar, não dispara nada', async () => {
    db.claimShouldFail = true;
    const cron = await processZapSignPayload(cronPayload, { source: 'recovery_cron', claimFailureMode: 'fail_closed' });

    expect(cron.success).toBe(true);
    expect(cron.details?.effects).toBe('skipped_already_processed');
    expect(dispatchDomainEvent).not.toHaveBeenCalled();
    expect(generateAsaasPaymentForQuote).not.toHaveBeenCalled();
  });

  it('webhook é fail-open: se a trava falhar, mantém o comportamento histórico', async () => {
    db.claimShouldFail = true;
    const { POST } = await import('@/../app/api/webhook/zapsign/route');
    const res = await POST(webhookRequest(webhookBody('2026-11-12T13:00:00Z')));

    expect(res.status).toBe(200);
    expect(dispatchDomainEvent).toHaveBeenCalledTimes(1);
    expect(generateAsaasPaymentForQuote).toHaveBeenCalledTimes(1);
  });

  it('reprocessamento administrativo em modo seguro não consome a trava', async () => {
    await runWithSideEffectsSuppressed('teste', () => processZapSignPayload(cronPayload, { source: 'webhook_reprocess' }));
    expect(db.claims.size).toBe(0);

    // (o dispatcher real retorna cedo quando suprimido; aqui ele é mock, então só validamos a trava)
    const cron = await processZapSignPayload(cronPayload, { source: 'recovery_cron', claimFailureMode: 'fail_closed' });
    expect(cron.details?.effects).toBe('executed');
    expect(db.claims.has('sd-1')).toBe(true);
  });
});

describe('claimSignatureCompletionEffects', () => {
  beforeEach(() => {
    db.claims.clear();
    db.claimShouldFail = false;
  });

  it('primeira reivindicação vence; as seguintes retornam already_claimed', async () => {
    const input = { signatureDocumentId: 'sd-9', cotacaoId: 'cot-9', source: 'webhook' as const };
    const results = await Promise.all([
      claimSignatureCompletionEffects(input),
      claimSignatureCompletionEffects({ ...input, source: 'recovery_cron' }),
      claimSignatureCompletionEffects(input),
    ]);
    expect(results.filter((r) => r === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_claimed')).toHaveLength(2);
  });

  it('retorna error quando o banco falha', async () => {
    db.claimShouldFail = true;
    expect(await claimSignatureCompletionEffects({ signatureDocumentId: 'x', cotacaoId: 'y', source: 'webhook' })).toBe('error');
  });

  it('shouldRunCompletionEffects respeita o modo de falha', () => {
    expect(shouldRunCompletionEffects('claimed', 'fail_closed')).toBe(true);
    expect(shouldRunCompletionEffects('already_claimed', 'fail_open')).toBe(false);
    expect(shouldRunCompletionEffects('error', 'fail_open')).toBe(true);
    expect(shouldRunCompletionEffects('error', 'fail_closed')).toBe(false);
  });
});
