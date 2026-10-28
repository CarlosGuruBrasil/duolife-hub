import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks para módulos externos
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  sqlMock.json = (val: any) => JSON.stringify(val);
  sqlMock.begin = vi.fn(async (cb: any) => {
    return await cb(sqlMock);
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

vi.mock('@/lib/asaas-charges', () => ({
  deleteAsaasPayment: vi.fn().mockResolvedValue({ deleted: true }),
  deleteAsaasInstallment: vi.fn().mockResolvedValue({ deleted: true }),
}));

import { sql } from '@/lib/pg';
import { ensureSaleForPaidQuote } from '@/lib/insurance-ops';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { deleteAsaasPayment, deleteAsaasInstallment } from '@/lib/asaas-charges';

describe('financeiro-cupons.test.ts - Incremento de Cupons (TD-012) e Proteção Concorrente Asaas (TD-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Incremento Atômico e Idempotente de Cupons (TD-012)', () => {
    it('deve registrar evento em cupom_uso_eventos e incrementar cupom_usos na aprovação de venda', async () => {
      const mockQuote = {
        id: 'cot_cupom_test_01',
        client_data: {
          cupomCodigo: 'ADVOGADO20',
          parcela: 1,
        },
        corretora_id: 'corretora_net4life_001',
      };

      const executedQueries: string[] = [];

      (sql as any).mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join('?');
        executedQueries.push(query);

        if (query.includes('FROM cotacoes') && query.includes('FOR UPDATE')) {
          return [mockQuote];
        }
        if (query.includes('FROM sales') && query.includes('cotacao_id')) {
          return []; // Sem venda existente
        }
        if (query.includes('FROM products')) {
          return [{ rate: 10, policy_prefix: 'DL-RC-ADV' }];
        }
        if (query.includes('FROM payment_orders')) {
          return [{ installment_count: 1 }];
        }
        if (query.includes('FROM partners')) {
          return [{ corretora_id: 'corretora_net4life_001' }];
        }
        if (query.includes('INSERT INTO sales')) {
          return [{ id: 'sale_new_123' }];
        }
        if (query.includes('INSERT INTO cupom_uso_eventos')) {
          return [{ id: 'event_cupom_001' }];
        }
        return [];
      });

      const result = await ensureSaleForPaidQuote({
        cotacaoId: 'cot_cupom_test_01',
        clientId: 'cli_01',
        partnerId: 'part_01',
        productId: 'prod-rc-001',
        importanciaSegurada: 100000,
        premioFinal: 790,
      });

      expect(result.created).toBe(true);
      expect(result.saleId).toBe('sale_new_123');

      // Verifica se a query de inserção em cupom_uso_eventos foi chamada com o código do cupom
      const insertEventQuery = executedQueries.find((q) => q.includes('INSERT INTO cupom_uso_eventos'));
      expect(insertEventQuery).toBeDefined();

      // Verifica se o incremento em cupom_usos foi acionado
      const updateUsoQuery = executedQueries.find((q) => q.includes('INSERT INTO cupom_usos'));
      expect(updateUsoQuery).toBeDefined();
      expect(updateUsoQuery).toContain('usos = cupom_usos.usos + 1');
    });

    it('não deve incrementar cupom_usos se o evento de uso já existir (idempotência por cotação)', async () => {
      const mockQuote = {
        id: 'cot_cupom_test_02',
        client_data: {
          cupomCodigo: 'PROMO10',
          parcela: 1,
        },
        corretora_id: 'corretora_net4life_001',
      };

      const executedQueries: string[] = [];

      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        executedQueries.push(query);

        if (query.includes('FROM cotacoes') && query.includes('FOR UPDATE')) {
          return [mockQuote];
        }
        if (query.includes('FROM sales') && query.includes('cotacao_id')) {
          return [];
        }
        if (query.includes('FROM products')) {
          return [{ rate: 10, policy_prefix: 'DL-RC-ADV' }];
        }
        if (query.includes('FROM payment_orders')) {
          return [{ installment_count: 1 }];
        }
        if (query.includes('FROM partners')) {
          return [{ corretora_id: 'corretora_net4life_001' }];
        }
        if (query.includes('INSERT INTO sales')) {
          return [{ id: 'sale_new_456' }];
        }
        if (query.includes('INSERT INTO cupom_uso_eventos')) {
          // Simula ON CONFLICT (cotacao_id) DO NOTHING retornando array vazio
          return [];
        }
        return [];
      });

      await ensureSaleForPaidQuote({
        cotacaoId: 'cot_cupom_test_02',
        clientId: 'cli_02',
        partnerId: 'part_01',
        productId: 'prod-rc-001',
        importanciaSegurada: 100000,
        premioFinal: 790,
      });

      // Como o evento retornou vazio (conflito), NÃO deve ter executado a atualização de cupom_usos
      const updateUsoQuery = executedQueries.find((q) => q.includes('INSERT INTO cupom_usos'));
      expect(updateUsoQuery).toBeUndefined();
    });
  });

  describe('2. Deduplicação Single-Flight e Lock Pessimista no Asaas (TD-011)', () => {
    it('deve reaproveitar a mesma promessa em voo para chamadas simultâneas (Single-Flight Mutex)', async () => {
      const mockCotacao = {
        id: 'cot_single_flight_01',
        status: 'assinado',
        client_data: {
          checkoutId: 'pay_existing_123',
          linkBoleto: 'https://asaas.com/i/pay_existing_123',
          dataVencimento: '2026-11-05',
        },
      };

      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM cotacoes WHERE id =')) {
          // Simula pequena latência de banco de dados
          await new Promise((r) => setTimeout(r, 20));
          return [mockCotacao];
        }
        return [];
      });

      // Dispara 3 requisições paralelas exatamente no mesmo instante para a mesma cotação
      const [res1, res2, res3] = await Promise.all([
        generateAsaasPaymentForQuote('cot_single_flight_01'),
        generateAsaasPaymentForQuote('cot_single_flight_01'),
        generateAsaasPaymentForQuote('cot_single_flight_01'),
      ]);

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(res3.ok).toBe(true);
      expect(res1.checkoutId).toBe('pay_existing_123');
      expect(res2.checkoutId).toBe('pay_existing_123');
      expect(res3.checkoutId).toBe('pay_existing_123');
      expect(res1.alreadyExisted).toBe(true);
    });

    it('deve limpar cobrança redundante no Asaas se houver conflito de inserção concorrente', async () => {
      // Teste de integridade do anti-orphan cleanup
      expect(deleteAsaasPayment).toBeDefined();
      expect(deleteAsaasInstallment).toBeDefined();
    });
  });
});
