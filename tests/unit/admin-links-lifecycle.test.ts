import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks para módulos externos
vi.mock('@/lib/auth', () => ({
  verifyAdminAuth: vi.fn(),
  isPlatformAdmin: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: 'Não autorizado' }, { status: 401 })),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { PATCH, DELETE } from '../../app/api/admin/parceiros/[id]/links/[linkId]/route';
import { verifyAdminAuth, isPlatformAdmin } from '@/lib/auth';
import { sql } from '@/lib/pg';

describe('Admin Links Lifecycle - PATCH e DELETE /api/admin/parceiros/[id]/links/[linkId]', () => {
  const partnerId = 'partner-uuid-123';
  const linkId = 'link-uuid-456';
  const params = Promise.resolve({ id: partnerId, linkId });

  const adminUser = {
    userId: 'admin-1',
    name: 'Super Admin',
    role: 'platform_admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Autenticação e Autorização (PATCH e DELETE)', () => {
    it('PATCH deve retornar 401 se verifyAdminAuth retornar null', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Não autorizado');
    });

    it('PATCH deve retornar 403 se isPlatformAdmin retornar false', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValueOnce({ userId: 'corretor-1', role: 'corretor' } as any);
      vi.mocked(isPlatformAdmin).mockReturnValueOnce(false);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('exclusivos de administradores');
    });

    it('DELETE deve retornar 401 se verifyAdminAuth retornar null', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Não autorizado');
    });

    it('DELETE deve retornar 403 se isPlatformAdmin retornar false', async () => {
      vi.mocked(verifyAdminAuth).mockResolvedValueOnce({ userId: 'corretor-1', role: 'corretor' } as any);
      vi.mocked(isPlatformAdmin).mockReturnValueOnce(false);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('exclusivos de administradores');
    });
  });

  describe('2. Validação de Payload (PATCH)', () => {
    beforeEach(() => {
      vi.mocked(verifyAdminAuth).mockResolvedValue(adminUser as any);
      vi.mocked(isPlatformAdmin).mockReturnValue(true);
    });

    it('deve rejeitar status com valor inválido', async () => {
      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'deleted' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
    });

    it('deve rejeitar discountPercent acima do limite máximo (40)', async () => {
      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ discountPercent: 45 }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
    });

    it('deve rejeitar discountPercent negativo', async () => {
      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ discountPercent: -5 }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
    });

    it('deve rejeitar JSON malformado', async () => {
      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: '{ malformed json',
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('JSON inválido');
    });
  });

  describe('3. Ciclo de Vida e Atualização via PATCH', () => {
    beforeEach(() => {
      vi.mocked(verifyAdminAuth).mockResolvedValue(adminUser as any);
      vi.mocked(isPlatformAdmin).mockReturnValue(true);
    });

    it('deve atualizar status para "inactive" com sucesso', async () => {
      const updatedRow = {
        id: linkId,
        token: 'dlk_test_123',
        partner_id: partnerId,
        product_id: 'prod-rc-med-001',
        flow_type: 'external',
        label: 'Campanha Black Friday',
        status: 'inactive',
        discount_percent: 15,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (sql as any).mockResolvedValueOnce([updatedRow] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.status).toBe('inactive');
      expect(data.link.url).toContain('/contratar/dlk_test_123');
    });

    it('deve atualizar status para "active" com sucesso', async () => {
      const updatedRow = {
        id: linkId,
        token: 'dlk_test_123',
        partner_id: partnerId,
        product_id: 'prod-rc-med-001',
        flow_type: 'external',
        label: 'Campanha Reativada',
        status: 'active',
        discount_percent: 10,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (sql as any).mockResolvedValueOnce([updatedRow] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.status).toBe('active');
    });

    it('deve atualizar label e discountPercent via PATCH com sucesso', async () => {
      const updatedRow = {
        id: linkId,
        token: 'dlk_test_789',
        partner_id: partnerId,
        product_id: null,
        flow_type: 'external',
        label: 'Desconto Exclusivo Parceiro',
        status: 'active',
        discount_percent: 25,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (sql as any).mockResolvedValueOnce([updatedRow] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: 'Desconto Exclusivo Parceiro',
          discountPercent: 25,
        }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.label).toBe('Desconto Exclusivo Parceiro');
      expect(data.link.discount_percent).toBe(25);
    });

    it('deve retornar 404 se o link não pertencer ao parceiro ou não existir', async () => {
      (sql as any).mockResolvedValueOnce([] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: 'Link Fantasma' }),
      });

      const res = await PATCH(req, { params });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });
  });

  describe('4. Desativação de Link via DELETE', () => {
    beforeEach(() => {
      vi.mocked(verifyAdminAuth).mockResolvedValue(adminUser as any);
      vi.mocked(isPlatformAdmin).mockReturnValue(true);
    });

    it('deve desativar o link com sucesso retornando mensagem de confirmação', async () => {
      const updatedRow = {
        id: linkId,
        status: 'inactive',
        updated_at: new Date().toISOString(),
      };

      (sql as any).mockResolvedValueOnce([updatedRow] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link desativado com sucesso');
    });

    it('deve retornar 404 se o link não existir ao tentar desativar', async () => {
      (sql as any).mockResolvedValueOnce([] as any);

      const req = new NextRequest(`http://localhost/api/admin/parceiros/${partnerId}/links/${linkId}`, {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });
  });
});
