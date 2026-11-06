import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockSql,
  mockAuthenticateWixRequest,
  mockUpsertInsuranceClient,
  mockResolvePartnerForWix,
  mockEnsureSaleForPaidQuote,
} = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);

  return {
    mockSql: sqlFn,
    mockAuthenticateWixRequest: vi.fn(),
    mockUpsertInsuranceClient: vi.fn(),
    mockResolvePartnerForWix: vi.fn(),
    mockEnsureSaleForPaidQuote: vi.fn(),
  };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/wix-integration-auth', () => ({
  authenticateWixRequest: mockAuthenticateWixRequest,
  resolvePartnerForWix: mockResolvePartnerForWix,
}));

vi.mock('@/lib/insurance-ops', () => ({
  upsertInsuranceClient: mockUpsertInsuranceClient,
  ensureSaleForPaidQuote: mockEnsureSaleForPaidQuote,
}));

describe('POST /api/v1/integracao/wix/cotacoes/sincronizar-venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve rejeitar requisição não autorizada', async () => {
    mockAuthenticateWixRequest.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Não autorizado' }, { status: 401 }),
    });

    const { POST } = await import('../../app/api/v1/integracao/wix/cotacoes/sincronizar-venda/route');
    const req = new NextRequest('https://duolife.com.br/api/v1/integracao/wix/cotacoes/sincronizar-venda', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('deve sincronizar com sucesso proposta, contrato, cobrança e gerar venda se quitado', async () => {
    mockAuthenticateWixRequest.mockResolvedValueOnce({
      authorized: true,
      context: { authenticated: true, clientId: 'env-wix' },
    });

    mockResolvePartnerForWix.mockResolvedValueOnce({
      id: 'partner-001',
      name: 'Net4Life Corretora',
      corretoraId: 'corretora-001',
      corretoraNome: 'NET4Life Corretora de Seguros',
    });

    mockUpsertInsuranceClient.mockResolvedValueOnce({
      id: 'client-uuid-1',
      documentNumber: '11833626761',
      fullName: 'Advogado Teste',
    });

    // Mock sql calls:
    // 1. Resolve product prod-rc-001
    // 2. Check existing quote by cpf
    // 3. Insert or update quote
    // 4. Upsert document_signatures
    // 5. Upsert payment_orders
    // 6. Upsert payment_installments
    mockSql.mockImplementation((strings: any) => {
      const query = Array.isArray(strings) ? strings.join('') : String(strings);

      if (query.includes('FROM products')) {
        return Promise.resolve([{ id: 'prod-rc-001' }]);
      }
      if (query.includes('FROM cotacoes WHERE')) {
        return Promise.resolve([]); // nenhuma cotação prévia
      }
      if (query.includes('INSERT INTO cotacoes')) {
        return Promise.resolve([{ id: 'cotacao-uuid-1', status: 'emitida' }]);
      }
      if (query.includes('document_signatures')) {
        return Promise.resolve([{ id: 'doc-sig-1' }]);
      }
      if (query.includes('payment_orders')) {
        return Promise.resolve([{ id: 'order-1' }]);
      }
      if (query.includes('payment_installments')) {
        return Promise.resolve([{ id: 'inst-1' }]);
      }
      return Promise.resolve([]);
    });

    mockEnsureSaleForPaidQuote.mockResolvedValueOnce({
      saleId: 'sale-uuid-1',
      policyNumber: 'DL-RC-ADV-11833626761',
      created: true,
    });

    const { POST } = await import('../../app/api/v1/integracao/wix/cotacoes/sincronizar-venda/route');
    const req = new NextRequest('https://duolife.com.br/api/v1/integracao/wix/cotacoes/sincronizar-venda', {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Advogado Teste',
        cpf: '118.336.267-61',
        email: 'advogado@teste.com',
        celular: '11999998888',
        oab: '123456',
        tipo: '100k',
        valor: 310.00,
        parcela: 1,
        status: 'Quitado',
        statusGeral: 'Negócio Fechado',
        statusPagamento: 'Quitado',
        token: 'zapsign-token-123',
        urlProposta: 'https://app.zapsign.com.br/verificar/zapsign-token-123',
        checkoutId: 'pay_asaas_123',
        installment: 'inst_asaas_123',
        linkBoleto: 'https://asaas.com/b/123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.cotacaoId).toBe('cotacao-uuid-1');
    expect(json.saleId).toBe('sale-uuid-1');
    expect(mockEnsureSaleForPaidQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        cotacaoId: 'cotacao-uuid-1',
      })
    );
  });

  it('deve rejeitar requisição com CPF inválido ou ausente', async () => {
    mockAuthenticateWixRequest.mockResolvedValueOnce({
      authorized: true,
      context: { authenticated: true, clientId: 'env-wix' },
    });

    const { POST } = await import('../../app/api/v1/integracao/wix/cotacoes/sincronizar-venda/route');
    const req = new NextRequest('https://duolife.com.br/api/v1/integracao/wix/cotacoes/sincronizar-venda', {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Sem CPF',
        cpf: '123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('não deve emitir apólice se a proposta estiver pendente de pagamento', async () => {
    mockAuthenticateWixRequest.mockResolvedValueOnce({
      authorized: true,
      context: { authenticated: true, clientId: 'env-wix' },
    });

    mockResolvePartnerForWix.mockResolvedValueOnce({
      id: 'partner-001',
      name: 'Net4Life Corretora',
      corretoraId: 'corretora-001',
      corretoraNome: 'NET4Life Corretora de Seguros',
    });

    mockUpsertInsuranceClient.mockResolvedValueOnce({
      id: 'client-uuid-2',
      documentNumber: '11833626761',
      fullName: 'Cliente Pendente',
    });

    mockSql.mockImplementation((strings: any) => {
      const query = Array.isArray(strings) ? strings.join('') : String(strings);
      if (query.includes('FROM products')) return Promise.resolve([{ id: 'prod-rc-001' }]);
      if (query.includes('FROM cotacoes WHERE')) return Promise.resolve([]);
      if (query.includes('INSERT INTO cotacoes')) return Promise.resolve([{ id: 'cotacao-uuid-2' }]);
      return Promise.resolve([]);
    });

    const { POST } = await import('../../app/api/v1/integracao/wix/cotacoes/sincronizar-venda/route');
    const req = new NextRequest('https://duolife.com.br/api/v1/integracao/wix/cotacoes/sincronizar-venda', {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Cliente Pendente',
        cpf: '118.336.267-61',
        status: 'Boleto Gerado',
        statusGeral: 'Pendente de Pagamento',
        statusPagamento: 'Falta Pagamento',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.saleId).toBeNull();
    expect(mockEnsureSaleForPaidQuote).not.toHaveBeenCalled();
  });
});
