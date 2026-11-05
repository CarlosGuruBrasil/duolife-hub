import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser, PartnerAccessContext } from '@/lib/auth';
import type { PendenciasPaginadasResult } from '@/types/pendencias-cancelamentos';
import { ClockAlert } from 'lucide-react';

const {
  mockRedirect,
  mockVerifyPartnerAuth,
  mockVerifyAdminAuth,
  mockGetPartnerAccessContext,
  mockEnsureSchema,
  mockGetPendenciasCancelamentosList,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    (error as any).digest = `NEXT_REDIRECT:${url}`;
    throw error;
  }),
  mockVerifyPartnerAuth: vi.fn(),
  mockVerifyAdminAuth: vi.fn(),
  mockGetPartnerAccessContext: vi.fn(),
  mockEnsureSchema: vi.fn().mockResolvedValue(undefined),
  mockGetPendenciasCancelamentosList: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  usePathname: vi.fn(() => '/portal'),
}));

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: mockVerifyPartnerAuth,
  verifyAdminAuth: mockVerifyAdminAuth,
  getPartnerAccessContext: mockGetPartnerAccessContext,
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: mockEnsureSchema,
}));

vi.mock('@/lib/pendencias-cancelamentos-service', () => ({
  getPendenciasCancelamentosList: mockGetPendenciasCancelamentosList,
}));

import PortalPendenciasCancelamentosPage from '../../app/portal/pendencias-cancelamentos/page';
import AdminPendenciasCancelamentosPage from '../../app/admin/pendencias-cancelamentos/page';
import PortalShell, { getPortalNav } from '../../app/portal/_components/PortalShell';
import AdminShell, { navSections } from '../../app/admin/_components/AdminShell';
import { PendenciasCancelamentosView } from '@/components/pendencias/PendenciasCancelamentosView';

describe('Páginas de Pendências e Cancelamentos & Navegação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockInitialData: PendenciasPaginadasResult = {
    items: [],
    kpis: {
      totalContratacoesEmAtraso: 2,
      valorTotalEmAtraso: 1500,
      totalContratacoesCanceladas: 1,
      valorOriginalTotalCanceladas: 5000,
    },
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  };

  const mockPartnerUser: AuthUser = {
    userId: 'user-partner-1',
    name: 'Corretor Teste',
    email: 'corretor@teste.com',
    role: 'partner_broker',
    partnerRole: 'broker',
    partnerId: 'partner-1',
    permissions: {},
  };

  const mockPartnerAccess: PartnerAccessContext = {
    partnerId: 'partner-1',
    corretoraId: null,
    isCorretoraUser: false,
    isInternal: false,
    partnerRole: 'broker',
    role: 'partner_broker',
    visibleUserIds: ['user-partner-1'],
  };

  const mockAdminUser: AuthUser = {
    userId: 'admin-1',
    name: 'Admin DuoLife',
    email: 'admin@duolife.com',
    role: 'duolife_admin',
    partnerRole: null,
    partnerId: null,
    permissions: {},
  };

  describe('app/portal/pendencias-cancelamentos/page.tsx', () => {
    it('deve redirecionar para /login se o parceiro não estiver autenticado', async () => {
      mockVerifyPartnerAuth.mockResolvedValue(null);

      await expect(
        PortalPendenciasCancelamentosPage({})
      ).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(mockVerifyPartnerAuth).toHaveBeenCalledTimes(1);
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('deve redirecionar para /login se o contexto do parceiro for nulo', async () => {
      mockVerifyPartnerAuth.mockResolvedValue(mockPartnerUser);
      mockGetPartnerAccessContext.mockResolvedValue(null);

      await expect(
        PortalPendenciasCancelamentosPage({})
      ).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(mockVerifyPartnerAuth).toHaveBeenCalledTimes(1);
      expect(mockGetPartnerAccessContext).toHaveBeenCalledWith(mockPartnerUser);
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('deve carregar initialData e renderizar PortalShell e PendenciasCancelamentosView com baseRoute="/portal"', async () => {
      mockVerifyPartnerAuth.mockResolvedValue(mockPartnerUser);
      mockGetPartnerAccessContext.mockResolvedValue(mockPartnerAccess);
      mockGetPendenciasCancelamentosList.mockResolvedValue(mockInitialData);

      const pageJsx = await PortalPendenciasCancelamentosPage({});

      expect(mockEnsureSchema).toHaveBeenCalled();
      expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
        mockPartnerAccess,
        expect.objectContaining({
          tab: undefined,
          page: 1,
          pageSize: 25,
        })
      );

      // Verificação estrutural do JSX do Server Component
      expect(pageJsx.type).toBe(PortalShell);
      expect(pageJsx.props.user).toEqual(mockPartnerUser);

      const viewChild = pageJsx.props.children;
      expect(viewChild.type).toBe(PendenciasCancelamentosView);
      expect(viewChild.props.baseRoute).toBe('/portal');
      expect(viewChild.props.initialTab).toBe('em_atraso');
      expect(viewChild.props.initialData).toEqual(mockInitialData);
    });

    it('deve repassar searchParams resolvidos (incluindo Promise) para filtros e initialTab', async () => {
      mockVerifyPartnerAuth.mockResolvedValue(mockPartnerUser);
      mockGetPartnerAccessContext.mockResolvedValue(mockPartnerAccess);
      mockGetPendenciasCancelamentosList.mockResolvedValue(mockInitialData);

      const searchParamsPromise = Promise.resolve({
        tab: 'canceladas',
        q: 'Carlos',
        page: '3',
        pageSize: '50',
        diasAtrasoMin: '15',
        orderBy: 'data_cancelamento',
        orderDir: 'desc',
      });

      const pageJsx = await PortalPendenciasCancelamentosPage({
        searchParams: searchParamsPromise,
      });

      expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
        mockPartnerAccess,
        expect.objectContaining({
          tab: 'canceladas',
          q: 'Carlos',
          page: 3,
          pageSize: 50,
          diasAtrasoMin: 15,
          orderBy: 'data_cancelamento',
          orderDir: 'desc',
        })
      );

      const viewChild = pageJsx.props.children;
      expect(viewChild.props.initialTab).toBe('canceladas');
    });
  });

  describe('app/admin/pendencias-cancelamentos/page.tsx', () => {
    it('deve redirecionar para /login se o admin não estiver autenticado', async () => {
      mockVerifyAdminAuth.mockResolvedValue(null);

      await expect(
        AdminPendenciasCancelamentosPage({})
      ).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(mockVerifyAdminAuth).toHaveBeenCalledTimes(1);
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('deve montar contexto interno corporativo e renderizar AdminShell e PendenciasCancelamentosView com baseRoute="/admin"', async () => {
      mockVerifyAdminAuth.mockResolvedValue(mockAdminUser);
      mockGetPendenciasCancelamentosList.mockResolvedValue(mockInitialData);

      const pageJsx = await AdminPendenciasCancelamentosPage({});

      expect(mockEnsureSchema).toHaveBeenCalled();

      // Verifica se o escopo de acesso interno foi montado com isInternal: true
      const expectedAdminAccess: PartnerAccessContext = {
        partnerId: null,
        corretoraId: null,
        isCorretoraUser: false,
        isInternal: true,
        partnerRole: null,
        role: 'duolife_admin',
        visibleUserIds: null,
      };

      expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
        expectedAdminAccess,
        expect.objectContaining({
          tab: undefined,
          page: 1,
          pageSize: 25,
        })
      );

      // Verificação estrutural do JSX do Server Component
      expect(pageJsx.type).toBe(AdminShell);
      expect(pageJsx.props.user).toEqual(mockAdminUser);

      const viewChild = pageJsx.props.children;
      expect(viewChild.type).toBe(PendenciasCancelamentosView);
      expect(viewChild.props.baseRoute).toBe('/admin');
      expect(viewChild.props.initialTab).toBe('em_atraso');
      expect(viewChild.props.initialData).toEqual(mockInitialData);
    });

    it('deve repassar searchParams resolvidos para o serviço do admin', async () => {
      mockVerifyAdminAuth.mockResolvedValue(mockAdminUser);
      mockGetPendenciasCancelamentosList.mockResolvedValue(mockInitialData);

      const pageJsx = await AdminPendenciasCancelamentosPage({
        searchParams: {
          tab: 'visao_geral',
          q: 'Segurado XPTO',
          tipoRegistro: 'venda',
          corretoraId: 'corr-123',
        },
      });

      expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
        expect.objectContaining({ isInternal: true }),
        expect.objectContaining({
          tab: 'visao_geral',
          q: 'Segurado XPTO',
          tipoRegistro: 'venda',
          corretoraId: 'corr-123',
        })
      );

      const viewChild = pageJsx.props.children;
      expect(viewChild.props.initialTab).toBe('visao_geral');
    });
  });

  describe('Integração aos Menus de Navegação', () => {
    it('deve conter o item "Pendências e Cancelamentos" no menu do Portal posicionado após "Vendas"', () => {
      const portalNav = getPortalNav();
      const pendenciasItem = portalNav.find(
        (item) => item.href === '/portal/pendencias-cancelamentos'
      );

      expect(pendenciasItem).toBeDefined();
      expect(pendenciasItem?.label).toBe('Pendências e Cancelamentos');
      expect(pendenciasItem?.icon).toBe(ClockAlert);

      const vendasIndex = portalNav.findIndex((item) => item.href === '/portal/vendas');
      const pendenciasIndex = portalNav.findIndex(
        (item) => item.href === '/portal/pendencias-cancelamentos'
      );

      expect(vendasIndex).toBeGreaterThan(-1);
      expect(pendenciasIndex).toBe(vendasIndex + 1);
    });

    it('deve conter o item "Pendências e Cancelamentos" no menu do Admin na seção "Operação" após "Vendas"', () => {
      const operacaoSection = navSections.find((s) => s.title === 'Operação');
      expect(operacaoSection).toBeDefined();

      const items = operacaoSection!.items;
      const pendenciasItem = items.find(
        (item) => item.href === '/admin/pendencias-cancelamentos'
      );

      expect(pendenciasItem).toBeDefined();
      expect(pendenciasItem?.label).toBe('Pendências e Cancelamentos');
      expect(pendenciasItem?.icon).toBe(ClockAlert);
      expect(pendenciasItem?.description).toBe('Inadimplência, tolerâncias e cancelados.');

      const vendasIndex = items.findIndex((item) => item.href === '/admin/vendas');
      const pendenciasIndex = items.findIndex(
        (item) => item.href === '/admin/pendencias-cancelamentos'
      );

      expect(vendasIndex).toBeGreaterThan(-1);
      expect(pendenciasIndex).toBe(vendasIndex + 1);
    });
  });
});
