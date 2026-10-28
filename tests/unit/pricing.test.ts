import { describe, it, expect, beforeAll } from 'vitest';

// Configuração do mock de global._pg para execução estritamente em memória (sem conexão TCP)
const offlineSqlMock = ((..._args: any[]) => Promise.resolve([])) as any;
offlineSqlMock.unsafe = () => Promise.resolve([]);
offlineSqlMock.json = (val: any) => JSON.stringify(val);
offlineSqlMock.array = (val: any) => val;
(global as any)._pg = offlineSqlMock;

import { calcularPrecoServidor, parseMoneyToNumber, FALLBACK_PLANOS } from '@/lib/pricing';
import { RAMOS_REGISTRY } from '@/lib/product-schemas';

describe('pricing.test.ts - Cálculos Atuariais, Descontos e Arquitetura Multi-Ramo', () => {
  beforeAll(() => {
    (global as any)._pg = offlineSqlMock;
  });

  describe('RC Advogados (Ramo Principal)', () => {
    it('deve calcular corretamente RC Advogados 200k em 2 parcelas (2x de R$ 600,00)', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 2,
        flowKey: 'rc_advogados_v1',
      });

      expect(preco).not.toBeNull();
      expect(preco?.valorOriginal).toBe(1200);
      expect(preco?.valorTotal).toBe(1200);
      expect(preco?.qtdParcelas).toBe(2);
      expect(preco?.valorParcela).toBe(600);
      expect(preco?.descontoPercentual).toBe(0);
    });

    it('deve suportar flowKey legado "rc_professional_v1" resolvendo para RC Advogados', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 1,
        flowKey: 'rc_professional_v1',
      });

      expect(preco).not.toBeNull();
      expect(preco?.valorOriginal).toBe(1200);
      expect(preco?.qtdParcelas).toBe(1);
    });

    it('Plano 100k deve forçar estritamente 1x à vista mesmo se o cliente solicitar parcelamento', async () => {
      // Cliente tenta forjar 4 parcelas para o plano de 100k
      const preco = await calcularPrecoServidor({
        tipoDePlano: '100k',
        qtdParcelasSolicitada: 4,
        flowKey: 'rc_advogados_v1',
      });

      expect(preco).not.toBeNull();
      expect(preco?.qtdParcelas).toBe(1);
      expect(preco?.valorOriginal).toBe(680);
      expect(preco?.valorTotal).toBe(680);
      expect(preco?.valorParcela).toBe(680);
    });
  });

  describe('Trava Inegociável de Desconto Comercial (Máximo 40%)', () => {
    it('tentativa de desconto abusivo acima de 40% (ex: 50%) deve ser travada em exatamente 40%', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 1,
        flowKey: 'rc_medicos_v1',
        descontoManualPercent: 50, // Tentativa acima do teto regulatório
      });

      expect(preco).not.toBeNull();
      expect(preco?.descontoPercentual).toBe(40);
      // Original: 1850. Com 40% de desconto (fator 0.60): 1850 * 0.60 = 1110
      expect(preco?.valorOriginal).toBe(1850);
      expect(preco?.valorTotal).toBe(1110);
      expect(preco?.valorDesconto).toBe(740);
    });

    it('desconto comercial válido de 25% com parcelamento em 2x', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 2,
        flowKey: 'rc_medicos_v1',
        descontoManualPercent: 25,
      });

      expect(preco).not.toBeNull();
      expect(preco?.descontoPercentual).toBe(25);
      // Original: 1850, Parcela 2X: 925
      // Desconto 25%: total = 1850 * 0.75 = 1387.50
      // Parcela com desconto: 925 * 0.75 = 693.75
      expect(preco?.valorOriginal).toBe(1850);
      expect(preco?.valorTotal).toBe(1387.5);
      expect(preco?.valorParcela).toBe(693.75);
      expect(preco?.qtdParcelas).toBe(2);
    });
  });

  describe('Arquitetura Multi-Ramo (RC Médicos, D&O Executivos)', () => {
    it('deve calcular corretamente RC Médicos 200k em 3 parcelas', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 3,
        flowKey: 'rc_medicos_v1',
      });

      expect(preco).not.toBeNull();
      expect(preco?.valorOriginal).toBe(1850);
      expect(preco?.qtdParcelas).toBe(3);
      expect(preco?.valorParcela).toBe(616.67);
    });

    it('deve calcular seguro D&O Executivos 1M em 4 parcelas', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '1M',
        qtdParcelasSolicitada: 4,
        flowKey: 'do_executivos_v1',
      });

      expect(preco).not.toBeNull();
      expect(preco?.valorOriginal).toBeGreaterThan(0);
      expect(preco?.qtdParcelas).toBe(4);
    });

    it('deve retornar null para ramo não registrado ou inexistente', async () => {
      const preco = await calcularPrecoServidor({
        tipoDePlano: '200k',
        qtdParcelasSolicitada: 1,
        flowKey: 'ramo_inexistente_xyz',
      });

      expect(preco).toBeNull();
    });

    it('deve retornar null quando tipoDePlano for nulo ou vazio', async () => {
      expect(await calcularPrecoServidor({ tipoDePlano: null, qtdParcelasSolicitada: 1 })).toBeNull();
      expect(await calcularPrecoServidor({ tipoDePlano: undefined, qtdParcelasSolicitada: 1 })).toBeNull();
      expect(await calcularPrecoServidor({ tipoDePlano: '', qtdParcelasSolicitada: 1 })).toBeNull();
    });
  });

  describe('parseMoneyToNumber', () => {
    it('deve converter valores monetários em formato pt-BR para number', () => {
      expect(parseMoneyToNumber('R$ 1.200,00')).toBe(1200);
      expect(parseMoneyToNumber('1.850,50')).toBe(1850.5);
      expect(parseMoneyToNumber('680')).toBe(680);
      expect(parseMoneyToNumber(null)).toBe(0);
      expect(parseMoneyToNumber(undefined)).toBe(0);
    });
  });
});
