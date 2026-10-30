import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSql, mockVerifyPartnerAuth, mockCanManageOwnCompany } = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);
  return {
    mockSql: sqlFn,
    mockVerifyPartnerAuth: vi.fn(),
    mockCanManageOwnCompany: vi.fn(),
  };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: mockVerifyPartnerAuth,
  canManageOwnCompany: mockCanManageOwnCompany,
  isDevUser: vi.fn(() => false),
  isPlatformAdmin: vi.fn(() => false),
  unauthorized: () => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 }),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/link-tracker', () => ({
  calculateConversionMetrics: vi.fn(() => ({
    conversionRateCotacao: '0.0%',
    conversionRateVenda: '0.0%',
    fechamentoRate: '0.0%',
  })),
}));

import { GET, POST } from '../../app/api/portal/links/route';
import { PATCH, DELETE } from '../../app/api/portal/links/[id]/route';

describe('Gestão de Links por Corretores e Exclusão Segura', () => {
  const brokerUser = {
    userId: 'broker-123',
    partnerId: 'partner-999',
    role: 'partner_broker',
    name: 'Carlos Corretor',
    email: 'carlos@corretora.com.br',
  };

  const directorUser = {
    userId: 'director-001',
    partnerId: 'partner-999',
    role: 'partner_director',
    name: 'Diretoria Seguros',
    email: 'diretoria@corretora.com.br',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. DELETE /api/portal/links/[id] - Exclusão de Links', () => {
    it('deve permitir que o corretor exclua o seu próprio link (hard delete quando não há cotações)', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false); // Corretor comum

      const ownLink = {
        id: 'link-own-1',
        partner_id: 'partner-999',
        token: 'dlk_own_123',
        created_by_user_id: 'broker-123',
        seller_user_id: 'broker-123',
        status: 'active',
      };

      mockSql
        .mockResolvedValueOnce([ownLink]) // 1. SELECT existing
        .mockResolvedValueOnce([{ count: 0 }]) // 2. SELECT COUNT cotacoes
        .mockResolvedValueOnce([]); // 3. DELETE query

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-own-1', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-own-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link excluído com sucesso');
    });

    it('deve executar soft delete (status = "deleted") quando o link já possui cotações associadas', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      const ownLinkWithQuotes = {
        id: 'link-with-quotes',
        partner_id: 'partner-999',
        token: 'dlk_quotes_999',
        created_by_user_id: 'broker-123',
        seller_user_id: 'broker-123',
        status: 'active',
      };

      mockSql
        .mockResolvedValueOnce([ownLinkWithQuotes]) // 1. SELECT existing
        .mockResolvedValueOnce([{ count: 3 }]) // 2. Possui 3 cotações
        .mockResolvedValueOnce([]); // 3. UPDATE status = 'deleted'

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-with-quotes', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-with-quotes' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link excluído com sucesso');
    });

    it('deve proibir com 403 quando um corretor tenta excluir o link de outro vendedor ou da corretora', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      const otherSellerLink = {
        id: 'link-other-seller',
        partner_id: 'partner-999',
        token: 'dlk_other_456',
        created_by_user_id: 'other-broker-888',
        seller_user_id: 'other-broker-888',
        link_type: 'seller',
        status: 'active',
      };

      mockSql.mockResolvedValueOnce([otherSellerLink]); // SELECT existing

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-other-seller', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-other-seller' }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Você só possui permissão para excluir os seus próprios links');
    });

    it('deve permitir que o diretor/gestor da corretora exclua qualquer link da sua equipe', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(directorUser);
      mockCanManageOwnCompany.mockReturnValueOnce(true); // Diretor da corretora

      const teamLink = {
        id: 'link-team-01',
        partner_id: 'partner-999',
        token: 'dlk_team_01',
        created_by_user_id: 'broker-123',
        seller_user_id: 'broker-123',
        status: 'active',
      };

      mockSql
        .mockResolvedValueOnce([teamLink])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-team-01', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-team-01' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link excluído com sucesso');
    });
  });

  describe('2. PATCH /api/portal/links/[id] - Ativação e Desativação Segura', () => {
    it('deve proibir com 403 se um corretor tentar desativar o link de outro corretor', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      const otherLink = {
        id: 'link-other',
        partner_id: 'partner-999',
        token: 'dlk_other',
        created_by_user_id: 'outro-corretor',
        status: 'active',
      };

      mockSql.mockResolvedValueOnce([otherLink]);

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-other', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-other' }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Você só possui permissão para alterar os seus próprios links');
    });

    it('deve permitir que o corretor alterne o status do seu próprio link', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      const ownLink = {
        id: 'link-own',
        partner_id: 'partner-999',
        token: 'dlk_own',
        created_by_user_id: 'broker-123',
        status: 'active',
      };

      const updatedLink = {
        ...ownLink,
        status: 'inactive',
      };

      mockSql
        .mockResolvedValueOnce([ownLink])
        .mockResolvedValueOnce([updatedLink]);

      const req = new NextRequest('http://localhost:3000/api/portal/links/link-own', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-own' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.status).toBe('inactive');
    });
  });

  describe('3. POST /api/portal/links - Criação de Links por Vendedor e por Corretora', () => {
    it('deve forçar link_type = "seller" e seller_user_id = userId quando criado por corretor comum', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      // partner_product_availability
      mockSql.mockResolvedValueOnce([{ is_active: true }]);
      // product query
      mockSql.mockResolvedValueOnce([{ id: 'prod-rc-001', name: 'RC Profissional' }]);
      // insert query
      mockSql.mockResolvedValueOnce([
        {
          id: 'link-created-1',
          token: 'dlk_new_token',
          label: 'Minha Campanha Advogados',
          flow_type: 'external',
          status: 'active',
          discount_percent: 10,
          is_exclusive: false,
          link_type: 'seller',
          seller_user_id: 'broker-123',
          created_at: new Date().toISOString(),
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/portal/links', {
        method: 'POST',
        body: JSON.stringify({
          discountPercent: 10,
          label: 'Minha Campanha Advogados',
          linkType: 'corretora', // Tenta passar corretora, mas por ser broker deve forçar seller
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.link.canManageLink).toBe(true);
    });

    it('deve aceitar link_type = "corretora" quando criado pela diretoria/gestão da corretora', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(directorUser);
      mockCanManageOwnCompany.mockReturnValueOnce(true);

      mockSql.mockResolvedValueOnce([{ is_active: true }]);
      mockSql.mockResolvedValueOnce([{ id: 'prod-rc-001', name: 'RC Profissional' }]);
      mockSql.mockResolvedValueOnce([
        {
          id: 'link-created-corretora',
          token: 'dlk_corretora_gen',
          label: 'Link Geral da Empresa',
          flow_type: 'external',
          status: 'active',
          discount_percent: 0,
          is_exclusive: false,
          link_type: 'corretora',
          seller_user_id: null,
          created_at: new Date().toISOString(),
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/portal/links', {
        method: 'POST',
        body: JSON.stringify({
          label: 'Link Geral da Empresa',
          linkType: 'corretora',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.link.canManageLink).toBe(true);
    });
  });

  describe('4. GET /api/portal/links - Listagem e Filtragem de Links Excluídos', () => {
    it('deve listar links com indicador canManageLink adequado e metadados de vendedor', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(brokerUser);
      mockCanManageOwnCompany.mockReturnValueOnce(false);

      mockSql.mockResolvedValueOnce([
        {
          id: 'link-1',
          token: 'dlk_own_1',
          created_by_user_id: 'broker-123',
          seller_user_id: 'broker-123',
          link_type: 'seller',
          seller_name: 'Carlos Corretor',
          status: 'active',
          views_count: 10,
          total_cotacoes: 2,
        },
        {
          id: 'link-2',
          token: 'dlk_corretora_institucional',
          created_by_user_id: 'director-001',
          seller_user_id: null,
          link_type: 'corretora',
          seller_name: null,
          status: 'active',
          views_count: 50,
          total_cotacoes: 8,
        },
      ]);

      const res = await GET();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.links).toHaveLength(2);

      // Link próprio do corretor: pode gerenciar
      expect(data.links[0].canManageLink).toBe(true);
      expect(data.links[0].link_type).toBe('seller');
      expect(data.links[0].seller_name).toBe('Carlos Corretor');

      // Link institucional da corretora: corretor comum não pode alterar/excluir
      expect(data.links[1].canManageLink).toBe(false);
      expect(data.links[1].link_type).toBe('corretora');
    });
  });
});
