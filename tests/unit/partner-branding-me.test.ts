import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  canManageOwnCompany: vi.fn(),
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

vi.mock('@/lib/referral', () => ({
  getOrCreatePartnerSaleLink: vi.fn().mockResolvedValue({
    id: 'link-01',
    token: 'dlk_demo',
    url: 'http://localhost/contratar/dlk_demo',
    directUrl: 'http://localhost/contratar/dlk_demo',
    refUrl: 'http://localhost/?ref=dlk_demo',
    code: 'dlk_demo',
  }),
}));

import { verifyPartnerAuth, canManageOwnCompany } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { PUT } from '../../app/api/parceiros/me/route';

describe('Partner Branding Validation - PUT (/api/parceiros/me)', () => {
  const mockSql = sql as any;
  const mockPartnerUser = {
    userId: 'user-01',
    partnerId: 'partner-100',
    corretoraId: 'corretora-50',
    role: 'partner_sales',
    partnerRole: 'director',
    name: 'Diretor Corretora',
    email: 'diretor@corretora.com.br',
  };

  const baseValidPayload = {
    nomeFantasia: 'Corretora Alpha Prime',
    email: 'contato@alphaprime.com.br',
    phone: '11988887777',
    city: 'Joinville',
    state: 'SC',
    street: 'Rua das Palmeiras, 100',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve rejeitar cor primária inválida', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(mockPartnerUser as any);
    vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

    const req = new NextRequest('http://localhost/api/parceiros/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseValidPayload,
        primaryColor: '#12345', // Inválido (5 caracteres)
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Cor primária inválida');
  });

  it('deve rejeitar cor secundária inválida', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(mockPartnerUser as any);
    vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

    const req = new NextRequest('http://localhost/api/parceiros/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseValidPayload,
        secondaryColor: 'blue', // Inválido (nome da cor)
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Cor secundária inválida');
  });

  it('deve rejeitar cor de destaque com caracteres não-hex', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(mockPartnerUser as any);
    vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

    const req = new NextRequest('http://localhost/api/parceiros/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseValidPayload,
        accentColor: '#GGGGGG', // Inválido (letras fora de hex)
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Cor de destaque inválida');
  });

  it('deve aceitar e mesclar cores hex válidas e permitir remoção de logoUrl com string vazia', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(mockPartnerUser as any);
    vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

    let updatedMetadata: any = null;
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const q = strings.join('?');
      if (q.includes('FROM partners')) {
        return [
          {
            id: 'partner-100',
            metadata: {
              whiteLabel: {
                primaryColor: '#000000',
                logoUrl: 'https://exemplo.com/logo-antigo.png',
              },
            },
          },
        ];
      }
      if (q.includes('UPDATE partners')) {
        // Encontra o metadata nos values do UPDATE
        const metaVal = values.find((v) => typeof v === 'string' && v.includes('primaryColor'));
        if (metaVal) {
          updatedMetadata = JSON.parse(metaVal);
        }
        return [
          {
            id: 'partner-100',
            razao_social: 'Corretora Alpha Prime LTDA',
            nome_fantasia: 'Corretora Alpha Prime',
            email: 'contato@alphaprime.com.br',
            status: 'active',
            metadata: updatedMetadata || {},
          },
        ];
      }
      return [];
    });

    const req = new NextRequest('http://localhost/api/parceiros/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseValidPayload,
        primaryColor: '#0e4a5a',
        secondaryColor: '#7fa8b2',
        accentColor: '#00d4e0',
        logoUrl: '', // Remoção de logotipo
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(updatedMetadata).toBeDefined();
    expect(updatedMetadata.whiteLabel.primaryColor).toBe('#0e4a5a');
    expect(updatedMetadata.whiteLabel.secondaryColor).toBe('#7fa8b2');
    expect(updatedMetadata.whiteLabel.accentColor).toBe('#00d4e0');
    expect(updatedMetadata.whiteLabel.logoUrl).toBe('');
  });

  it('deve persistir cores na corretora quando o usuário for gestor de corretora', async () => {
    const corretoraUser = {
      ...mockPartnerUser,
      partnerId: null,
      corretoraId: 'corretora-50',
    };
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(corretoraUser as any);
    vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

    let updatedCorretoraMetadata: any = null;
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const q = strings.join('?');
      if (q.includes('FROM corretoras')) {
        return [
          {
            id: 'corretora-50',
            metadata: {},
          },
        ];
      }
      if (q.includes('UPDATE corretoras')) {
        const metaVal = values.find((v) => typeof v === 'string' && v.includes('primaryColor'));
        if (metaVal) {
          updatedCorretoraMetadata = JSON.parse(metaVal);
        }
        return [
          {
            id: 'corretora-50',
            razao_social: 'Corretora 50 LTDA',
            nome_fantasia: 'Corretora 50',
            email: 'contato@corretora50.com.br',
            status: 'active',
            metadata: updatedCorretoraMetadata || {},
          },
        ];
      }
      return [];
    });

    const req = new NextRequest('http://localhost/api/parceiros/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseValidPayload,
        primaryColor: '#064e3b',
        secondaryColor: '#34d399',
        accentColor: '#10b981',
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(updatedCorretoraMetadata).toBeDefined();
    expect(updatedCorretoraMetadata.whiteLabel.primaryColor).toBe('#064e3b');
    expect(updatedCorretoraMetadata.whiteLabel.secondaryColor).toBe('#34d399');
    expect(updatedCorretoraMetadata.whiteLabel.accentColor).toBe('#10b981');
  });
});
