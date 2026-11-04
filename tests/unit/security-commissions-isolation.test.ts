import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn((stringsOrArg: any, ..._values: any[]) => {
    if (Array.isArray(stringsOrArg) && !('raw' in stringsOrArg)) {
      return stringsOrArg;
    }
    return Promise.resolve([]);
  });
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

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    verifyPartnerAuth: vi.fn(),
    getPartnerAccessContext: vi.fn(),
    unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  };
});

import { verifyPartnerAuth, getPartnerAccessContext } from '@/lib/auth';
import { GET as getComissoes } from '../../app/api/comissoes/route';
import { GET as getVendas } from '../../app/api/vendas/route';
import { getAccessibleQuoteById } from '@/lib/access';

describe('Task 7: Isolamento Horizontal de Comissões e Vendas (VULN-08)', () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.clearAllMocks();
  });

  describe('1. Consulta de comissões por corretor subordinado', () => {
    it('deve filtrar estritamente por partner_user_id e NÃO incluir registros onde partner_user_id é NULL', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValue({
        userId: 'broker-10',
        partnerId: 'partner-100',
        role: 'partner_broker',
      } as any);

      vi.mocked(getPartnerAccessContext).mockResolvedValue({
        isCorretoraUser: false,
        partnerId: 'partner-100',
        corretoraId: null,
        visibleUserIds: ['broker-10'],
      } as any);

      // Simula query retornando apenas comissões do próprio corretor
      mockSql.mockResolvedValueOnce([
        {
          id: 'comm-1',
          partner_user_id: 'broker-10',
          amount: 150,
          client_name: 'Cliente do Corretor',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/comissoes');
      const res = await getComissoes(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.comissoes).toBeDefined();

      // Inspeciona a chamada SQL de comissões
      const templateCall = mockSql.mock.calls.find((call: any) => Array.isArray(call[0]) && 'raw' in call[0]);
      expect(templateCall).toBeDefined();
      const queryText = templateCall[0].join(' ');

      // A query NÃO pode conter "OR c.partner_user_id IS NULL"
      expect(queryText).not.toMatch(/OR\s+c\.partner_user_id\s+IS\s+NULL/i);
    });
  });

  describe('2. Consulta de vendas por corretor subordinado', () => {
    it('deve filtrar estritamente por partner_user_id e NÃO incluir registros onde partner_user_id é NULL', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValue({
        userId: 'broker-10',
        partnerId: 'partner-100',
        role: 'partner_broker',
      } as any);

      vi.mocked(getPartnerAccessContext).mockResolvedValue({
        isCorretoraUser: false,
        partnerId: 'partner-100',
        corretoraId: null,
        visibleUserIds: ['broker-10'],
      } as any);

      mockSql.mockResolvedValueOnce([
        {
          id: 'sale-1',
          partner_user_id: 'broker-10',
          policy_number: 'POL-123',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/vendas');
      const res = await getVendas(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.vendas).toBeDefined();

      const templateCall = mockSql.mock.calls.find((call: any) => Array.isArray(call[0]) && 'raw' in call[0]);
      expect(templateCall).toBeDefined();
      const queryText = templateCall[0].join(' ');

      // A query de vendas NÃO pode conter "OR c.partner_user_id IS NULL"
      expect(queryText).not.toMatch(/OR\s+c\.partner_user_id\s+IS\s+NULL/i);
    });
  });

  describe('3. getAccessibleQuoteById em access.ts', () => {
    it('NÃO deve permitir que corretor subordinado acesse cotação com partner_user_id NULL', async () => {
      const brokerUser = {
        userId: 'broker-10',
        partnerId: 'partner-100',
        role: 'partner_broker',
      };

      vi.mocked(getPartnerAccessContext).mockResolvedValue({
        isCorretoraUser: false,
        partnerId: 'partner-100',
        corretoraId: null,
        visibleUserIds: ['broker-10'],
      } as any);

      // Simula query de cotacao
      mockSql.mockResolvedValueOnce([]);

      await getAccessibleQuoteById('quote-null-user', brokerUser as any);

      const templateCall = mockSql.mock.calls.find((call: any) => Array.isArray(call[0]) && 'raw' in call[0]);
      expect(templateCall).toBeDefined();
      const queryText = templateCall[0].join(' ');

      expect(queryText).not.toMatch(/OR\s+partner_user_id\s+IS\s+NULL/i);
    });
  });
});
