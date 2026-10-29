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
  resolveContratoSignUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/link-tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/link-tracker')>();
  return {
    ...actual,
    trackSaleLinkAccess: vi.fn().mockResolvedValue({ tracked: true, isUnique: true }),
  };
});

import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { resolveContratoSignUrl } from '@/lib/contrato-link-resolver';
import { trackSaleLinkAccess } from '@/lib/link-tracker';
import { GET } from '../../app/api/public/contratacao/[token]/route';

describe('Public Contratação Access Tracking (/api/public/contratacao/[token])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockActiveLink = {
    id: 'link-trk-001',
    token: 'dlk_track_test',
    partner_id: 'partner-trk-88',
    product_id: 'prod-rc-001',
    flow_type: 'external',
    label: 'Link Rastreável Teste',
    status: 'active',
    expires_at: null,
    used_at: null,
    metadata: {},
    created_at: new Date().toISOString(),
    discount_percent: 5,
    razao_social: 'Parceiro Rastreamento LTDA',
    nome_fantasia: 'Rastreamento Seguros',
    email: 'track@teste.com',
    phone: '11999990000',
    partner_metadata: {},
    corretora_metadata: null,
    product_name: 'RC Profissional',
    product_code: 'RC-001',
  };

  it('deve chamar trackSaleLinkAccess com linkId, token, partnerId, ip, userAgent e referer quando o link for válido e ativo', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);
    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([mockActiveLink]);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_track_test', {
      headers: {
        'cf-connecting-ip': '187.50.20.10',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'referer': 'https://google.com/search?q=duolife',
      },
    });

    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_track_test' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.link).toBeDefined();
    expect(data.link.token).toBe('dlk_track_test');

    expect(trackSaleLinkAccess).toHaveBeenCalledTimes(1);
    expect(trackSaleLinkAccess).toHaveBeenCalledWith({
      linkId: 'link-trk-001',
      token: 'dlk_track_test',
      partnerId: 'partner-trk-88',
      ip: '187.50.20.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      referer: 'https://google.com/search?q=duolife',
    });
  });

  it('resiliência defensiva: deve retornar HTTP 200 normalmente mesmo se trackSaleLinkAccess falhar ou rejeitar', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);
    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([mockActiveLink]);

    const trackingError = new Error('Database connection timeout on link tracking');
    vi.mocked(trackSaleLinkAccess).mockRejectedValueOnce(trackingError);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_track_test', {
      headers: {
        'x-forwarded-for': '177.100.50.25',
      },
    });

    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_track_test' }) });
    const data = await res.json();

    // A requisição do cliente NÃO pode falhar por causa do tracking
    expect(res.status).toBe(200);
    expect(data.link).toBeDefined();
    expect(data.link.token).toBe('dlk_track_test');

    expect(trackSaleLinkAccess).toHaveBeenCalledTimes(1);

    // Permite que a promise rejeitada do tracking seja tratada pelo .catch assíncrono
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        trackErr: trackingError,
        token: 'dlk_track_test',
      }),
      'public.link.track_access_failed'
    );
  });

  it('não deve chamar trackSaleLinkAccess quando o link for inexistente ou inativo (retorno 404)', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce(null);
    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_inexistente', {
      headers: {
        'cf-connecting-ip': '187.50.20.10',
      },
    });

    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_inexistente' }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Link inválido ou expirado');
    expect(trackSaleLinkAccess).not.toHaveBeenCalled();
  });

  it('não deve chamar trackSaleLinkAccess quando a rota for redirecionada para assinatura de contrato', async () => {
    vi.mocked(resolveContratoSignUrl).mockResolvedValueOnce('https://app.zapsign.com.br/verificar/xyz');

    const req = new NextRequest('http://localhost/api/public/contratacao/token_contrato_existente');
    const res = await GET(req, { params: Promise.resolve({ token: 'token_contrato_existente' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.redirect).toBe(true);
    expect(trackSaleLinkAccess).not.toHaveBeenCalled();
  });
});
