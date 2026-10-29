import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { PATCH, DELETE } from '../../app/api/portal/links/[id]/route';

describe('Portal Links Lifecycle - PATCH & DELETE (/api/portal/links/[id])', () => {
  const mockSql = sql as any;
  const loggedPartnerUser = {
    userId: 'user-sales-01',
    partnerId: 'partner-100',
    role: 'partner_sales',
    name: 'Vendedor Teste',
    email: 'vendedor@exemplo.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Autenticação e Autorização', () => {
    it('deve rejeitar com 401 se verifyPartnerAuth retornar null no PATCH', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Não autorizado');
    });

    it('deve rejeitar com 401 se verifyPartnerAuth retornar null no DELETE', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Não autorizado');
    });

    it('deve retornar 400 se nenhum parceiro ativo estiver associado ao usuário', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce({
        userId: 'user-sem-parceiro',
        role: 'partner_sales',
      } as any);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Nenhum parceiro ativo');
    });
  });

  describe('2. Validação Zod no PATCH', () => {
    it('deve rejeitar com 400 quando o status for inválido', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'status_invalido_xyz' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
      expect(data.details).toHaveProperty('status');
    });

    it('deve rejeitar com 400 quando o label for muito longo (>100 caracteres)', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'a'.repeat(101) }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
      expect(data.details).toHaveProperty('label');
    });
  });

  describe('3. Isolamento Multi-tenant e Checagem de Existência', () => {
    it('deve retornar 404 se o link não pertencer ao parceiro logado no PATCH', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      // O link existe no banco, mas pertence a outro parceiro ('outro-parceiro-999')
      mockSql.mockResolvedValueOnce([
        {
          id: 'link-01',
          partner_id: 'outro-parceiro-999',
          status: 'active',
          token: 'dlk_outro_123',
        },
      ]);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });

    it('deve retornar 404 se o link não existir no PATCH', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      // Link não encontrado no banco
      mockSql.mockResolvedValueOnce([]);

      const req = new NextRequest('http://localhost/api/portal/links/link-inexistente', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-inexistente' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });

    it('deve retornar 404 se o link não pertencer ao parceiro logado no DELETE', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      mockSql.mockResolvedValueOnce([
        {
          id: 'link-01',
          partner_id: 'outro-parceiro-999',
          status: 'active',
        },
      ]);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });

    it('deve retornar 404 se o link não existir no DELETE', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      mockSql.mockResolvedValueOnce([]);

      const req = new NextRequest('http://localhost/api/portal/links/link-inexistente', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-inexistente' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Link não encontrado');
    });
  });

  describe('4. Sucesso de Atualização e Desativação (PATCH e DELETE)', () => {
    it('deve ter sucesso ao atualizar status para "inactive" via PATCH', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const existingLink = {
        id: 'link-01',
        partner_id: 'partner-100',
        token: 'dlk_teste_01',
        label: 'Link Campanha Q1',
        flow_type: 'external',
        status: 'active',
        discount_percent: 5,
        expires_at: null,
        created_at: new Date().toISOString(),
      };

      const updatedLink = {
        ...existingLink,
        status: 'inactive',
        updated_at: new Date().toISOString(),
      };

      mockSql
        .mockResolvedValueOnce([existingLink]) // 1. SELECT existing
        .mockResolvedValueOnce([updatedLink]); // 2. UPDATE returning

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.status).toBe('inactive');
      expect(data.link.url).toContain('/contratar/dlk_teste_01');
    });

    it('deve ter sucesso ao atualizar status para "active" via PATCH', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const existingLink = {
        id: 'link-01',
        partner_id: 'partner-100',
        token: 'dlk_teste_01',
        label: 'Link Campanha Q1',
        flow_type: 'external',
        status: 'inactive',
        discount_percent: 5,
        expires_at: null,
        created_at: new Date().toISOString(),
      };

      const updatedLink = {
        ...existingLink,
        status: 'active',
        updated_at: new Date().toISOString(),
      };

      mockSql
        .mockResolvedValueOnce([existingLink]) // 1. SELECT existing
        .mockResolvedValueOnce([updatedLink]); // 2. UPDATE returning

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.status).toBe('active');
    });

    it('deve ter sucesso ao atualizar label via PATCH mantendo o status anterior', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const existingLink = {
        id: 'link-01',
        partner_id: 'partner-100',
        token: 'dlk_teste_01',
        label: 'Nome Antigo',
        flow_type: 'external',
        status: 'active',
        discount_percent: 0,
        expires_at: null,
        created_at: new Date().toISOString(),
      };

      const updatedLink = {
        ...existingLink,
        label: 'Nome Atualizado 2026',
        updated_at: new Date().toISOString(),
      };

      mockSql
        .mockResolvedValueOnce([existingLink])
        .mockResolvedValueOnce([updatedLink]);

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'Nome Atualizado 2026' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.link.label).toBe('Nome Atualizado 2026');
      expect(data.link.status).toBe('active');
    });

    it('deve ter sucesso ao desativar via DELETE e retornar mensagem apropriada', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

      const existingLink = {
        id: 'link-01',
        partner_id: 'partner-100',
        token: 'dlk_teste_01',
        status: 'active',
      };

      mockSql
        .mockResolvedValueOnce([existingLink]) // 1. SELECT existing
        .mockResolvedValueOnce([]); // 2. UPDATE status = 'inactive'

      const req = new NextRequest('http://localhost/api/portal/links/link-01', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-01' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link desativado com sucesso');
    });

    it('deve resolver effectivePartnerId através de corretoraId caso partnerId não esteja setado diretamente', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce({
        userId: 'user-corretora-admin',
        corretoraId: 'corr-xyz-123',
        role: 'corretora_admin',
      } as any);

      const partnerResolved = { id: 'partner-from-corretora' };
      const existingLink = {
        id: 'link-02',
        partner_id: 'partner-from-corretora',
        token: 'dlk_corretora_02',
        status: 'active',
      };

      mockSql
        .mockResolvedValueOnce([partnerResolved]) // SELECT partner by corretora_id
        .mockResolvedValueOnce([existingLink])    // SELECT existing link
        .mockResolvedValueOnce([]);               // UPDATE status = 'inactive'

      const req = new NextRequest('http://localhost/api/portal/links/link-02', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'link-02' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe('Link desativado com sucesso');
    });
  });
});
