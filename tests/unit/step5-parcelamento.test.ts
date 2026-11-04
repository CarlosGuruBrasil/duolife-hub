import { describe, it, expect } from 'vitest';
import {
  calcularOpcoesParcelamentoForm as calcularOpcoesParcelamento,
  resolverSelecaoParcela,
  type Plano,
} from '@/lib/plan-resolution';

type TestPlano = Partial<Plano>;

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
