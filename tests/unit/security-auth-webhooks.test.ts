import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock getZapSignConfig
vi.mock('@/lib/system-settings', () => ({
  getZapSignConfig: vi.fn(),
}));

// Mock verifyAuth
vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  roleIsInternal: vi.fn((role: string) => ['duolife_admin', 'duolife_dev', 'duolife_operator'].includes(role)),
}));

import { getZapSignConfig } from '@/lib/system-settings';
import { verifyAuth } from '@/lib/auth';

describe('Task 1: Blindagem de Autenticação e Webhooks Fail-Closed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  describe('Webhook ZapSign Fail-Closed (VULN-01)', () => {
    it('deve REJEITAR com 401 quando ZAPSIGN_WEBHOOK_SECRET nao estiver configurado (Fail-Closed)', async () => {
      delete process.env.ZAPSIGN_WEBHOOK_SECRET;
      vi.mocked(getZapSignConfig).mockResolvedValue({ webhookSecret: '' } as any);

      const { POST } = await import('@/../app/api/webhook/zapsign/route');

      const req = new NextRequest('http://localhost:3000/api/webhook/zapsign', {
        method: 'POST',
        body: JSON.stringify({ event_type: 'doc_signed', open_id: 123 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/unauthorized|não autorizado/i);
    });

    it('deve REJEITAR com 401 quando token for incorreto', async () => {
      process.env.ZAPSIGN_WEBHOOK_SECRET = 'segredo_super_forte_123';
      vi.mocked(getZapSignConfig).mockResolvedValue({ webhookSecret: 'segredo_super_forte_123' } as any);

      const { POST } = await import('@/../app/api/webhook/zapsign/route');

      const req = new NextRequest('http://localhost:3000/api/webhook/zapsign', {
        method: 'POST',
        headers: {
          'x-zapsign-webhook-secret': 'token_errado',
        },
        body: JSON.stringify({ event_type: 'doc_signed', open_id: 123 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Segredos em render-pdf (VULN-04)', () => {
    it('deve REJEITAR JWT_SECRET como Bearer token em render-pdf (401)', async () => {
      delete process.env.INTERNAL_SERVICE_KEY;
      delete process.env.CRON_SECRET;
      process.env.JWT_SECRET = 'segredo_jwt_mestre';
      vi.mocked(verifyAuth).mockRejectedValue(new Error('No session'));

      const { POST } = await import('@/../app/api/admin/contratos/render-pdf/route');

      const req = new NextRequest('http://localhost:3000/api/admin/contratos/render-pdf', {
        method: 'POST',
        headers: {
          authorization: 'Bearer segredo_jwt_mestre',
        },
        body: JSON.stringify({ quoteId: '123' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('deve REJEITAR header x-dev-test fora de ambiente de teste controlado (401)', async () => {
      process.env.NODE_ENV = 'development';
      const origVitest = process.env.VITEST;
      delete process.env.VITEST;
      vi.mocked(verifyAuth).mockRejectedValue(new Error('No session'));

      try {
        const { POST } = await import('@/../app/api/admin/contratos/render-pdf/route');

        const req = new NextRequest('http://localhost:3000/api/admin/contratos/render-pdf', {
          method: 'POST',
          headers: {
            'x-dev-test': 'true',
          },
          body: JSON.stringify({ quoteId: '123' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
      } finally {
        process.env.VITEST = origVitest;
      }
    });
  });
});
