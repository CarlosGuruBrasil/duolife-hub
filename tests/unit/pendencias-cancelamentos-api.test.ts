import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser, PartnerAccessContext } from '@/lib/auth';
import type { PendenciasPaginadasResult } from '@/types/pendencias-cancelamentos';

const {
  mockVerifyAuth,
  mockIsInternalUser,
  mockGetPartnerAccessContext,
  mockGetPendenciasCancelamentosList,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockIsInternalUser: vi.fn(),
  mockGetPartnerAccessContext: vi.fn(),
  mockGetPendenciasCancelamentosList: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyAuth: mockVerifyAuth,
  isInternalUser: mockIsInternalUser,
  getPartnerAccessContext: mockGetPartnerAccessContext,
  unauthorized: vi.fn(() => Response.json({ error: 'Não autorizado' }, { status: 401 })),
}));

vi.mock('@/lib/pendencias-cancelamentos-service', () => ({
  getPendenciasCancelamentosList: mockGetPendenciasCancelamentosList,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

import { GET } from '../../app/api/pendencias-cancelamentos/route';

describe('GET /api/pendencias-cancelamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMockResult: PendenciasPaginadasResult = {
    items: [],
    kpis: {
      totalContratacoesEmAtraso: 0,
      valorTotalEmAtraso: 0,
      totalContratacoesCanceladas: 0,
      valorOriginalTotalCanceladas: 0,
    },
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 0,
  };

  it('deve retornar 401 quando verifyAuth retorna null', async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/pendencias-cancelamentos');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: 'Não autorizado' });
    expect(mockGetPendenciasCancelamentosList).not.toHaveBeenCalled();
  });

  it('deve retornar 403 quando perfil parceiro não possui contexto', async () => {
    const partnerUser: AuthUser = {
      userId: 'user-sem-contexto',
      email: 'parceiro@exemplo.com',
      name: 'Parceiro Sem Contexto',
      role: 'partner_broker',
      partnerId: null,
      partnerRole: null,
      permissions: {},
    };

    mockVerifyAuth.mockResolvedValue(partnerUser);
    mockIsInternalUser.mockReturnValue(false);
    mockGetPartnerAccessContext.mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/pendencias-cancelamentos');
    const res = await GET(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data).toEqual({ error: 'Acesso negado para este perfil' });
    expect(mockGetPendenciasCancelamentosList).not.toHaveBeenCalled();
  });

  it('deve permitir acesso para usuário interno admin com contexto global e repassar parâmetros', async () => {
    const adminUser: AuthUser = {
      userId: 'admin-duolife-1',
      email: 'admin@duolife.com.br',
      name: 'Admin DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      partnerRole: null,
      permissions: {},
    };

    mockVerifyAuth.mockResolvedValue(adminUser);
    mockIsInternalUser.mockReturnValue(true);
    mockGetPendenciasCancelamentosList.mockResolvedValue(mockMockResult);

    const url = 'http://localhost:3000/api/pendencias-cancelamentos?' + new URLSearchParams({
      tab: 'em_atraso',
      q: 'carlos',
      corretoraId: 'cor-123',
      partnerId: 'part-456',
      managerUserId: 'mgr-789',
      vendedorUserId: 'vend-101',
      productId: 'prod-rc',
      tipoRegistro: 'venda',
      situacao: 'em_atraso_critico',
      motivoCancelamento: 'inadimplencia',
      diasAtrasoMin: '10',
      diasAtrasoMax: '30',
      vencimentoDe: '2026-01-01',
      vencimentoAte: '2026-01-31',
      cancelamentoDe: '2026-02-01',
      cancelamentoAte: '2026-02-28',
      page: '2',
      pageSize: '50',
      orderBy: 'dias_atraso',
      orderDir: 'desc',
    }).toString();

    const req = new Request(url);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockMockResult);

    expect(mockGetPartnerAccessContext).not.toHaveBeenCalled();
    expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
      {
        partnerId: null,
        corretoraId: null,
        isCorretoraUser: false,
        isInternal: true,
        partnerRole: null,
        role: 'duolife_admin',
        visibleUserIds: null,
      },
      {
        tab: 'em_atraso',
        q: 'carlos',
        corretoraId: 'cor-123',
        partnerId: 'part-456',
        managerUserId: 'mgr-789',
        vendedorUserId: 'vend-101',
        productId: 'prod-rc',
        tipoRegistro: 'venda',
        situacao: 'em_atraso_critico',
        motivoCancelamento: 'inadimplencia',
        diasAtrasoMin: 10,
        diasAtrasoMax: 30,
        vencimentoDe: '2026-01-01',
        vencimentoAte: '2026-01-31',
        cancelamentoDe: '2026-02-01',
        cancelamentoAte: '2026-02-28',
        page: 2,
        pageSize: 50,
        orderBy: 'dias_atraso',
        orderDir: 'desc',
      }
    );
  });

  it('deve usar defaults para page e pageSize quando omitidos ou inválidos', async () => {
    const adminUser: AuthUser = {
      userId: 'admin-duolife-1',
      email: 'admin@duolife.com.br',
      name: 'Admin DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      partnerRole: null,
      permissions: {},
    };

    mockVerifyAuth.mockResolvedValue(adminUser);
    mockIsInternalUser.mockReturnValue(true);
    mockGetPendenciasCancelamentosList.mockResolvedValue(mockMockResult);

    const req = new Request('http://localhost:3000/api/pendencias-cancelamentos?page=invalid&pageSize=-5');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        page: 1,
        pageSize: 25,
      })
    );
  });

  it('deve obter contexto e repassar filtros para corretor parceiro autenticado', async () => {
    const brokerUser: AuthUser = {
      userId: 'broker-1',
      email: 'broker@corretora.com.br',
      name: 'Corretor João',
      role: 'partner_broker',
      partnerId: 'partner-1',
      partnerRole: 'broker',
      permissions: {},
    };

    const brokerAccess: PartnerAccessContext = {
      partnerId: 'partner-1',
      corretoraId: 'corretora-1',
      isCorretoraUser: false,
      isInternal: false,
      partnerRole: 'broker',
      role: 'broker',
      visibleUserIds: ['broker-1'],
    };

    mockVerifyAuth.mockResolvedValue(brokerUser);
    mockIsInternalUser.mockReturnValue(false);
    mockGetPartnerAccessContext.mockResolvedValue(brokerAccess);
    mockGetPendenciasCancelamentosList.mockResolvedValue(mockMockResult);

    const req = new Request('http://localhost:3000/api/pendencias-cancelamentos?tab=canceladas');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockGetPartnerAccessContext).toHaveBeenCalledWith(brokerUser);
    expect(mockGetPendenciasCancelamentosList).toHaveBeenCalledWith(
      brokerAccess,
      expect.objectContaining({
        tab: 'canceladas',
        page: 1,
        pageSize: 25,
      })
    );
  });

  it('deve retornar 500 em caso de erro no serviço de consulta', async () => {
    const adminUser: AuthUser = {
      userId: 'admin-duolife-1',
      email: 'admin@duolife.com.br',
      name: 'Admin DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      partnerRole: null,
      permissions: {},
    };

    mockVerifyAuth.mockResolvedValue(adminUser);
    mockIsInternalUser.mockReturnValue(true);
    mockGetPendenciasCancelamentosList.mockRejectedValue(new Error('Falha no banco de dados'));

    const req = new Request('http://localhost:3000/api/pendencias-cancelamentos');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual({ error: 'Erro interno ao consultar pendências e cancelamentos' });
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
