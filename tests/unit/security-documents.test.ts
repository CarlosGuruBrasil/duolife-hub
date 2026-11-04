import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn().mockResolvedValue([]);
  fn.begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fn));
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  verifyAdminAuth: vi.fn(),
  isPlatformAdmin: vi.fn(() => true),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
}));

import { verifyAdminAuth } from '@/lib/auth';
import { GET } from '../../app/api/admin/corretoras/[id]/documento/[tipo]/route';

describe('Task 6: Proteção contra Stored XSS e Validação de Documentos Anexos (VULN-07)', () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.clearAllMocks();
  });

  describe('Download seguro de documentos', () => {
    it('deve conter cabecalhos anti-XSS (CSP, nosniff) e sanitizar mime-type perigoso', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValue({
        userId: 'admin-01',
        role: 'duolife_admin',
      } as any);

      // Simula documento armazenado no banco com mime malicioso (ex: text/html ou image/svg+xml para Stored XSS)
      mockSql.mockResolvedValueOnce([
        {
          id: 'corr-01',
          nome_fantasia: 'Corretora Alvo',
          contrato_social_base64: Buffer.from('<script>alert("XSS")</script>').toString('base64'),
          contrato_social_mime_type: 'text/html', // Tentativa de injeção de Stored XSS
          contrato_social_nome_arquivo: 'ataque.html',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/admin/corretoras/corr-01/documento/contrato-social');
      const res = await GET(req, { params: Promise.resolve({ id: 'corr-01', tipo: 'contrato-social' }) });

      expect(res.status).toBe(200);

      // 1. O Content-Type NUNCA deve ser text/html ou image/svg+xml
      const contentType = res.headers.get('content-type');
      expect(contentType).not.toBe('text/html');
      expect(contentType).not.toBe('image/svg+xml');

      // 2. DEVE conter X-Content-Type-Options: nosniff
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');

      // 3. DEVE conter Content-Security-Policy com sandbox ou default-src 'none'
      const csp = res.headers.get('content-security-policy');
      expect(csp).toBeDefined();
      expect(csp).toMatch(/default-src 'none'|sandbox/);
    });

    it('deve servir PDF legitimo com protecao CSP', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValue({
        userId: 'admin-01',
        role: 'duolife_admin',
      } as any);

      mockSql.mockResolvedValueOnce([
        {
          id: 'corr-01',
          nome_fantasia: 'Corretora Alvo',
          contrato_social_base64: Buffer.from('%PDF-1.4 ...').toString('base64'),
          contrato_social_mime_type: 'application/pdf',
          contrato_social_nome_arquivo: 'contrato.pdf',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/admin/corretoras/corr-01/documento/contrato-social');
      const res = await GET(req, { params: Promise.resolve({ id: 'corr-01', tipo: 'contrato-social' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toMatch(/default-src 'none'|sandbox/);
    });
  });
});
