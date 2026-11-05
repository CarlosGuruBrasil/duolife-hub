import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockVerifyAuth,
  mockIsInternalUser,
  mockGetPartnerAccessContext,
  mockReconcileAsaasBatch,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockIsInternalUser: vi.fn(),
  mockGetPartnerAccessContext: vi.fn(),
  mockReconcileAsaasBatch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyAuth: mockVerifyAuth,
  isInternalUser: mockIsInternalUser,
  getPartnerAccessContext: mockGetPartnerAccessContext,
  unauthorized: () =>
    new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('@/lib/asaas-sync', () => ({
  reconcileAsaasBatch: mockReconcileAsaasBatch,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { POST } from '../../app/api/pendencias-cancelamentos/sync/route';

describe('POST /api/pendencias-cancelamentos/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 401 quando o usuário não estiver autenticado', async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/pendencias-cancelamentos/sync', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Não autorizado');
    expect(mockReconcileAsaasBatch).not.toHaveBeenCalled();
  });

  it('deve retornar 403 quando o perfil não tiver contexto de acesso válido', async () => {
    mockVerifyAuth.mockResolvedValue({
      userId: 'user-unknown',
      role: 'unknown_role',
    });
    mockIsInternalUser.mockReturnValue(false);
    mockGetPartnerAccessContext.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/pendencias-cancelamentos/sync', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Acesso negado para este perfil');
    expect(mockReconcileAsaasBatch).not.toHaveBeenCalled();
  });

  it('deve executar sincronização global com o Asaas para administradores internos', async () => {
    mockVerifyAuth.mockResolvedValue({
      userId: 'admin-1',
      role: 'duolife_admin',
    });
    mockIsInternalUser.mockReturnValue(true);

    mockReconcileAsaasBatch.mockResolvedValue({
      totalProcessed: 12,
      updatedToPaid: 3,
      alreadyPaid: 5,
      stillPending: 4,
      errors: 0,
      durationMs: 850,
      details: [],
    });

    const req = new NextRequest('http://localhost:3000/api/pendencias-cancelamentos/sync', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.totalProcessed).toBe(12);
    expect(data.updatedToPaid).toBe(3);
    expect(mockReconcileAsaasBatch).toHaveBeenCalledWith({
      partnerId: undefined,
      limit: 50,
      onlyPending: true,
      skipNotifications: true,
    });
  });

  it('deve executar sincronização com isolamento de partnerId para corretores/parceiros', async () => {
    mockVerifyAuth.mockResolvedValue({
      userId: 'broker-1',
      role: 'partner_broker',
    });
    mockIsInternalUser.mockReturnValue(false);
    mockGetPartnerAccessContext.mockResolvedValue({
      partnerId: 'partner-abc-123',
      corretoraId: null,
      isCorretoraUser: false,
      isInternal: false,
      partnerRole: 'broker',
      role: 'partner_broker',
      visibleUserIds: ['broker-1'],
    });

    mockReconcileAsaasBatch.mockResolvedValue({
      totalProcessed: 4,
      updatedToPaid: 1,
      alreadyPaid: 2,
      stillPending: 1,
      errors: 0,
      durationMs: 420,
      details: [],
    });

    const req = new NextRequest('http://localhost:3000/api/pendencias-cancelamentos/sync', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.totalProcessed).toBe(4);
    expect(data.updatedToPaid).toBe(1);
    expect(mockReconcileAsaasBatch).toHaveBeenCalledWith({
      partnerId: 'partner-abc-123',
      limit: 25,
      onlyPending: true,
      skipNotifications: true,
    });
  });

  it('deve retornar 500 caso ocorra falha inesperada na reconciliação do Asaas', async () => {
    mockVerifyAuth.mockResolvedValue({
      userId: 'admin-1',
      role: 'duolife_admin',
    });
    mockIsInternalUser.mockReturnValue(true);
    mockReconcileAsaasBatch.mockRejectedValue(new Error('Gateway timeout'));

    const req = new NextRequest('http://localhost:3000/api/pendencias-cancelamentos/sync', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Erro ao sincronizar cobranças com o Asaas');
  });
});
