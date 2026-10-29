import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAsaasWebhookQueueStatus,
  reactivateAsaasWebhookQueue,
} from '@/lib/asaas-webhook-management';
import * as systemSettings from '@/lib/system-settings';

describe('Gestão e Reativação de Fila de Webhooks Asaas (asaas-webhook-management)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. getAsaasWebhookQueueStatus', () => {
    it('deve retornar erro claro quando ASAAS_API_KEY não estiver configurada', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: '',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      const result = await getAsaasWebhookQueueStatus();
      expect(result.ok).toBe(false);
      expect(result.hasApiKey).toBe(false);
      expect(result.error).toContain('ASAAS_API_KEY');
      expect(result.isInterrupted).toBe(false);
    });

    it('deve detectar quando a fila do Asaas estiver interrompida (interrupted: true)', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: 'valid_api_key',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/webhooks')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  id: 'wh_001',
                  name: 'DuoLife Webhook',
                  url: 'https://duolife.com.br/api/webhook/asaas',
                  enabled: true,
                  interrupted: true, // Fila pausada pelo Asaas por falhas consecutivas
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      const result = await getAsaasWebhookQueueStatus();
      expect(result.ok).toBe(true);
      expect(result.hasApiKey).toBe(true);
      expect(result.isInterrupted).toBe(true);
      expect(result.webhooks).toHaveLength(1);
      expect(result.webhooks[0].interrupted).toBe(true);
      expect(result.message).toContain('INTERROMPIDA');
    });

    it('deve detectar quando a fila do Asaas estiver ativa e operante (interrupted: false)', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: 'valid_api_key',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/webhooks')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  id: 'wh_001',
                  name: 'DuoLife Webhook',
                  url: 'https://duolife.com.br/api/webhook/asaas',
                  enabled: true,
                  interrupted: false,
                },
              ],
            }),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      const result = await getAsaasWebhookQueueStatus();
      expect(result.ok).toBe(true);
      expect(result.hasApiKey).toBe(true);
      expect(result.isInterrupted).toBe(false);
      expect(result.webhooks[0].interrupted).toBe(false);
      expect(result.message).toContain('operando normalmente');
    });

    it('deve utilizar fallback para endpoint /webhook único caso /webhooks retorne vazio', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: 'valid_api_key',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/webhooks')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: [] }),
          });
        }
        if (url.endsWith('/webhook')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'wh_single',
              url: 'https://duolife.com.br/api/webhook/asaas',
              enabled: true,
              interrupted: false,
            }),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      const result = await getAsaasWebhookQueueStatus();
      expect(result.ok).toBe(true);
      expect(result.webhooks).toHaveLength(1);
      expect(result.webhooks[0].id).toBe('wh_single');
      expect(result.webhooks[0].url).toBe('https://duolife.com.br/api/webhook/asaas');
    });
  });

  describe('2. reactivateAsaasWebhookQueue', () => {
    it('deve enviar payload { interrupted: false, enabled: true } para reativar fila pausada', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: 'valid_api_key',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      let statusInterrupted = true;
      const putCalls: any[] = [];

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/webhooks') && init?.method !== 'PUT') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  id: 'wh_001',
                  url: 'https://duolife.com.br/api/webhook/asaas',
                  enabled: true,
                  interrupted: statusInterrupted,
                },
              ],
            }),
          });
        }
        if (url.endsWith('/webhooks/wh_001') && init?.method === 'PUT') {
          putCalls.push(JSON.parse(String(init.body)));
          statusInterrupted = false; // Simula a desinterrupção pelo Asaas
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        if (url.endsWith('/webhook')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      const result = await reactivateAsaasWebhookQueue();

      expect(putCalls).toHaveLength(1);
      expect(putCalls[0]).toEqual({
        interrupted: false,
        enabled: true,
      });

      expect(result.ok).toBe(true);
      expect(result.reactivatedCount).toBeGreaterThan(0);
      expect(result.isInterrupted).toBe(false);
      expect(result.message).toContain('desinterrompida com sucesso');
    });

    it('deve suportar reativação por webhookId específico', async () => {
      vi.spyOn(systemSettings, 'getAsaasConfig').mockResolvedValue({
        apiKey: 'valid_api_key',
        baseUrl: 'https://api.asaas.com/v3',
        isSandbox: false,
        webhookSecret: 'secret_123',
      });

      let calledUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          calledUrl = url;
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ id: 'wh_especifico', url: 'https://duolife.com.br', enabled: true, interrupted: false }],
          }),
        });
      }) as any;

      const result = await reactivateAsaasWebhookQueue('wh_especifico');
      expect(calledUrl).toContain('/webhooks/wh_especifico');
      expect(result.ok).toBe(true);
    });
  });
});
