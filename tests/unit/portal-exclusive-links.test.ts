import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  canManageOwnCompany: vi.fn(() => true),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  isDevUser: vi.fn(() => false),
  isPlatformAdmin: vi.fn(() => false),
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

vi.mock('@/lib/link-tracker', () => ({
  calculateConversionMetrics: vi.fn(() => ({
    conversionRateCotacao: '0.0%',
    conversionRateVenda: '0.0%',
    fechamentoRate: '0.0%',
  })),
  extractClientAccessData: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'test', referer: '' })),
  trackSaleLinkAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/white-label', () => ({
  resolveHierarchicalWhiteLabel: vi.fn(() => ({
    companyName: 'Parceiro Teste',
    logoUrl: '',
    primaryColor: '#0e4a5a',
  })),
}));

vi.mock('@/lib/contrato-link-resolver', () => ({
  resolveContratoSignUrl: vi.fn().mockResolvedValue(null),
}));

import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { POST } from '../../app/api/portal/links/route';
import { GET as getPublicContratacao } from '../../app/api/public/contratacao/[token]/route';

describe('Portal Exclusive Links - Criação e Acesso Público', () => {
  const mockSql = sql as any;
  const loggedUser = {
    userId: 'user-01',
    partnerId: 'partner-100',
    role: 'partner_sales',
    name: 'Vendedor',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Criação no Portal (POST /api/portal/links)', () => {
    it('deve criar link geral com sucesso', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedUser as any);
      mockSql
        // partner_product_availability
        .mockResolvedValueOnce([{ is_active: true }])
        // product
        .mockResolvedValueOnce([{ id: 'prod-rc-001', name: 'RC Geral' }])
        // insert
        .mockResolvedValueOnce([{
          id: 'link-01',
          token: 'dlk_geral_123',
          partner_id: 'partner-100',
          is_exclusive: false,
          max_uses: null,
          used_count: 0,
        }]);

      const req = new NextRequest('http://localhost/api/portal/links', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'prod-rc-001',
          discountPercent: 10,
          label: 'Campanha Geral',
          isExclusive: false,
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.link.is_exclusive).toBe(false);
    });

    it('deve criar link exclusivo para cliente específico com CPF e teto de 1 uso', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedUser as any);
      mockSql
        .mockResolvedValueOnce([{ is_active: true }])
        .mockResolvedValueOnce([{ id: 'prod-rc-001', name: 'RC Geral' }])
        .mockResolvedValueOnce([{
          id: 'link-exclusive-01',
          token: 'dlk_excl_123',
          partner_id: 'partner-100',
          is_exclusive: true,
          target_document: '52998224725',
          target_name: 'Doutor João Silva',
          max_uses: 1,
          used_count: 0,
        }]);

      const req = new NextRequest('http://localhost/api/portal/links', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'prod-rc-001',
          discountPercent: 15,
          label: 'Link Exclusivo Dr. João',
          isExclusive: true,
          targetDocument: '529.982.247-25',
          targetName: 'Doutor João Silva',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.link.is_exclusive).toBe(true);
      expect(data.link.target_document).toBe('52998224725');
      expect(data.link.max_uses).toBe(1);
    });

    it('deve rejeitar se targetDocument for inválido em link exclusivo', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedUser as any);

      const req = new NextRequest('http://localhost/api/portal/links', {
        method: 'POST',
        body: JSON.stringify({
          isExclusive: true,
          targetDocument: '123', // Incompleto
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Dados inválidos');
    });
  });

  describe('Acesso Público (/api/public/contratacao/[token])', () => {
    it('deve retornar 404 se o link exclusivo já tiver sido utilizado (used_count >= max_uses)', async () => {
      mockSql.mockResolvedValueOnce([
        {
          id: 'link-used-01',
          token: 'dlk_used_999',
          partner_id: 'partner-100',
          status: 'active',
          is_exclusive: true,
          max_uses: 1,
          used_count: 1, // Já atingiu
        },
      ]);

      const req = new NextRequest('http://localhost/api/public/contratacao/dlk_used_999');
      const res = await getPublicContratacao(req, { params: Promise.resolve({ token: 'dlk_used_999' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('expirado ou já utilizado');
    });

    it('deve retornar dados do link exclusivo quando ativo e disponível', async () => {
      mockSql.mockResolvedValueOnce([
        {
          id: 'link-act-01',
          token: 'dlk_act_123',
          partner_id: 'partner-100',
          product_id: 'prod-rc-001',
          flow_type: 'external',
          label: 'Link Dr. Roberto',
          status: 'active',
          discount_percent: 15,
          is_exclusive: true,
          target_document: '52998224725',
          target_name: 'Dr. Roberto',
          max_uses: 1,
          used_count: 0,
          razao_social: 'Corretora Top',
          nome_fantasia: 'Top Seguros',
          email: 'contato@top.com.br',
          product_name: 'RC Profissional',
          product_code: 'RC-001',
        },
      ]);

      const req = new NextRequest('http://localhost/api/public/contratacao/dlk_act_123');
      const res = await getPublicContratacao(req, { params: Promise.resolve({ token: 'dlk_act_123' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.link.isExclusive).toBe(true);
      expect(data.link.targetDocument).toBe('52998224725');
      expect(data.link.targetName).toBe('Dr. Roberto');
    });
  });
});
