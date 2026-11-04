import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);
  return { mockSql: sqlFn };
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

import { getCorretoraParaContrato } from '@/lib/corretora-resolver';

describe('corretora-resolver-query.test.ts - getCorretoraParaContrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve resolver corretamente os dados da corretora e do parceiro sem erros de coluna', async () => {
    // 1ª query: busca cotacao + partner
    mockSql.mockResolvedValueOnce([
      {
        corretora_id: null,
        partner_id: 'part_123',
        partner_corretora_id: 'corr_456',
        partner_metadata: { whiteLabel: { companyName: 'Parceiro VIP' } },
        partner_name: 'Parceiro VIP',
        partner_company_name: 'Parceiro VIP Corretagem Ltda',
        partner_document: '12.345.678/0001-90',
        partner_email: 'contato@parceirovip.com.br',
        partner_phone: '11999998888',
        partner_address: { street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP', cep: '01310-100' },
      },
    ]);

    // 2ª query: busca corretora pelo targetCorretoraId ('corr_456')
    mockSql.mockResolvedValueOnce([
      {
        id: 'corr_456',
        razao_social: 'Corretora Mãe Ltda',
        nome_fantasia: 'Corretora Mãe',
        cnpj: '98.765.432/0001-10',
        susep: '12345',
        email: 'mae@corretora.com.br',
        phone: '1133334444',
        address: {},
        metadata: {},
        logo_base64: null,
        logo_mime_type: null,
      },
    ]);

    const result = await getCorretoraParaContrato('cot_test_001');

    expect(result).toBeDefined();
    expect(result.id).toBe('corr_456');
    expect(result.nomeFantasia).toBe('Parceiro VIP');
    expect(result.isWhiteLabel).toBe(true);
    expect(result.cnpj).toBe('12.345.678/0001-90');
    expect(result.cidade).toBe('São Paulo');
  });

  it('deve fazer fallback transparente para Net4Life default caso ocorra erro no banco de dados', async () => {
    // Simula erro de conexão ou de query no banco
    mockSql.mockRejectedValueOnce(new Error('column p.name does not exist'));

    const result = await getCorretoraParaContrato('cot_test_err');

    expect(result).toBeDefined();
    expect(result.id).toBe('default');
    expect(result.nomeFantasia).toBe('NET4LIFE');
    expect(result.isNet4Life).toBe(true);
    expect(result.email).toBe('contato@net4life.com.br');
  });
});
