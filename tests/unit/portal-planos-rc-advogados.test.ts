import { describe, it, expect } from 'vitest';
import { rcAdvogadosConfig } from '@/lib/product-schemas/definitions/rc-advogados';
import { findMatchingPlanoInLists, calcularOpcoesParcelamentoForm, type Plano } from '@/lib/plan-resolution';

describe('portal-planos-rc-advogados.test.ts - Catálogo Completo RC Advogados (100k até 3 Milhões)', () => {
  const planos = rcAdvogadosConfig.planos as Plano[];

  it('deve conter todas as 7 faixas canônicas até 3 Milhões no catálogo estático de contingência', () => {
    const tipos = planos.map((p) => p.tipoDePlano);
    expect(tipos).toContain('100k');
    expect(tipos).toContain('300k');
    expect(tipos).toContain('500k');
    expect(tipos).toContain('1mi');
    expect(tipos).toContain('1.5mi');
    expect(tipos).toContain('2mi');
    expect(tipos).toContain('3mi');
  });

  it('deve resolver corretamente o plano 1mi com suas opções de parcelamento', () => {
    const plano1mi = findMatchingPlanoInLists('1mi', [planos]);
    expect(plano1mi).not.toBeNull();
    expect(plano1mi?.cobertura).toBe('R$ 1.000.000,00');
    expect(plano1mi?.parcela).toBe('R$ 2.033,33');
    expect(plano1mi?.parcela2X).toBe('R$ 1.016,67');
    expect(plano1mi?.parcela6X).toBe('R$ 363,00');

    const opcoes = calcularOpcoesParcelamentoForm(plano1mi!, 0, 0, 'rc-advogados');
    expect(opcoes.map((o) => o.qtd)).toEqual([1, 2, 3, 4, 6]);
    expect(opcoes[0].valor).toBe(2033.33);
    expect(opcoes[1].valor).toBe(1016.67);
  });

  it('deve resolver o plano 3mi com cobertura máxima e franquia de R$ 3.000,00', () => {
    const plano3mi = findMatchingPlanoInLists('3mi', [planos]);
    expect(plano3mi).not.toBeNull();
    expect(plano3mi?.cobertura).toBe('R$ 3.000.000,00');
    expect(plano3mi?.franquia).toBe('R$ 3.000,00');
    expect(plano3mi?.parcela).toBe('R$ 4.336,67');
    expect(plano3mi?.parcela6X).toBe('R$ 774,21');
  });
});
