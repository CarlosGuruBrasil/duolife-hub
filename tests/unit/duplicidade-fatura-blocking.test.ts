import { describe, it, expect, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';

describe('Bloqueio de Cobrança para Cotações com Duplicidade Pendente', () => {
  it('deve rejeitar a geração de pagamento com erro claro quando status for pendente_duplicidade', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'cotacao-dup-1',
        status: 'pendente_duplicidade',
        client_id: 'client-1',
        client_data: {},
      },
    ]);

    const result = await generateAsaasPaymentForQuote('cotacao-dup-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('duplicidade cadastral pendente');
  });
});
