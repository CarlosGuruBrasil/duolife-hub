import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PartnerAccessContext } from '@/lib/auth';
import type { PendenciasFiltros, PendenciaCancelamentoItem } from '@/types/pendencias-cancelamentos';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn((stringsOrArg: any, ..._values: any[]) => {
    return Promise.resolve([]);
  });
  fn.unsafe = vi.fn().mockImplementation((s: any) => s);
  fn.json = vi.fn((val: any) => JSON.stringify(val));
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

import {
  getPendenciasCancelamentosList,
  enrichItemWithBR031Rules,
} from '@/lib/pendencias-cancelamentos-service';

describe('pendencias-cancelamentos-service.test.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const internalAccess: PartnerAccessContext = {
    isInternal: true,
    isCorretoraUser: false,
    partnerId: null,
    corretoraId: null,
    partnerRole: null,
    role: 'duolife_admin',
    visibleUserIds: null,
  };

  describe('1. Deduplicação cotação vs venda', () => {
    it('deve retornar tipoRegistro "venda" e policyNumber quando cotacao possui venda vinculada', async () => {
      const mockKpis = {
        totalContratacoesEmAtraso: 1,
        valorTotalEmAtraso: 1500,
        totalContratacoesCanceladas: 0,
        valorOriginalTotalCanceladas: 0,
      };

      const mockItems = [
        {
          id: 'cot-1',
          cotacao_id: 'cot-1',
          sale_id: 'sale-1',
          tipo_registro: 'venda',
          policy_number: 'AP-2026-001',
          client_name: 'Cliente com Venda',
          client_cpf_cnpj: '123.456.789-00',
          client_email: 'cliente@teste.com',
          client_phone: '11999990001',
          corretora_id: 'corr-1',
          corretora_nome: 'Corretora Alfa',
          partner_id: 'part-1',
          partner_nome: 'Parceiro Alfa',
          manager_user_id: 'gest-1',
          manager_nome: 'Gestor Alfa',
          vendedor_user_id: 'vend-1',
          vendedor_nome: 'Vendedor Alfa',
          product_id: 'prod-rc-001',
          product_name: 'RC Profissional',
          valor_total_contratacao: 1500,
          situacao_raw: 'em_atraso',
          motivo_cancelamento: null,
          data_cancelamento: null,
          valor_recebido_antes_cancelamento: 500,
          qtd_parcelas_vencidas: 1,
          valor_total_atraso: 500,
          data_vencimento_mais_antiga: '2026-10-15',
          maior_dias_atraso: 10,
          parcelas: [
            {
              id: 'parc-1',
              installmentNumber: 1,
              amount: 500,
              dueDate: '2026-10-15',
              paidAt: null,
              status: 'pending',
              daysOverdue: 10,
              externalPaymentId: 'pay-001',
            },
          ],
          full_count: 1,
        },
      ];

      mockSql.mockResolvedValueOnce([mockKpis]);
      mockSql.mockResolvedValueOnce(mockItems);

      const result = await getPendenciasCancelamentosList(internalAccess, {
        tab: 'em_atraso',
      });

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.id).toBe('cot-1');
      expect(item.tipoRegistro).toBe('venda');
      expect(item.saleId).toBe('sale-1');
      expect(item.policyNumber).toBe('AP-2026-001');
      expect(item.valorTotalContratacao).toBe(1500);
    });

    it('deve retornar tipoRegistro "cotacao" e policyNumber nulo quando cotacao nao possui venda vinculada', async () => {
      const mockKpis = {
        totalContratacoesEmAtraso: 1,
        valorTotalEmAtraso: 1200,
        totalContratacoesCanceladas: 0,
        valorOriginalTotalCanceladas: 0,
      };

      const mockItems = [
        {
          id: 'cot-2',
          cotacao_id: 'cot-2',
          sale_id: null,
          tipo_registro: 'cotacao',
          policy_number: null,
          client_name: 'Cliente Só Cotação',
          client_cpf_cnpj: '987.654.321-99',
          client_email: 'cotacao@teste.com',
          client_phone: '11988887777',
          corretora_id: 'corr-1',
          corretora_nome: 'Corretora Alfa',
          partner_id: 'part-1',
          partner_nome: 'Parceiro Alfa',
          manager_user_id: null,
          manager_nome: null,
          vendedor_user_id: 'vend-1',
          vendedor_nome: 'Vendedor Alfa',
          product_id: 'prod-rc-001',
          product_name: 'RC Profissional',
          valor_total_contratacao: 1200,
          situacao_raw: 'em_atraso',
          motivo_cancelamento: null,
          data_cancelamento: null,
          valor_recebido_antes_cancelamento: 0,
          qtd_parcelas_vencidas: 1,
          valor_total_atraso: 1200,
          data_vencimento_mais_antiga: '2026-10-10',
          maior_dias_atraso: 15,
          parcelas: [
            {
              id: 'parc-2',
              installmentNumber: 1,
              amount: 1200,
              dueDate: '2026-10-10',
              paidAt: null,
              status: 'pending',
              daysOverdue: 15,
              externalPaymentId: 'pay-002',
            },
          ],
          full_count: 1,
        },
      ];

      mockSql.mockResolvedValueOnce([mockKpis]);
      mockSql.mockResolvedValueOnce(mockItems);

      const result = await getPendenciasCancelamentosList(internalAccess, {
        tab: 'em_atraso',
      });

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.id).toBe('cot-2');
      expect(item.tipoRegistro).toBe('cotacao');
      expect(item.saleId).toBeNull();
      expect(item.policyNumber).toBeNull();
      expect(item.valorTotalContratacao).toBe(1200);
    });
  });

  describe('2. Classificação de tolerância BR-031 (Parcela 1)', () => {
    it('deve classificar como em_atraso_tolerancia quando parcela 1 está em atraso de 1 dia útil', () => {
      // Quinta-feira 2026-10-15 venceu.
      // Prazo final (+2 dias úteis): Segunda-feira 2026-10-19.
      // Data de referência: Sexta-feira 2026-10-16 (1 dia útil de atraso).
      const item: PendenciaCancelamentoItem = {
        id: 'cot-tol-1',
        cotacaoId: 'cot-tol-1',
        saleId: 'sale-tol-1',
        tipoRegistro: 'venda',
        policyNumber: 'AP-TOL-001',
        clientName: 'Segurado Tolerância',
        clientCpfCnpj: '111.222.333-44',
        clientEmail: 'tol@teste.com',
        clientPhone: '11999991111',
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1000,
        situacaoContrato: 'em_atraso_tolerancia',
        qtdParcelasVencidas: 1,
        valorTotalAtraso: 1000,
        dataVencimentoMaisAntiga: '2026-10-15',
        maiorDiasAtraso: 1,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [
          {
            id: 'p-1',
            installmentNumber: 1,
            amount: 1000,
            dueDate: '2026-10-15',
            paidAt: null,
            status: 'pending',
            daysOverdue: 1,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-1',
          },
        ],
      };

      const enriched = enrichItemWithBR031Rules(item, '2026-10-16');

      expect(enriched.situacaoContrato).toBe('em_atraso_tolerancia');
      expect(enriched.parcelas[0].cancellationDeadline).toBe('2026-10-19');
      expect(enriched.parcelas[0].isPastDeadline).toBe(false);
      expect(enriched.dataLimiteCancelamentoMaisCritica).toBe('2026-10-19');
    });

    it('deve classificar como em_atraso_critico quando parcela 1 extrapolou 2 dias úteis', () => {
      // Quinta-feira 2026-10-15 venceu.
      // Prazo final (+2 dias úteis): Segunda-feira 2026-10-19.
      // Data de referência: Terça-feira 2026-10-20 (estritamente posterior ao prazo).
      const item: PendenciaCancelamentoItem = {
        id: 'cot-crit-1',
        cotacaoId: 'cot-crit-1',
        saleId: 'sale-crit-1',
        tipoRegistro: 'venda',
        policyNumber: 'AP-CRIT-001',
        clientName: 'Segurado Crítico',
        clientCpfCnpj: '111.222.333-44',
        clientEmail: 'crit@teste.com',
        clientPhone: '11999991111',
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1000,
        situacaoContrato: 'em_atraso_tolerancia',
        qtdParcelasVencidas: 1,
        valorTotalAtraso: 1000,
        dataVencimentoMaisAntiga: '2026-10-15',
        maiorDiasAtraso: 5,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [
          {
            id: 'p-1',
            installmentNumber: 1,
            amount: 1000,
            dueDate: '2026-10-15',
            paidAt: null,
            status: 'pending',
            daysOverdue: 5,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-1',
          },
        ],
      };

      const enriched = enrichItemWithBR031Rules(item, '2026-10-20');

      expect(enriched.situacaoContrato).toBe('em_atraso_critico');
      expect(enriched.parcelas[0].isPastDeadline).toBe(true);
      expect(enriched.parcelas[0].cancellationDeadline).toBe('2026-10-19');
    });
  });

  describe('3. Regra BR-031 para Parcelas > 1 (30 dias corridos com prorrogação)', () => {
    it('deve tolerar parcela 2 vencida há 10 dias corridos', () => {
      // Vencimento em 2026-10-01. Prazo final: +30 dias = 2026-10-31 (Sábado) -> Prorroga para Segunda 2026-11-03 (feriado Finados 02/11).
      // Data referência: 2026-10-11
      const item: PendenciaCancelamentoItem = {
        id: 'cot-p2-tol',
        cotacaoId: 'cot-p2-tol',
        saleId: 'sale-p2-tol',
        tipoRegistro: 'venda',
        policyNumber: 'AP-P2-001',
        clientName: 'Cliente Parcela 2 Tolerada',
        clientCpfCnpj: '222.333.444-55',
        clientEmail: 'p2@teste.com',
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1200,
        situacaoContrato: 'em_atraso_tolerancia',
        qtdParcelasVencidas: 1,
        valorTotalAtraso: 200,
        dataVencimentoMaisAntiga: '2026-10-01',
        maiorDiasAtraso: 10,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [
          {
            id: 'p-1',
            installmentNumber: 1,
            amount: 200,
            dueDate: '2026-09-01',
            paidAt: '2026-09-01T10:00:00Z',
            status: 'paid',
            daysOverdue: 0,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-1',
          },
          {
            id: 'p-2',
            installmentNumber: 2,
            amount: 200,
            dueDate: '2026-10-01',
            paidAt: null,
            status: 'pending',
            daysOverdue: 10,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-2',
          },
        ],
      };

      const enriched = enrichItemWithBR031Rules(item, '2026-10-11');

      expect(enriched.situacaoContrato).toBe('em_atraso_tolerancia');
      expect(enriched.parcelas[1].isPastDeadline).toBe(false);
    });

    it('deve classificar como crítico quando parcela 2 ultrapassa 30 dias corridos prorrogados', () => {
      // Vencimento em 2026-09-01. +30 dias = 2026-10-01 (Quinta-feira).
      // Data referência: 2026-10-05 (passou da deadline).
      const item: PendenciaCancelamentoItem = {
        id: 'cot-p2-crit',
        cotacaoId: 'cot-p2-crit',
        saleId: 'sale-p2-crit',
        tipoRegistro: 'venda',
        policyNumber: 'AP-P2-002',
        clientName: 'Cliente Parcela 2 Crítica',
        clientCpfCnpj: '222.333.444-55',
        clientEmail: 'p2@teste.com',
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1200,
        situacaoContrato: 'em_atraso_tolerancia',
        qtdParcelasVencidas: 1,
        valorTotalAtraso: 200,
        dataVencimentoMaisAntiga: '2026-09-01',
        maiorDiasAtraso: 34,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [
          {
            id: 'p-1',
            installmentNumber: 1,
            amount: 200,
            dueDate: '2026-08-01',
            paidAt: '2026-08-01T10:00:00Z',
            status: 'paid',
            daysOverdue: 0,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-1',
          },
          {
            id: 'p-2',
            installmentNumber: 2,
            amount: 200,
            dueDate: '2026-09-01',
            paidAt: null,
            status: 'pending',
            daysOverdue: 34,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-2',
          },
        ],
      };

      const enriched = enrichItemWithBR031Rules(item, '2026-10-05');

      expect(enriched.situacaoContrato).toBe('em_atraso_critico');
      expect(enriched.parcelas[1].isPastDeadline).toBe(true);
    });
  });

  describe('4. Ignorar parcelas com vencimento futuro', () => {
    it('parcelas futuras ou pagas não devem acionar atraso nem atraso crítico', () => {
      const item: PendenciaCancelamentoItem = {
        id: 'cot-futura',
        cotacaoId: 'cot-futura',
        saleId: 'sale-futura',
        tipoRegistro: 'venda',
        policyNumber: 'AP-FUT-001',
        clientName: 'Cliente em Dia',
        clientCpfCnpj: '333.444.555-66',
        clientEmail: 'futura@teste.com',
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 2400,
        situacaoContrato: 'em_atraso_tolerancia',
        qtdParcelasVencidas: 0,
        valorTotalAtraso: 0,
        dataVencimentoMaisAntiga: null,
        maiorDiasAtraso: 0,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [
          {
            id: 'p-1',
            installmentNumber: 1,
            amount: 400,
            dueDate: '2026-10-01',
            paidAt: '2026-10-01T09:00:00Z',
            status: 'paid',
            daysOverdue: 0,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-1',
          },
          {
            id: 'p-2',
            installmentNumber: 2,
            amount: 400,
            dueDate: '2026-11-01',
            paidAt: null,
            status: 'pending',
            daysOverdue: 0,
            cancellationDeadline: '',
            isPastDeadline: false,
            externalPaymentId: 'pay-2',
          },
        ],
      };

      const enriched = enrichItemWithBR031Rules(item, '2026-10-15');

      expect(enriched.parcelas[1].daysOverdue).toBe(0);
      expect(enriched.parcelas[1].isPastDeadline).toBe(false);
      expect(enriched.situacaoContrato).toBe('em_atraso_tolerancia');
    });
  });

  describe('5. Cálculo correto de KPIs', () => {
    it('deve formatar e agregar os 4 KPIs corretamente a partir da consulta SQL', async () => {
      const mockKpis = {
        totalContratacoesEmAtraso: 12,
        valorTotalEmAtraso: '18500.50',
        totalContratacoesCanceladas: 4,
        valorOriginalTotalCanceladas: '8900.00',
      };

      mockSql.mockResolvedValueOnce([mockKpis]);
      mockSql.mockResolvedValueOnce([]); // sem itens

      const result = await getPendenciasCancelamentosList(internalAccess, {
        tab: 'visao_geral',
      });

      expect(result.kpis.totalContratacoesEmAtraso).toBe(12);
      expect(result.kpis.valorTotalEmAtraso).toBe(18500.5);
      expect(result.kpis.totalContratacoesCanceladas).toBe(4);
      expect(result.kpis.valorOriginalTotalCanceladas).toBe(8900);
      expect(typeof result.kpis.valorTotalEmAtraso).toBe('number');
      expect(typeof result.kpis.valorOriginalTotalCanceladas).toBe('number');
    });
  });

  describe('6. Motivo de cancelamento com fallbacks BR-031', () => {
    it('contrato cancelado com recusada deve atribuir "Recusa de Assinatura"', () => {
      const item: PendenciaCancelamentoItem = {
        id: 'cot-canc-rec',
        cotacaoId: 'cot-canc-rec',
        saleId: null,
        tipoRegistro: 'cotacao',
        policyNumber: null,
        clientName: 'Cliente Recusou',
        clientCpfCnpj: '444.555.666-77',
        clientEmail: null,
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1500,
        situacaoContrato: 'cancelada',
        motivoCancelamento: 'Recusa de Assinatura',
        dataCancelamento: '2026-10-01T12:00:00Z',
        valorRecebidoAntesCancelamento: 0,
        qtdParcelasVencidas: 0,
        valorTotalAtraso: 0,
        dataVencimentoMaisAntiga: null,
        maiorDiasAtraso: 0,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [],
      };

      const enriched = enrichItemWithBR031Rules(item);
      expect(enriched.situacaoContrato).toBe('cancelada');
      expect(enriched.motivoCancelamento).toBe('Recusa de Assinatura');
    });

    it('contrato cancelado com parcelas em atraso e sem motivo explícito deve receber "Inadimplência (Regra BR-031)"', () => {
      const item: PendenciaCancelamentoItem = {
        id: 'cot-canc-inad',
        cotacaoId: 'cot-canc-inad',
        saleId: 'sale-canc-inad',
        tipoRegistro: 'venda',
        policyNumber: 'AP-CANC-001',
        clientName: 'Cliente Inadimplente Cancelado',
        clientCpfCnpj: '444.555.666-77',
        clientEmail: null,
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1500,
        situacaoContrato: 'cancelada',
        motivoCancelamento: null,
        dataCancelamento: '2026-10-01T12:00:00Z',
        valorRecebidoAntesCancelamento: 500,
        qtdParcelasVencidas: 2,
        valorTotalAtraso: 1000,
        dataVencimentoMaisAntiga: '2026-08-15',
        maiorDiasAtraso: 45,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [],
      };

      const enriched = enrichItemWithBR031Rules(item);
      expect(enriched.situacaoContrato).toBe('cancelada');
      expect(enriched.motivoCancelamento).toBe('Inadimplência (Regra BR-031)');
    });

    it('contrato cancelado sem atraso e sem motivo explícito deve receber "Cancelamento Administrativo"', () => {
      const item: PendenciaCancelamentoItem = {
        id: 'cot-canc-adm',
        cotacaoId: 'cot-canc-adm',
        saleId: 'sale-canc-adm',
        tipoRegistro: 'venda',
        policyNumber: 'AP-CANC-002',
        clientName: 'Cliente Cancelamento Admin',
        clientCpfCnpj: '444.555.666-77',
        clientEmail: null,
        clientPhone: null,
        corretoraId: 'corr-1',
        corretoraNome: 'Corretora',
        partnerId: 'part-1',
        partnerNome: 'Parceiro',
        managerUserId: null,
        managerNome: null,
        vendedorUserId: null,
        vendedorNome: null,
        productId: 'prod-1',
        productName: 'RC',
        valorTotalContratacao: 1500,
        situacaoContrato: 'cancelada',
        motivoCancelamento: null,
        dataCancelamento: '2026-10-01T12:00:00Z',
        valorRecebidoAntesCancelamento: 1500,
        qtdParcelasVencidas: 0,
        valorTotalAtraso: 0,
        dataVencimentoMaisAntiga: null,
        maiorDiasAtraso: 0,
        dataLimiteCancelamentoMaisCritica: null,
        parcelas: [],
      };

      const enriched = enrichItemWithBR031Rules(item);
      expect(enriched.situacaoContrato).toBe('cancelada');
      expect(enriched.motivoCancelamento).toBe('Cancelamento Administrativo');
    });
  });

  describe('7. Isolamento horizontal de acesso (PartnerAccessContext)', () => {
    it('deve aplicar filtro por corretoraId para usuários gestores de corretora', async () => {
      const corretoraAccess: PartnerAccessContext = {
        isInternal: false,
        isCorretoraUser: true,
        partnerId: null,
        corretoraId: 'corr-100',
        partnerRole: null,
        role: 'corretora_admin',
        visibleUserIds: null,
      };

      mockSql.mockResolvedValueOnce([
        {
          totalContratacoesEmAtraso: 0,
          valorTotalEmAtraso: 0,
          totalContratacoesCanceladas: 0,
          valorOriginalTotalCanceladas: 0,
        },
      ]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(corretoraAccess, { tab: 'em_atraso' });

      expect(mockSql).toHaveBeenCalledTimes(2);
      // Verifica chamadas SQL
      const callTexts = mockSql.mock.calls
        .map((c: any) => (Array.isArray(c[0]) ? c[0].join(' ') : ''))
        .join('\n');
      expect(callTexts).toContain('corretora_id =');
    });

    it('deve aplicar filtro por visibleUserIds para corretores subordinados', async () => {
      const brokerAccess: PartnerAccessContext = {
        isInternal: false,
        isCorretoraUser: false,
        partnerId: 'part-200',
        corretoraId: null,
        partnerRole: 'broker',
        role: 'partner_broker',
        visibleUserIds: ['vend-abc'],
      };

      mockSql.mockResolvedValueOnce([
        {
          totalContratacoesEmAtraso: 0,
          valorTotalEmAtraso: 0,
          totalContratacoesCanceladas: 0,
          valorOriginalTotalCanceladas: 0,
        },
      ]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(brokerAccess, { tab: 'em_atraso' });

      expect(mockSql).toHaveBeenCalledTimes(2);
      const callTexts = mockSql.mock.calls
        .map((c: any) => (Array.isArray(c[0]) ? c[0].join(' ') : ''))
        .join('\n');
      expect(callTexts).toContain('vendedor_user_id = ANY(');
    });
  });

  describe('8. Paginação e parâmetros', () => {
    it('deve respeitar pageSize permitido e calcular totalPages corretamente', async () => {
      const mockKpis = {
        totalContratacoesEmAtraso: 55,
        valorTotalEmAtraso: 10000,
        totalContratacoesCanceladas: 0,
        valorOriginalTotalCanceladas: 0,
      };

      // Gera 25 itens simulando a página 1 de 55
      const mockItems = Array.from({ length: 25 }, (_, i) => ({
        id: `cot-${i + 1}`,
        cotacao_id: `cot-${i + 1}`,
        sale_id: `sale-${i + 1}`,
        tipo_registro: 'venda',
        policy_number: `AP-${i + 1}`,
        client_name: `Cliente ${i + 1}`,
        client_cpf_cnpj: '111.222.333-00',
        corretora_id: 'corr-1',
        corretora_nome: 'Corretora',
        partner_id: 'part-1',
        partner_nome: 'Parceiro',
        product_id: 'prod-1',
        product_name: 'RC',
        valor_total_contratacao: 1000,
        situacao_raw: 'em_atraso',
        qtd_parcelas_vencidas: 1,
        valor_total_atraso: 500,
        data_vencimento_mais_antiga: '2026-10-10',
        maior_dias_atraso: 10,
        parcelas: [],
        full_count: 55,
      }));

      mockSql.mockResolvedValueOnce([mockKpis]);
      mockSql.mockResolvedValueOnce(mockItems);

      const result = await getPendenciasCancelamentosList(internalAccess, {
        tab: 'em_atraso',
        page: 1,
        pageSize: 25,
      });

      expect(result.items).toHaveLength(25);
      expect(result.total).toBe(55);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.totalPages).toBe(3); // ceil(55 / 25) = 3
    });
  });
});
