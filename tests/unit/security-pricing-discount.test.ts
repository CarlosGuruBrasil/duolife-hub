import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn().mockResolvedValue([]);
  fn.begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fn));
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
  seedInitialData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    verifyAuth: vi.fn(),
    unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  };
});

vi.mock('@/lib/pricing', () => ({
  calcularPrecoServidor: vi.fn(),
}));

vi.mock('@/lib/insurance-ops', () => ({
  handleClientRegistrationIntegrity: vi.fn().mockResolvedValue({
    client: { id: 'client-1' },
    isNew: true,
    hasDuplicateConflict: false,
  }),
}));

import { verifyAuth } from '@/lib/auth';
import { calcularPrecoServidor } from '@/lib/pricing';
import { POST } from '../../app/api/cotacoes/route';

describe('Task 5: Validação de Autorização para Desconto Manual Comercial (VULN-06)', () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.clearAllMocks();
  });

  it('deve ZERAR o desconto manual quando enviado por um corretor comum (partner_broker)', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'broker-user-01',
      partnerId: 'partner-01',
      role: 'partner_broker',
      partnerRole: 'broker',
      permissions: {},
    } as any);

    // 1. SELECT product
    mockSql.mockResolvedValueOnce([
      {
        id: 'prod-rc-001',
        flow_key: 'rc_advogados_v1',
        code: 'RC-001',
        category: 'responsabilidade_civil',
        pricing_strategy: 'tabela_fixa',
      },
    ]);

    // 2. SELECT partner corretora
    mockSql.mockResolvedValueOnce([{ corretora_id: 'corr-01' }]);

    // 3. INSERT cotacao
    mockSql.mockResolvedValueOnce([
      {
        id: 'quote-created-01',
        status: 'rascunho',
      },
    ]);

    vi.mocked(calcularPrecoServidor).mockResolvedValue({
      valorTotal: 1000,
      qtdParcelas: 1,
      valorParcela: 1000,
      descontoPercentual: 0,
      descontoValor: 0,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/cotacoes', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'prod-rc-001',
        clientName: 'Dr. Teste',
        clientCpfCnpj: '12345678901',
        clientData: {
          tipoDePlano: 'advogado-anual',
          parcela: 1,
          descontoManualPercent: 35, // Injeção de 35% de desconto manual
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(calcularPrecoServidor).toHaveBeenCalled();
    const calledParams = vi.mocked(calcularPrecoServidor).mock.calls[0][0];

    // O descontoManualPercent repassado ao motor DEVE ser 0, pois o corretor comum não tem permissão
    expect(calledParams.descontoManualPercent).toBe(0);
  });

  it('deve PERMITIR o desconto manual quando enviado por um Diretor ou Administrador da Corretora', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'admin-corr-01',
      corretoraId: 'corr-01',
      role: 'corretora_admin',
      permissions: {},
    } as any);

    // 1. SELECT default partner
    mockSql.mockResolvedValueOnce([{ id: 'partner-corr-01' }]);
    // 2. SELECT partner_user
    mockSql.mockResolvedValueOnce([{ id: 'user-leader' }]);
    // 3. SELECT product
    mockSql.mockResolvedValueOnce([
      {
        id: 'prod-rc-001',
        flow_key: 'rc_advogados_v1',
        code: 'RC-001',
        category: 'responsabilidade_civil',
        pricing_strategy: 'tabela_fixa',
      },
    ]);
    // 3.1. SELECT partner corretora
    mockSql.mockResolvedValueOnce([{ corretora_id: 'corr-01' }]);
    // 4. INSERT cotacao
    mockSql.mockResolvedValueOnce([
      {
        id: 'quote-created-02',
        status: 'rascunho',
      },
    ]);

    vi.mocked(calcularPrecoServidor).mockResolvedValue({
      valorTotal: 700,
      qtdParcelas: 1,
      valorParcela: 700,
      descontoPercentual: 30,
      descontoValor: 300,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/cotacoes', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'prod-rc-001',
        clientName: 'Dr. Diretor Teste',
        clientCpfCnpj: '12345678901',
        clientData: {
          tipoDePlano: 'advogado-anual',
          parcela: 1,
          descontoManualPercent: 30, // Desconto autorizado por diretoria
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(calcularPrecoServidor).toHaveBeenCalled();
    const calledParams = vi.mocked(calcularPrecoServidor).mock.calls[0][0];

    // O descontoManualPercent DEVE ser mantido (30) para o diretor
    expect(calledParams.descontoManualPercent).toBe(30);
  });
});
