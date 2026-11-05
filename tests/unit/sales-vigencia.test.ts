import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseVigenciaDate, ensureSaleForPaidQuote } from '@/lib/insurance-ops';
import { sql } from '@/lib/pg';

vi.mock('@/lib/pg', () => {
  const mockBegin = vi.fn(async (cb: (tx: any) => Promise<any>) => {
    return cb(mockTx);
  });

  const mockTx: any = vi.fn();
  const mockSql: any = vi.fn();
  mockSql.begin = mockBegin;

  return { sql: mockSql };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('sales-vigencia.test.ts - Regras de Vigência Inicial e Final de Apólices Emitidas', () => {
  describe('parseVigenciaDate', () => {
    it('deve extrair data no formato ISO YYYY-MM-DD', () => {
      expect(parseVigenciaDate('2026-10-06')).toBe('2026-10-06');
      expect(parseVigenciaDate('2026-10-06T15:30:00.000Z')).toBe('2026-10-06');
    });

    it('deve converter data no formato brasileiro DD/MM/YYYY para ISO YYYY-MM-DD', () => {
      expect(parseVigenciaDate('06/10/2026')).toBe('2026-10-06');
      expect(parseVigenciaDate('31/10/2026')).toBe('2026-10-31');
    });

    it('deve suportar instâncias de Date nativas', () => {
      const date = new Date(Date.UTC(2026, 9, 6)); // 2026-10-06
      expect(parseVigenciaDate(date)).toBe('2026-10-06');
    });

    it('deve retornar null para valores inválidos ou vazios', () => {
      expect(parseVigenciaDate(null)).toBeNull();
      expect(parseVigenciaDate(undefined)).toBeNull();
      expect(parseVigenciaDate('')).toBeNull();
      expect(parseVigenciaDate('invalido')).toBeNull();
    });
  });

  describe('ensureSaleForPaidQuote - vigência pela data da proposta / inclusão no sistema', () => {
    let queriesExecuted: string[] = [];
    let queryValues: any[] = [];

    beforeEach(() => {
      queriesExecuted = [];
      queryValues = [];
      vi.clearAllMocks();
    });

    it('deve utilizar dataInicioVigencia da cotação para issue_date e expiry_date', async () => {
      const mockQuote = {
        id: 'cot_test_vigencia_001',
        client_data: {
          dataInicioVigencia: '2026-10-06',
        },
        corretora_id: 'corretora_net4life_001',
        created_at: new Date('2026-10-06T10:00:00Z'),
      };

      const mockTx: any = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join('?');
        queriesExecuted.push(queryText);
        queryValues.push(values);

        // 1. SELECT cotacoes
        if (queryText.includes('FROM cotacoes')) {
          return [mockQuote];
        }
        // 2. SELECT sales (existing)
        if (queryText.includes('FROM sales') && queryText.includes('WHERE cotacao_id')) {
          return [];
        }
        // 3. SELECT products
        if (queryText.includes('FROM products')) {
          return [{ rate: 10, policy_prefix: 'DL-RC-ADV' }];
        }
        // 4. SELECT payment_orders
        if (queryText.includes('FROM payment_orders')) {
          return [{ installment_count: 1 }];
        }
        // 5. SELECT partners
        if (queryText.includes('FROM partners')) {
          return [{ corretora_id: 'corretora_net4life_001' }];
        }
        // 6. INSERT INTO sales
        if (queryText.includes('INSERT INTO sales')) {
          return [{ id: 'sale_test_created_001' }];
        }
        // 7. INSERT INTO commissions
        if (queryText.includes('INSERT INTO commissions')) {
          return [{ id: 'comm_001' }];
        }
        return [];
      });

      (sql.begin as any).mockImplementationOnce(async (cb: any) => cb(mockTx));

      const result = await ensureSaleForPaidQuote({
        cotacaoId: 'cot_test_vigencia_001',
        clientId: 'client_001',
        partnerId: 'partner_001',
        productId: 'prod-rc-001',
        importanciaSegurada: 100000,
        premioFinal: 310,
      });

      expect(result.created).toBe(true);
      expect(result.saleId).toBe('sale_test_created_001');

      // Verifica que no INSERT INTO sales, o valor passado para issue_date é '2026-10-06'
      const insertSalesCall = queriesExecuted.findIndex((q) => q.includes('INSERT INTO sales'));
      expect(insertSalesCall).toBeGreaterThanOrEqual(0);
      const insertValues = queryValues[insertSalesCall];

      // issue_date deve ser '2026-10-06'
      expect(insertValues).toContain('2026-10-06');
    });

    it('deve fazer fallback para created_at da cotação se dataInicioVigencia não estiver no client_data (NUNCA data atual/pagamento)', async () => {
      const mockQuote = {
        id: 'cot_test_vigencia_002',
        client_data: {}, // Sem dataInicioVigencia
        corretora_id: 'corretora_net4life_001',
        created_at: new Date('2026-10-06T14:20:00Z'), // Data de inclusão no sistema
      };

      const mockTx: any = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join('?');
        queriesExecuted.push(queryText);
        queryValues.push(values);

        if (queryText.includes('FROM cotacoes')) return [mockQuote];
        if (queryText.includes('FROM sales') && queryText.includes('WHERE cotacao_id')) return [];
        if (queryText.includes('FROM products')) return [{ rate: 10, policy_prefix: 'DL-RC-ADV' }];
        if (queryText.includes('FROM payment_orders')) return [{ installment_count: 1 }];
        if (queryText.includes('FROM partners')) return [{ corretora_id: 'corretora_net4life_001' }];
        if (queryText.includes('INSERT INTO sales')) return [{ id: 'sale_test_created_002' }];
        if (queryText.includes('INSERT INTO commissions')) return [{ id: 'comm_002' }];
        return [];
      });

      (sql.begin as any).mockImplementationOnce(async (cb: any) => cb(mockTx));

      const result = await ensureSaleForPaidQuote({
        cotacaoId: 'cot_test_vigencia_002',
        clientId: 'client_002',
        partnerId: 'partner_001',
        productId: 'prod-rc-001',
        importanciaSegurada: 100000,
        premioFinal: 310,
      });

      expect(result.created).toBe(true);

      const insertSalesCall = queriesExecuted.findIndex((q) => q.includes('INSERT INTO sales'));
      expect(insertSalesCall).toBeGreaterThanOrEqual(0);
      const insertValues = queryValues[insertSalesCall];

      // O issue_date deve ter herdado '2026-10-06' de created_at da cotação
      expect(insertValues).toContain('2026-10-06');
    });
  });
});
