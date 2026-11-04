import { describe, it, expect } from 'vitest';
import {
  findMatchingPlanoInLists,
  reconciliarPlanoComCatalogo,
  calcularOpcoesParcelamentoForm,
  buildFallbackPlanoFromClientData,
  resolverSelecaoParcela,
} from '@/lib/plan-resolution';
import { rcAdvogadosConfig } from '@/lib/product-schemas/definitions/rc-advogados';
import { Plano } from '@/components/portal/DynamicCotacaoForm';

describe('draft-parcelamento-restoration.test.ts - Resolução e Restauração de Parcelas ao Retomar Rascunho', () => {
  const catalogoAdvogados = rcAdvogadosConfig.planos as Plano[];

  describe('Cenário 1: Reconciliação de Plano vindo de Rascunho', () => {
    it('deve encontrar o plano canônico correspondente no catálogo mesmo quando cd.tipo for "200k" ou nome do plano', () => {
      const candidato = findMatchingPlanoInLists('200k', [catalogoAdvogados]);
      expect(candidato).not.toBeNull();
      expect(candidato?.tipoDePlano).toBe('200k');
      expect(candidato?.parcela2X).toBe('R$ 600,00');
      expect(candidato?.parcela3X).toBe('R$ 400,00');
      expect(candidato?.parcela4X).toBe('R$ 300,00');
      expect(candidato?.parcela6X).toBe('R$ 200,00');
    });

    it('quando o rascunho anterior possui propriedades de parcela indefinidas, reconciliarPlanoComCatalogo NÃO deve sobrescrever com undefined', () => {
      // Simula o estado que vinha de loadCotacao onde parcela2X-6X eram undefined
      const planoRascunhoIncompleto: Plano = {
        tipoDePlano: '200k',
        nomeExibido: 'Plano 200 Mil',
        cobertura: 'R$ 200.000,00',
        franquia: 'R$ 2.000,00',
        ordem: 2,
        parcela: '871,00',
        parcela2X: undefined,
        parcela3X: undefined,
        parcela4X: undefined,
        parcela5X: undefined,
        parcela6X: undefined,
      };

      const planoCatalogo = catalogoAdvogados.find((p) => p.tipoDePlano === '200k')!;
      const planoReconciliado = reconciliarPlanoComCatalogo(planoRascunhoIncompleto, planoCatalogo);

      // Deve manter as opções de parcelamento do catálogo
      expect(planoReconciliado.parcela2X).toBe('R$ 600,00');
      expect(planoReconciliado.parcela3X).toBe('R$ 400,00');
      expect(planoReconciliado.parcela4X).toBe('R$ 300,00');
      expect(planoReconciliado.parcela6X).toBe('R$ 200,00');
      expect(planoReconciliado.maxParcelas).toBe(6);
    });
  });

  describe('Cenário 2: Cálculo das Opções de Parcelamento ao Retomar Rascunho', () => {
    it('para plano 200k retomado do rascunho, NÃO deve sumir o parcelamento e deve oferecer opções 1x, 2x, 3x, 4x, 6x', () => {
      const planoCatalogo = catalogoAdvogados.find((p) => p.tipoDePlano === '200k')!;
      const opcoes = calcularOpcoesParcelamentoForm(planoCatalogo, 0, 0, 'rc-advogados');

      expect(opcoes.length).toBeGreaterThan(1);
      expect(opcoes.map((o) => o.qtd)).toEqual([1, 2, 3, 4, 6]);
    });

    it('se o plano for sintetizado a partir de client_data sem parcela2X e não estiver no catálogo, deve permitir parcelamento linear', () => {
      const planoSintetico: Plano = {
        tipoDePlano: 'custom_plano',
        nomeExibido: 'Plano Especial Customizado',
        cobertura: 'R$ 200.000,00',
        franquia: 'R$ 2.000,00',
        ordem: 1,
        parcela: '871,00',
        maxParcelas: 6,
      };

      const opcoes = calcularOpcoesParcelamentoForm(planoSintetico, 0, 0, 'rc-advogados');

      // Não pode ficar somente com 1 opção se maxParcelas === 6
      expect(opcoes.length).toBeGreaterThan(1);
      expect(opcoes[0]).toEqual({ qtd: 1, valor: 871 });
      expect(opcoes.find((o) => o.qtd === 2)).toBeDefined();
      expect(opcoes.find((o) => o.qtd === 3)).toBeDefined();
    });

    it('para plano 100k, deve continuar retornando estritamente 1x (à vista)', () => {
      const plano100k = catalogoAdvogados.find((p) => p.tipoDePlano === '100k')!;
      const opcoes = calcularOpcoesParcelamentoForm(plano100k, 0, 0, 'rc-advogados');

      expect(opcoes).toHaveLength(1);
      expect(opcoes[0].qtd).toBe(1);
    });
  });

  describe('Cenário 3: Preservação da Parcela Selecionada Anteriormente', () => {
    it('se o cliente havia selecionado 3x no rascunho, a seleção deve ser mantida em 3x ao reabrir o formulário', () => {
      const planoCatalogo = catalogoAdvogados.find((p) => p.tipoDePlano === '200k')!;
      const opcoes = calcularOpcoesParcelamentoForm(planoCatalogo, 0, 0, 'rc-advogados');

      // Seleção anterior: 3x
      const selecaoAnterior = { qtd: 3, valor: 400 };
      const selecaoResolvida = resolverSelecaoParcela(opcoes, selecaoAnterior);

      expect(selecaoResolvida).not.toBeNull();
      expect(selecaoResolvida?.qtd).toBe(3);
    });

    it('se a cotação estava em 1x e opções forem múltiplas, o usuário pode escolher outras parcelas e a seleção inicial fica em 1x', () => {
      const planoCatalogo = catalogoAdvogados.find((p) => p.tipoDePlano === '200k')!;
      const opcoes = calcularOpcoesParcelamentoForm(planoCatalogo, 0, 0, 'rc-advogados');

      const selecaoAnterior = { qtd: 1, valor: 1200 };
      const selecaoResolvida = resolverSelecaoParcela(opcoes, selecaoAnterior);

      expect(selecaoResolvida?.qtd).toBe(1);
      expect(opcoes.length).toBe(5); // 1x, 2x, 3x, 4x, 6x disponíveis para o usuário clicar
    });
  });

  describe('Cenário 4: Construção de Fallback Seguro de Plano a partir de client_data', () => {
    it('deve gerar plano completo com parcelas calculadas se não for encontrado em nenhum catálogo', () => {
      const cd = {
        tipo: 'plano_especial',
        nomePlano: 'Plano Especial 200 Mil',
        valor: 1200,
        maxParcelas: 6,
      };

      const fallbackPlano = buildFallbackPlanoFromClientData(cd, rcAdvogadosConfig);
      expect(fallbackPlano.tipoDePlano).toBe('plano_especial');
      expect(fallbackPlano.parcela).toBe('1200');
      expect(fallbackPlano.parcela2X).toBeDefined();
      expect(fallbackPlano.parcela3X).toBeDefined();
      expect(fallbackPlano.maxParcelas).toBe(6);
    });
  });
});
