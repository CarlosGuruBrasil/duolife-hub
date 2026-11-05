import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PartnerAccessContext } from '@/lib/auth';
import type { PendenciasFiltros } from '@/types/pendencias-cancelamentos';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn((_stringsOrArg: any, ..._values: any[]) => {
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
  resolveRbacScope,
} from '@/lib/pendencias-cancelamentos-service';

function getQueryParams(mockCall: any[]) {
  return {
    corretoraIdIsNull: mockCall[1],
    corretoraIdValue: mockCall[2],
    partnerIdIsNull: mockCall[3],
    partnerIdValue: mockCall[4],
    visibleUserIdsIsNull: mockCall[5],
    visibleUserIdsValue: mockCall[6],
    managerUserIdIsNull: mockCall[14],
    managerUserIdValue: mockCall[15],
    vendedorUserIdIsNull: mockCall[16],
    vendedorUserIdValue: mockCall[17],
  };
}

describe('Testes de Segurança RBAC e Isolamento Multi-tenant — Central de Pendências e Cancelamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultMockKpis = {
    totalContratacoesEmAtraso: 2,
    valorTotalEmAtraso: 1500,
    totalContratacoesCanceladas: 1,
    valorOriginalTotalCanceladas: 1000,
  };

  describe('Cenário 1: Vendedor (partner_broker) visualizando exclusivamente seus registros e sanitizando tentativa de filtrar vendedor alheio', () => {
    const brokerAccess: PartnerAccessContext = {
      isInternal: false,
      isCorretoraUser: false,
      partnerId: 'partner-broker-10',
      corretoraId: 'corretora-origem-1',
      partnerRole: 'broker',
      role: 'partner_broker',
      visibleUserIds: ['broker-user-123'],
    };

    it('resolveRbacScope deve forçar vendedorUserId para o usuário autorizado e partnerId para o seu partner', () => {
      const maliciousFilters: PendenciasFiltros = {
        vendedorUserId: 'outro-vendedor-456',
        partnerId: 'outro-partner-99',
        corretoraId: 'outra-corretora-88',
      };

      const scope = resolveRbacScope(brokerAccess, maliciousFilters);

      expect(scope.vendedorUserId).toBe('broker-user-123');
      expect(scope.partnerId).toBe('partner-broker-10');
      expect(scope.corretoraId).toBe('corretora-origem-1');
      expect(scope.visibleUserIds).toEqual(['broker-user-123']);
    });

    it('getPendenciasCancelamentosList deve barrar tentativa de ampliar escopo e aplicar filtros restritos em KPIs e Itens', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([
        {
          id: 'cot-broker-1',
          cotacao_id: 'cot-broker-1',
          sale_id: null,
          tipo_registro: 'cotacao',
          vendedor_user_id: 'broker-user-123',
          partner_id: 'partner-broker-10',
          full_count: 1,
        },
      ]);

      const maliciousFilters: PendenciasFiltros = {
        vendedorUserId: 'hacker-broker-999',
        partnerId: 'partner-alheio-777',
      };

      const result = await getPendenciasCancelamentosList(brokerAccess, maliciousFilters);

      expect(mockSql).toHaveBeenCalledTimes(2);

      // Validação Query KPIs
      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.partnerIdIsNull).toBe(false);
      expect(kpisParams.partnerIdValue).toBe('partner-broker-10');
      expect(kpisParams.visibleUserIdsIsNull).toBe(false);
      expect(kpisParams.visibleUserIdsValue).toEqual(['broker-user-123']);
      expect(kpisParams.vendedorUserIdIsNull).toBe(false);
      expect(kpisParams.vendedorUserIdValue).toBe('broker-user-123');

      // Validação Query Itens
      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.partnerIdIsNull).toBe(false);
      expect(itemsParams.partnerIdValue).toBe('partner-broker-10');
      expect(itemsParams.visibleUserIdsIsNull).toBe(false);
      expect(itemsParams.visibleUserIdsValue).toEqual(['broker-user-123']);
      expect(itemsParams.vendedorUserIdIsNull).toBe(false);
      expect(itemsParams.vendedorUserIdValue).toBe('broker-user-123');

      expect(result.items).toHaveLength(1);
    });
  });

  describe('Cenário 2: Gestor (partner_manager) visualizando seus subordinados recursivos (visibleUserIds)', () => {
    const managerAccess: PartnerAccessContext = {
      isInternal: false,
      isCorretoraUser: false,
      partnerId: 'partner-equipe-1',
      corretoraId: null,
      partnerRole: 'manager',
      role: 'partner_manager',
      visibleUserIds: ['manager-id-1', 'sub-vendedor-1', 'sub-vendedor-2'],
    };

    it('resolveRbacScope sem filtro específico de vendedor deve manter o escopo de todos os subordinados', () => {
      const scope = resolveRbacScope(managerAccess, {});

      expect(scope.partnerId).toBe('partner-equipe-1');
      expect(scope.visibleUserIds).toEqual(['manager-id-1', 'sub-vendedor-1', 'sub-vendedor-2']);
      expect(scope.vendedorUserId).toBeNull();
    });

    it('resolveRbacScope com filtro de vendedor subordinado válido deve permitir filtrar aquele vendedor', () => {
      const scope = resolveRbacScope(managerAccess, { vendedorUserId: 'sub-vendedor-2' });

      expect(scope.partnerId).toBe('partner-equipe-1');
      expect(scope.visibleUserIds).toEqual(['manager-id-1', 'sub-vendedor-1', 'sub-vendedor-2']);
      expect(scope.vendedorUserId).toBe('sub-vendedor-2');
    });

    it('getPendenciasCancelamentosList deve consultar subordinados recursivos com segurança em KPIs e Itens', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(managerAccess, {});

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.partnerIdValue).toBe('partner-equipe-1');
      expect(kpisParams.visibleUserIdsValue).toEqual(['manager-id-1', 'sub-vendedor-1', 'sub-vendedor-2']);
      expect(kpisParams.vendedorUserIdIsNull).toBe(true);

      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.partnerIdValue).toBe('partner-equipe-1');
      expect(itemsParams.visibleUserIdsValue).toEqual(['manager-id-1', 'sub-vendedor-1', 'sub-vendedor-2']);
      expect(itemsParams.vendedorUserIdIsNull).toBe(true);
    });
  });

  describe('Cenário 3: Gestor impedido de filtrar vendedor de outra equipe/parceiro (tentativa de bypass barrada)', () => {
    const managerAccess: PartnerAccessContext = {
      isInternal: false,
      isCorretoraUser: false,
      partnerId: 'partner-equipe-1',
      corretoraId: null,
      partnerRole: 'manager',
      role: 'partner_manager',
      visibleUserIds: ['manager-id-1', 'sub-vendedor-1'],
    };

    it('resolveRbacScope deve sanitizar vendedorUserId que não pertença a visibleUserIds (revertendo para null)', () => {
      const maliciousFilters: PendenciasFiltros = {
        vendedorUserId: 'vendedor-de-outro-gestor-999',
        partnerId: 'partner-alheio-888',
      };

      const scope = resolveRbacScope(managerAccess, maliciousFilters);

      expect(scope.partnerId).toBe('partner-equipe-1');
      expect(scope.visibleUserIds).toEqual(['manager-id-1', 'sub-vendedor-1']);
      // Sanitizado: não permite filtrar por vendedor alheio
      expect(scope.vendedorUserId).toBeNull();
    });

    it('getPendenciasCancelamentosList deve aplicar isolamento e ignorar vendedor alheio na cláusula SQL', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(managerAccess, {
        vendedorUserId: 'vendedor-de-outro-gestor-999',
      });

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.vendedorUserIdIsNull).toBe(true);
      expect(kpisParams.visibleUserIdsValue).toEqual(['manager-id-1', 'sub-vendedor-1']);

      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.vendedorUserIdIsNull).toBe(true);
      expect(itemsParams.visibleUserIdsValue).toEqual(['manager-id-1', 'sub-vendedor-1']);
    });
  });

  describe('Cenário 4: Corretora visualizando apenas sua corretora_id e sanitizando tentativa de injetar outra corretora', () => {
    const corretoraAccess: PartnerAccessContext = {
      isInternal: false,
      isCorretoraUser: true,
      partnerId: null,
      corretoraId: 'minha-corretora-oficial-100',
      partnerRole: null,
      role: 'corretora_admin',
      visibleUserIds: null,
    };

    it('resolveRbacScope deve forçar corretoraId e ignorar tentativa de injeção', () => {
      const maliciousFilters: PendenciasFiltros = {
        corretoraId: 'corretora-vitima-200',
      };

      const scope = resolveRbacScope(corretoraAccess, maliciousFilters);

      expect(scope.corretoraId).toBe('minha-corretora-oficial-100');
      expect(scope.visibleUserIds).toBeNull();
    });

    it('getPendenciasCancelamentosList deve aplicar estritamente a corretora autorizada', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(corretoraAccess, {
        corretoraId: 'corretora-vitima-200',
      });

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.corretoraIdIsNull).toBe(false);
      expect(kpisParams.corretoraIdValue).toBe('minha-corretora-oficial-100');

      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.corretoraIdIsNull).toBe(false);
      expect(itemsParams.corretoraIdValue).toBe('minha-corretora-oficial-100');
    });
  });

  describe('Cenário 5: Diretor do parceiro restrito ao seu partner_id', () => {
    const directorAccess: PartnerAccessContext = {
      isInternal: false,
      isCorretoraUser: false,
      partnerId: 'partner-diretoria-50',
      corretoraId: null,
      partnerRole: 'director',
      role: 'partner_director',
      visibleUserIds: null,
    };

    it('resolveRbacScope deve forçar partnerId para o partner do diretor e permitir filtrar qualquer vendedor do parceiro', () => {
      const filters: PendenciasFiltros = {
        partnerId: 'partner-concorrente-99',
        vendedorUserId: 'qualquer-vendedor-do-parceiro',
      };

      const scope = resolveRbacScope(directorAccess, filters);

      expect(scope.partnerId).toBe('partner-diretoria-50');
      expect(scope.visibleUserIds).toBeNull();
      expect(scope.vendedorUserId).toBe('qualquer-vendedor-do-parceiro');
    });

    it('getPendenciasCancelamentosList deve aplicar restrição de partnerId nas queries', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(directorAccess, {
        partnerId: 'partner-concorrente-99',
      });

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.partnerIdIsNull).toBe(false);
      expect(kpisParams.partnerIdValue).toBe('partner-diretoria-50');
      expect(kpisParams.visibleUserIdsIsNull).toBe(true);

      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.partnerIdIsNull).toBe(false);
      expect(itemsParams.partnerIdValue).toBe('partner-diretoria-50');
      expect(itemsParams.visibleUserIdsIsNull).toBe(true);
    });
  });

  describe('Cenário 6: Administrador e desenvolvedor com escopo global e sem injeção forçada de inquilino', () => {
    const adminAccess: PartnerAccessContext = {
      isInternal: true,
      isCorretoraUser: false,
      partnerId: null,
      corretoraId: null,
      partnerRole: null,
      role: 'duolife_admin',
      visibleUserIds: null,
    };

    const devAccess: PartnerAccessContext = {
      isInternal: true,
      isCorretoraUser: false,
      partnerId: null,
      corretoraId: null,
      partnerRole: null,
      role: 'duolife_dev',
      visibleUserIds: null,
    };

    it('resolveRbacScope para admin sem filtros deve manter escopo global (todos null)', () => {
      const scope = resolveRbacScope(adminAccess, {});

      expect(scope.corretoraId).toBeNull();
      expect(scope.partnerId).toBeNull();
      expect(scope.visibleUserIds).toBeNull();
      expect(scope.vendedorUserId).toBeNull();
    });

    it('resolveRbacScope para admin com filtros específicos deve respeitar os filtros livremente', () => {
      const filters: PendenciasFiltros = {
        corretoraId: 'qualquer-corretora-1',
        partnerId: 'qualquer-partner-2',
        vendedorUserId: 'qualquer-vendedor-3',
      };

      const scope = resolveRbacScope(devAccess, filters);

      expect(scope.corretoraId).toBe('qualquer-corretora-1');
      expect(scope.partnerId).toBe('qualquer-partner-2');
      expect(scope.visibleUserIds).toBeNull();
      expect(scope.vendedorUserId).toBe('qualquer-vendedor-3');
    });

    it('getPendenciasCancelamentosList para admin sem filtros não injeta cláusulas forçadas', async () => {
      mockSql.mockResolvedValueOnce([defaultMockKpis]);
      mockSql.mockResolvedValueOnce([]);

      await getPendenciasCancelamentosList(adminAccess, {});

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      expect(kpisParams.corretoraIdIsNull).toBe(true);
      expect(kpisParams.partnerIdIsNull).toBe(true);
      expect(kpisParams.visibleUserIdsIsNull).toBe(true);
      expect(kpisParams.vendedorUserIdIsNull).toBe(true);

      const itemsParams = getQueryParams(mockSql.mock.calls[1]);
      expect(itemsParams.corretoraIdIsNull).toBe(true);
      expect(itemsParams.partnerIdIsNull).toBe(true);
      expect(itemsParams.visibleUserIdsIsNull).toBe(true);
      expect(itemsParams.vendedorUserIdIsNull).toBe(true);
    });
  });

  describe('Cenário 7: Validação de que os 4 KPIs refletem rigorosamente o mesmo isolamento hierárquico da listagem', () => {
    it('garante que a query de KPIs (call 0) e a de itens (call 1) recebem rigorosamente os mesmos parâmetros de isolamento', async () => {
      const brokerAccess: PartnerAccessContext = {
        isInternal: false,
        isCorretoraUser: false,
        partnerId: 'partner-blindado-1',
        corretoraId: 'corretora-blindada-2',
        partnerRole: 'broker',
        role: 'partner_broker',
        visibleUserIds: ['vendedor-isolado-1'],
      };

      const mockKpis = {
        totalContratacoesEmAtraso: 5,
        valorTotalEmAtraso: 7500,
        totalContratacoesCanceladas: 2,
        valorOriginalTotalCanceladas: 3000,
      };

      mockSql.mockResolvedValueOnce([mockKpis]);
      mockSql.mockResolvedValueOnce([]);

      const result = await getPendenciasCancelamentosList(brokerAccess, {
        tab: 'em_atraso',
        vendedorUserId: 'tentativa-alheia',
        partnerId: 'tentativa-alheia-partner',
      });

      expect(mockSql).toHaveBeenCalledTimes(2);

      const kpisParams = getQueryParams(mockSql.mock.calls[0]);
      const itemsParams = getQueryParams(mockSql.mock.calls[1]);

      // Ambas as consultas devem ter exatamente os mesmos parâmetros de tenant e usuário
      expect(kpisParams.corretoraIdValue).toBe(itemsParams.corretoraIdValue);
      expect(kpisParams.partnerIdValue).toBe(itemsParams.partnerIdValue);
      expect(kpisParams.visibleUserIdsValue).toEqual(itemsParams.visibleUserIdsValue);
      expect(kpisParams.vendedorUserIdValue).toBe(itemsParams.vendedorUserIdValue);

      // Verificação específica dos valores isolados
      expect(kpisParams.partnerIdValue).toBe('partner-blindado-1');
      expect(kpisParams.visibleUserIdsValue).toEqual(['vendedor-isolado-1']);
      expect(kpisParams.vendedorUserIdValue).toBe('vendedor-isolado-1');

      // KPIs retornados intactos sem vazamento
      expect(result.kpis.totalContratacoesEmAtraso).toBe(5);
      expect(result.kpis.valorTotalEmAtraso).toBe(7500);
      expect(result.kpis.totalContratacoesCanceladas).toBe(2);
      expect(result.kpis.valorOriginalTotalCanceladas).toBe(3000);
    });
  });
});
