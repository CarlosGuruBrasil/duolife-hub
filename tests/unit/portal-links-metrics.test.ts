import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
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

import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { GET } from '../../app/api/portal/links/route';

describe('Portal Links Metrics - GET (/api/portal/links)', () => {
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

  it('deve retornar métricas agregadas de acessos e taxas de conversão calculadas', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

    let capturedQuery = '';
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      capturedQuery = strings.join('?');
      return [
        {
          id: 'link-01',
          token: 'dlk_link_com_metricas',
          label: 'Campanha Google Ads',
          flow_type: 'external',
          status: 'active',
          discount_percent: 10,
          views_count: 100,
          unique_views_count: 60,
          last_accessed_at: '2026-10-29T15:00:00.000Z',
          expires_at: null,
          used_at: '2026-10-29T15:30:00.000Z',
          created_at: '2026-10-20T10:00:00.000Z',
          updated_at: '2026-10-29T15:00:00.000Z',
          metadata: {},
          product_id: 'prod-rc-001',
          product_name: 'RC Profissional',
          product_code: 'RC-001',
          total_cotacoes: 20,
          total_vendas: 5,
        },
      ];
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.links).toHaveLength(1);

    const link = data.links[0];
    expect(link.views_count).toBe(100);
    expect(link.unique_views_count).toBe(60);
    expect(link.total_cotacoes).toBe(20);
    expect(link.total_vendas).toBe(5);
    expect(link.conversion_rate_cotacao).toBe(20);
    expect(link.conversion_rate_venda).toBe(5);
    expect(link.fechamento_rate).toBe(25);

    // Validação de consulta SQL
    expect(capturedQuery).toContain('views_count');
    expect(capturedQuery).toContain('unique_views_count');
    expect(capturedQuery).toContain('COUNT(c.id) FILTER (WHERE c.status IN');
  });

  it('deve retornar taxas zeradas com segurança quando views_count for zero', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartnerUser as any);

    mockSql.mockResolvedValueOnce([
      {
        id: 'link-02',
        token: 'dlk_novo_link_sem_acessos',
        label: 'Link Novo Sem Acesso',
        flow_type: 'external',
        status: 'active',
        discount_percent: 0,
        views_count: 0,
        unique_views_count: 0,
        last_accessed_at: null,
        expires_at: null,
        used_at: null,
        created_at: '2026-10-29T12:00:00.000Z',
        updated_at: '2026-10-29T12:00:00.000Z',
        metadata: {},
        product_id: 'prod-rc-001',
        product_name: 'RC Profissional',
        product_code: 'RC-001',
        total_cotacoes: 0,
        total_vendas: 0,
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const link = data.links[0];
    expect(link.views_count).toBe(0);
    expect(link.unique_views_count).toBe(0);
    expect(link.total_cotacoes).toBe(0);
    expect(link.total_vendas).toBe(0);
    expect(link.conversion_rate_cotacao).toBe(0);
    expect(link.conversion_rate_venda).toBe(0);
    expect(link.fechamento_rate).toBe(0);
  });
});
