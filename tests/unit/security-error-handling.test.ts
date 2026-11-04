import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';
import { POST as gerarCobranca } from '../../app/api/admin/cotacoes/[id]/gerar-cobranca/route';
import { PATCH as alterarCobranca } from '../../app/api/admin/cotacoes/[id]/cobranca/route';

// Mocks
vi.mock('@/lib/auth', () => ({
  verifyAdminAuth: vi.fn().mockResolvedValue({ id: 'admin-1', role: 'admin' }),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
}));

vi.mock('@/lib/asaas-service', () => ({
  generateAsaasPaymentForQuote: vi.fn().mockImplementation(() => {
    throw new Error('FATAL: password authentication failed for user "postgres" at TCP /var/run/postgresql');
  }),
}));

vi.mock('@/lib/asaas-charges', () => ({
  updateAsaasPayment: vi.fn(),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn().mockImplementation(() => {
    throw new Error('FATAL: relation "payment_orders" does not exist at character 45');
  });
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Task 10: Mitigação de IP Spoofing e Sanitização de Erros HTTP 500 (VULN-11, VULN-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Sanitização de Erros HTTP 500 em rotas administrativas (VULN-12)', () => {
    it('gerar-cobranca não deve vazar mensagens internas de erro ou detalhes de infraestrutura no JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/cotacoes/cot_123/gerar-cobranca', {
        method: 'POST',
        body: JSON.stringify({ valorTotal: 100 }),
      });

      const res = await gerarCobranca(req, { params: Promise.resolve({ id: 'cot_123' }) });
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data.ok).toBe(false);
      // Mensagem NÃO pode conter detalhes do erro de banco/driver
      expect(data.error).not.toMatch(/postgres|FATAL|password|TCP/i);
      expect(data.error).toBe('Erro interno ao processar cobrança');
    });

    it('alterar-cobranca não deve vazar mensagens internas de erro ou detalhes de SQL no JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/cotacoes/cot_123/cobranca', {
        method: 'PATCH',
        body: JSON.stringify({ valorTotal: 150 }),
      });

      const res = await alterarCobranca(req, { params: Promise.resolve({ id: 'cot_123' }) });
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data.ok).toBe(false);
      // Mensagem NÃO pode conter detalhes do erro de SQL
      expect(data.error).not.toMatch(/payment_orders|FATAL|character 45/i);
      expect(data.error).toBe('Erro interno ao atualizar cobrança');
    });
  });
});
