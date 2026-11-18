import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqlMock = vi.fn();
vi.mock('@/lib/pg', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }));

import {
  buildHeldMessage,
  getWebhookReplayCutoff,
  isBeforeReplayCutoff,
  parseAsaasEventDate,
  resetWebhookReplayCutoffCache,
  resolveZapSignCompletionDate,
  resolveZapSignEventDate,
  WEBHOOK_HELD_MESSAGE_PREFIX,
} from '@/lib/webhook-replay-guard';

describe('webhook-replay-guard', () => {
  beforeEach(() => {
    sqlMock.mockReset();
    resetWebhookReplayCutoffCache();
    delete process.env.WEBHOOK_REPLAY_CUTOFF;
  });

  describe('parseAsaasEventDate', () => {
    it('interpreta dateCreated do Asaas (sem fuso) como horário de Brasília', () => {
      expect(parseAsaasEventDate('2026-11-04 10:01:27')?.toISOString()).toBe('2026-11-04T13:01:27.000Z');
    });

    it('aceita ISO com fuso explícito', () => {
      expect(parseAsaasEventDate('2026-11-04T13:01:27Z')?.toISOString()).toBe('2026-11-04T13:01:27.000Z');
    });

    it('retorna null para valores ausentes ou inválidos', () => {
      expect(parseAsaasEventDate(undefined)).toBeNull();
      expect(parseAsaasEventDate('')).toBeNull();
      expect(parseAsaasEventDate('ontem')).toBeNull();
    });
  });

  describe('resolveZapSignEventDate', () => {
    it('usa o instante mais recente entre last_update_at e signed_at do payload', () => {
      const payload = {
        last_update_at: '2026-11-09T14:14:21.283592Z',
        signers: [{ signed_at: '2026-11-09T14:14:19.301653Z' }],
      };
      expect(resolveZapSignEventDate(payload)?.toISOString()).toBe('2026-11-09T14:14:21.283Z');
    });

    it('evento doc_created sem assinaturas usa last_update_at', () => {
      const payload = { last_update_at: '2026-11-09T14:03:30.700523Z', signers: [{ signed_at: null }] };
      expect(resolveZapSignEventDate(payload)?.toISOString()).toBe('2026-11-09T14:03:30.700Z');
    });

    it('retorna null sem nenhuma data', () => {
      expect(resolveZapSignEventDate({})).toBeNull();
    });
  });

  describe('resolveZapSignCompletionDate (contingência)', () => {
    it('ignora last_update_at posterior e usa o último signed_at', () => {
      const doc = {
        last_update_at: '2026-11-20T10:00:00Z',
        signers: [{ signed_at: '2026-11-10T12:00:00Z' }, { signed_at: '2026-11-10T13:00:00Z' }],
      };
      expect(resolveZapSignCompletionDate(doc)?.toISOString()).toBe('2026-11-10T13:00:00.000Z');
    });

    it('sem signed_at cai para last_update_at', () => {
      expect(resolveZapSignCompletionDate({ last_update_at: '2026-11-10T12:00:00Z', signers: [] })?.toISOString()).toBe(
        '2026-11-10T12:00:00.000Z'
      );
    });
  });

  describe('isBeforeReplayCutoff', () => {
    const cutoff = new Date('2026-11-18T15:00:00Z');

    it('retém eventos anteriores ao marco', () => {
      expect(isBeforeReplayCutoff(new Date('2026-11-04T13:05:00Z'), cutoff)).toBe(true);
    });

    it('não retém eventos posteriores ou no próprio marco', () => {
      expect(isBeforeReplayCutoff(new Date('2026-11-18T15:00:00Z'), cutoff)).toBe(false);
      expect(isBeforeReplayCutoff(new Date('2026-11-18T15:00:01Z'), cutoff)).toBe(false);
    });

    it('não retém sem data do evento ou sem marco configurado', () => {
      expect(isBeforeReplayCutoff(null, cutoff)).toBe(false);
      expect(isBeforeReplayCutoff(new Date('2026-11-04T13:05:00Z'), null)).toBe(false);
    });
  });

  describe('getWebhookReplayCutoff', () => {
    it('lê o marco do system_settings e mantém em memória', async () => {
      sqlMock.mockResolvedValue([{ value: '2026-11-18T15:00:00.000Z' }]);
      expect((await getWebhookReplayCutoff())?.toISOString()).toBe('2026-11-18T15:00:00.000Z');
      expect((await getWebhookReplayCutoff())?.toISOString()).toBe('2026-11-18T15:00:00.000Z');
      expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it('sem marco no banco usa a variável de ambiente', async () => {
      process.env.WEBHOOK_REPLAY_CUTOFF = '2026-11-18T16:00:00Z';
      sqlMock.mockResolvedValue([]);
      expect((await getWebhookReplayCutoff())?.toISOString()).toBe('2026-11-18T16:00:00.000Z');
    });

    it('sem marco em lugar nenhum retorna null (nada é retido)', async () => {
      sqlMock.mockResolvedValue([]);
      expect(await getWebhookReplayCutoff()).toBeNull();
    });

    it('propaga falha de leitura (nunca executa por não conseguir ler o marco)', async () => {
      sqlMock.mockRejectedValue(new Error('db down'));
      await expect(getWebhookReplayCutoff()).rejects.toThrow('db down');
    });
  });

  it('mensagem de retenção identificável na auditoria', () => {
    const msg = buildHeldMessage(new Date('2026-11-04T13:05:00Z'), new Date('2026-11-18T15:00:00Z'));
    expect(msg.startsWith(WEBHOOK_HELD_MESSAGE_PREFIX)).toBe(true);
    expect(msg).toContain('2026-11-04T13:05:00.000Z');
  });
});
