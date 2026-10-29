import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ ok: false, error: 'Não autorizado' }, { status: 401 })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  rateLimitResponse: vi.fn(() => Response.json({ ok: false, error: 'Rate limit' }, { status: 429 })),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  return { sql: sqlMock };
});

import { POST } from '../../app/api/portal/validar-cupom/route';
import { verifyAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { NextRequest } from 'next/server';

describe('POST /api/portal/validar-cupom - Robustez e Validações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 401 se verifyAuth retornar null', async () => {
    (verifyAuth as any).mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'BONUS40' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Não autorizado');
  });

  it('deve validar cupom com sucesso quando formato for aninhado item.data (BONUS40)', async () => {
    (verifyAuth as any).mockResolvedValue({
      userId: 'admin_123',
      role: 'duolife_admin',
      partnerId: null,
    });

    const mockWixItems = [
      {
        payload: {
          item: {
            data: {
              codigo: 'bonus40',
              nome: 'Cupom 40% OFF',
              desconto: 40,
              cupomAtivo: true,
              quantidade: 100,
            },
          },
        },
      },
    ];

    (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('');
      if (q.includes('wix_items')) {
        return mockWixItems;
      }
      if (q.includes('cupom_usos')) {
        return [{ usos: 5 }];
      }
      return [];
    });

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'BONUS40' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.desconto).toBe(40);
    expect(data.codigo).toBe('bonus40');
  });

  it('deve validar cupom com sucesso quando formato for plano/direto (sem item)', async () => {
    (verifyAuth as any).mockResolvedValue({
      userId: 'admin_123',
      role: 'duolife_admin',
      partnerId: null,
    });

    const mockWixItems = [
      {
        payload: {
          data: {
            codigo: 'bonus40',
            nome: 'Cupom 40% OFF',
            desconto: 40,
            cupomAtivo: true,
            quantidade: 100,
          },
        },
      },
    ];

    (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('');
      if (q.includes('wix_items')) {
        return mockWixItems;
      }
      if (q.includes('cupom_usos')) {
        return [{ usos: 10 }];
      }
      return [];
    });

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'bonus40' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.desconto).toBe(40);
  });

  it('deve retornar 404 se o cupom não for encontrado', async () => {
    (verifyAuth as any).mockResolvedValue({
      userId: 'admin_123',
      role: 'duolife_admin',
      partnerId: null,
    });

    (sql as any).mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'CUPOMINEXISTENTE' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Cupom inválido ou não encontrado');
  });

  it('deve retornar 400 se o cupom estiver inativo', async () => {
    (verifyAuth as any).mockResolvedValue({
      userId: 'admin_123',
      role: 'duolife_admin',
      partnerId: null,
    });

    (sql as any).mockResolvedValue([
      {
        payload: {
          data: {
            codigo: 'inativo10',
            cupomAtivo: false,
            desconto: 10,
          },
        },
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'inativo10' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Cupom inativo');
  });

  it('deve retornar 400 se o cupom já estiver esgotado no limite de usos', async () => {
    (verifyAuth as any).mockResolvedValue({
      userId: 'admin_123',
      role: 'duolife_admin',
      partnerId: null,
    });

    (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('');
      if (q.includes('wix_items')) {
        return [
          {
            payload: {
              data: {
                codigo: 'esgotado50',
                cupomAtivo: true,
                desconto: 50,
                quantidade: 10,
              },
            },
          },
        ];
      }
      if (q.includes('cupom_usos')) {
        return [{ usos: 10 }]; // já usou 10 de 10
      }
      return [];
    });

    const req = new NextRequest('http://localhost:3000/api/portal/validar-cupom', {
      method: 'POST',
      body: JSON.stringify({ code: 'esgotado50' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Cupom esgotado');
  });
});
