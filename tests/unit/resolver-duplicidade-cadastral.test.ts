import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  getPartnerAccessContext: vi.fn(),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn().mockResolvedValue([]);
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { verifyPartnerAuth, getPartnerAccessContext } from '@/lib/auth';
import { POST } from '../../app/api/portal/cotacoes/[id]/resolver-duplicidade/route';

describe('Resolução de Duplicidade Cadastral (POST /api/portal/cotacoes/[id]/resolver-duplicidade)', () => {
  const loggedPartner = {
    userId: 'user-sales-10',
    partnerId: 'partner-100',
    role: 'partner_sales',
  };

  const sampleConflictQuote = {
    id: 'cotacao-conflict-01',
    partner_id: 'partner-100',
    client_id: 'client-orig-01',
    status: 'pendente_duplicidade',
    client_name: 'Novo Nome Digitado',
    client_cpf_cnpj: '12345678901',
    client_email: 'novo@email.com',
    client_phone: '11999990000',
    client_data: {
      nome: 'Novo Nome Digitado',
      email: 'novo@email.com',
      celular: '11999990000',
    },
    cadastral_conflict: {
      hasConflict: true,
      resolved: false,
      originalClientId: 'client-orig-01',
      originalData: {
        fullName: 'Nome Original no Banco',
        email: 'original@email.com',
        phone: '11988887777',
        birthDate: '1985-05-15',
      },
      submittedData: {
        fullName: 'Novo Nome Digitado',
        email: 'novo@email.com',
        phone: '11999990000',
        birthDate: '1985-05-15',
      },
      divergentFields: ['nome', 'email', 'celular'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve rejeitar requisição não autenticada com 401', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/portal/cotacoes/cot-1/resolver-duplicidade', {
      method: 'POST',
      body: JSON.stringify({ choice: 'MANTER_ORIGINAL' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot-1' }) });
    expect(res.status).toBe(401);
  });

  it('deve rejeitar escolha inválida com 400', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartner as any);
    vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
      partnerId: 'partner-100',
      isCorretoraUser: false,
      visibleUserIds: null,
    } as any);

    const req = new NextRequest('http://localhost/api/portal/cotacoes/cot-1/resolver-duplicidade', {
      method: 'POST',
      body: JSON.stringify({ choice: 'ESCOLHA_INVENTADA' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot-1' }) });
    expect(res.status).toBe(400);
  });

  it('deve resolver conflito escolhendo MANTER_ORIGINAL', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartner as any);
    vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
      partnerId: 'partner-100',
      isCorretoraUser: false,
      visibleUserIds: null,
    } as any);

    // 1. SELECT da cotação
    mockSql.mockResolvedValueOnce([sampleConflictQuote]);
    // 2. UPDATE cotacoes (reverte para original e marca resolvido)
    mockSql.mockResolvedValueOnce([{ id: 'cotacao-conflict-01', status: 'rascunho' }]);
    // 3. INSERT audit log
    mockSql.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/portal/cotacoes/cotacao-conflict-01/resolver-duplicidade', {
      method: 'POST',
      body: JSON.stringify({ choice: 'MANTER_ORIGINAL' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cotacao-conflict-01' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.resolution).toBe('MANTER_ORIGINAL');
    expect(data.status).toBe('rascunho');
  });

  it('deve resolver conflito escolhendo USAR_NOVOS atualizando insurance_clients', async () => {
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(loggedPartner as any);
    vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
      partnerId: 'partner-100',
      isCorretoraUser: false,
      visibleUserIds: null,
    } as any);

    // 1. SELECT da cotação
    mockSql.mockResolvedValueOnce([sampleConflictQuote]);
    // 2. UPDATE insurance_clients
    mockSql.mockResolvedValueOnce([{ id: 'client-orig-01' }]);
    // 3. UPDATE cotacoes
    mockSql.mockResolvedValueOnce([{ id: 'cotacao-conflict-01', status: 'rascunho' }]);
    // 4. INSERT audit log
    mockSql.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/portal/cotacoes/cotacao-conflict-01/resolver-duplicidade', {
      method: 'POST',
      body: JSON.stringify({ choice: 'USAR_NOVOS' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cotacao-conflict-01' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.resolution).toBe('USAR_NOVOS');
    expect(data.status).toBe('rascunho');
  });
});
