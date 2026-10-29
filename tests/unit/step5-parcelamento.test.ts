import { describe, it, expect } from 'vitest';
import { parseCurrencyToNumber } from '@/lib/format';

function parseMoneyToFloat(val?: string | number | null): number {
  return parseCurrencyToNumber(val, 0);
}

interface TestPlano {
  tipoDePlano: string;
  cobertura: string;
  parcela: string;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
}

function calcularOpcoesParcelamento(
  plano: TestPlano,
  descontoPercentual: number = 0,
  cupomDesconto: number = 0
) {
  const valorOriginal = parseMoneyToFloat(plano.parcela);
  const maiorDesconto = Math.max(descontoPercentual, cupomDesconto);
  const fatorDesconto = 1 - maiorDesconto / 100;
  const valorComDesconto = Math.round(valorOriginal * fatorDesconto * 100) / 100;

  const parseParcela = (parcStr?: string) => {
    if (!parcStr) return 0;
    return Math.round(parseMoneyToFloat(parcStr) * fatorDesconto * 100) / 100;
  };

  const opcoes = [
    { qtd: 1, valor: valorComDesconto },
    { qtd: 2, valor: parseParcela(plano.parcela2X) || Math.round((valorComDesconto / 2) * 100) / 100 },
    { qtd: 3, valor: parseParcela(plano.parcela3X) || Math.round((valorComDesconto / 3) * 100) / 100 },
    { qtd: 4, valor: parseParcela(plano.parcela4X) || Math.round((valorComDesconto / 4) * 100) / 100 },
    { qtd: 5, valor: parseParcela(plano.parcela5X) || Math.round((valorComDesconto / 5) * 100) / 100 },
    { qtd: 6, valor: parseParcela(plano.parcela6X) || Math.round((valorComDesconto / 6) * 100) / 100 },
  ];

  if (String(plano.tipoDePlano || '').toLowerCase() === '100k') {
    return [opcoes[0]];
  }

  const validKeys: (keyof TestPlano)[] = ['parcela', 'parcela2X', 'parcela3X', 'parcela4X', 'parcela5X', 'parcela6X'];
  return opcoes.filter((op, i) => {
    const key = validKeys[i];
    return plano[key] && plano[key] !== '' && plano[key] !== 'R$ 0,00';
  });
}

function resolverSelecaoParcela(
  opcoes: { qtd: number; valor: number }[],
  parcelaAtual: { qtd: number; valor: number } | null
): { qtd: number; valor: number } | null {
  if (opcoes.length === 1) {
    const opUnica = opcoes[0];
    return { qtd: opUnica.qtd, valor: opUnica.valor };
  }
  if (parcelaAtual) {
    const opCorrespondente = opcoes.find((op) => op.qtd === parcelaAtual.qtd);
    if (opCorrespondente) {
      return { qtd: opCorrespondente.qtd, valor: opCorrespondente.valor };
    }
  }
  return parcelaAtual;
}

describe('step5-parcelamento.test.ts - Regras do Passo 5 de Condições de Pagamento', () => {
  const plano100k: TestPlano = {
    tipoDePlano: '100k',
    cobertura: 'R$ 100.000,00',
    parcela: 'R$ 516,67',
  };

  const plano200k: TestPlano = {
    tipoDePlano: '200k',
    cobertura: 'R$ 200.000,00',
    parcela: 'R$ 1.200,00',
    parcela2X: 'R$ 600,00',
    parcela3X: 'R$ 400,00',
  };

  describe('Cenário À Vista Obrigatório (Plano 100k)', () => {
    it('deve retornar exatamente 1 opção à vista de R$ 516,67 sem desconto', () => {
      const opcoes = calcularOpcoesParcelamento(plano100k, 0, 0);
      expect(opcoes).toHaveLength(1);
      expect(opcoes[0]).toEqual({ qtd: 1, valor: 516.67 });
    });

    it('ao entrar no Passo 5 com parcelaAtual null, deve selecionar a opção à vista automaticamente por padrão', () => {
      const opcoes = calcularOpcoesParcelamento(plano100k, 0, 0);
      const selecao = resolverSelecaoParcela(opcoes, null);
      expect(selecao).toEqual({ qtd: 1, valor: 516.67 });
    });

    it('ao aplicar cupom BONUS40 (40%), deve recalcular para R$ 310,00 e MANTER selecionado por padrão', () => {
      const opcoesComCupom = calcularOpcoesParcelamento(plano100k, 0, 40);
      expect(opcoesComCupom).toHaveLength(1);
      expect(opcoesComCupom[0]).toEqual({ qtd: 1, valor: 310 });

      // Mesmo que o estado anterior fosse null ou com valor de 516.67
      const selecaoAposCupom = resolverSelecaoParcela(opcoesComCupom, { qtd: 1, valor: 516.67 });
      expect(selecaoAposCupom).toEqual({ qtd: 1, valor: 310 });
    });

    it('ao remover o cupom ou trocar de cupom, deve recalcular e manter a seleção à vista ativa', () => {
      // Cupom removido -> volta para R$ 516.67
      const opcoesSemCupom = calcularOpcoesParcelamento(plano100k, 0, 0);
      const selecaoSemCupom = resolverSelecaoParcela(opcoesSemCupom, { qtd: 1, valor: 310 });
      expect(selecaoSemCupom).toEqual({ qtd: 1, valor: 516.67 });

      // Novo cupom de 20% aplicado -> R$ 413.34
      const opcoesNovoCupom = calcularOpcoesParcelamento(plano100k, 0, 20);
      const selecaoNovoCupom = resolverSelecaoParcela(opcoesNovoCupom, selecaoSemCupom);
      expect(selecaoNovoCupom).toEqual({ qtd: 1, valor: 413.34 });
    });
  });

  describe('Cenário Multi-Parcelas (Plano 200k)', () => {
    it('deve retornar 3 opções de parcelamento (1x, 2x, 3x)', () => {
      const opcoes = calcularOpcoesParcelamento(plano200k, 0, 0);
      expect(opcoes).toHaveLength(3);
      expect(opcoes.map((o) => o.qtd)).toEqual([1, 2, 3]);
    });

    it('ao entrar no Passo 5, não deve auto-selecionar se o usuário ainda não escolheu', () => {
      const opcoes = calcularOpcoesParcelamento(plano200k, 0, 0);
      const selecao = resolverSelecaoParcela(opcoes, null);
      expect(selecao).toBeNull();
    });

    it('se o usuário selecionou 3x e aplicou cupom de 10%, deve preservar a 3ª parcela com o valor recalculado', () => {
      const opcoesIniciais = calcularOpcoesParcelamento(plano200k, 0, 0);
      const selecaoUsuario = { qtd: 3, valor: opcoesIniciais[2].valor }; // 400.00

      const opcoesComCupom = calcularOpcoesParcelamento(plano200k, 0, 10);
      const selecaoAtualizada = resolverSelecaoParcela(opcoesComCupom, selecaoUsuario);

      expect(selecaoAtualizada).toEqual({ qtd: 3, valor: 360 });
    });
  });
});
