import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/contrato-link-resolver', () => ({
  resolveContratoSignUrl: vi.fn(),
}));

import { sql } from '@/lib/pg';
import { resolveContratoSignUrl } from '@/lib/contrato-link-resolver';
import { GET } from '../../app/api/public/contratacao/[token]/route';

describe('Public Contratação Link Status (/api/public/contratacao/[token])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 404 quando o link possuir status = "inactive"', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);

    // O helper resolveLink busca WHERE pl.token = ${token} AND pl.status = 'active'
    // Simulando que para um link com status = 'inactive', o banco não retorna nenhum registro ativo
    const mockSql = sql as any;
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join('?');
      if (query.includes('FROM public_sale_links')) {
        // Como a cláusula SQL filtra `pl.status = 'active'`, um link inativo retorna vazio
        return [];
      }
      return [];
    });

    const req = new NextRequest('http://localhost/api/public/contratacao/token-inativo-123');
    const res = await GET(req, { params: Promise.resolve({ token: 'token-inativo-123' }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Link inválido ou expirado');
  });

  it('deve retornar 404 quando o token não for encontrado no banco de dados', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);

    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/public/contratacao/token-inexistente');
    const res = await GET(req, { params: Promise.resolve({ token: 'token-inexistente' }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Link inválido ou expirado');
  });

  it('deve retornar 200 e dados do link quando o link for ativo e válido', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);

    const activeLinkData = {
      id: 'link-active-01',
      token: 'dlk_active_123',
      partner_id: 'partner-001',
      product_id: 'prod-rc-001',
      flow_type: 'external',
      label: 'Campanha Médicos 2026',
      status: 'active',
      expires_at: null,
      used_at: null,
      metadata: {},
      created_at: new Date().toISOString(),
      discount_percent: 10,
      razao_social: 'Corretora Modelo LTDA',
      nome_fantasia: 'Modelo Seguros',
      email: 'contato@modeloseguros.com.br',
      phone: '11999998888',
      partner_metadata: {},
      product_name: 'RC Profissional',
      product_code: 'RC-001',
    };

    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([activeLinkData]);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_active_123');
    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_active_123' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.link).toBeDefined();
    expect(data.link.token).toBe('dlk_active_123');
    expect(data.link.label).toBe('Campanha Médicos 2026');
    expect(data.link.discountPercent).toBe(10);
    expect(data.link.partner.id).toBe('partner-001');
    expect(data.link.partner.nomeFantasia).toBe('Modelo Seguros');
    expect(data.link.product.id).toBe('prod-rc-001');
    expect(data.link.url).toContain('/contratar/dlk_active_123');
  });

  it('deve priorizar redirecionamento de assinatura ZapSign quando encontrado pelo resolveContratoSignUrl', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce('https://app.zapsign.com.br/verificar/doc-xyz');

    const req = new NextRequest('http://localhost/api/public/contratacao/cot_com_contrato_123');
    const res = await GET(req, { params: Promise.resolve({ token: 'cot_com_contrato_123' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.redirect).toBe(true);
    expect(data.signUrl).toBe('https://app.zapsign.com.br/verificar/doc-xyz');
  });
});
