import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockSql,
  mockVerifyAuth,
  mockGetAccessibleQuoteById,
  mockGetCorretoraParaContrato,
  mockGetZapSignConfig,
  mockGerarContratoPdfGotenberg,
  mockCriarDocumentoZapSignDireto,
  mockIsNet4LifeCorretora,
} = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);

  return {
    mockSql: sqlFn,
    mockVerifyAuth: vi.fn(),
    mockGetAccessibleQuoteById: vi.fn(),
    mockGetCorretoraParaContrato: vi.fn(),
    mockGetZapSignConfig: vi.fn(),
    mockGerarContratoPdfGotenberg: vi.fn(),
    mockCriarDocumentoZapSignDireto: vi.fn(),
    mockIsNet4LifeCorretora: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({
  verifyAuth: mockVerifyAuth,
  unauthorized: vi.fn(() => Response.json({ error: 'Não autorizado' }, { status: 401 })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  rateLimitResponse: vi.fn(() => Response.json({ error: 'Rate limit' }, { status: 429 })),
}));

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/access', () => ({
  getAccessibleQuoteById: mockGetAccessibleQuoteById,
}));

vi.mock('@/lib/corretora-resolver', () => ({
  getCorretoraParaContrato: mockGetCorretoraParaContrato,
  isNet4LifeCorretora: mockIsNet4LifeCorretora,
}));

vi.mock('@/lib/system-settings', () => ({
  getZapSignConfig: mockGetZapSignConfig,
  sanitizeApiToken: (t: string) => t,
  DEFAULT_ZAPSIGN_TEMPLATES: {
    OFICIAL: '0ba7013e-3550-4f1d-92d8-2582810a3a9e',
    PLANO_100K: '22efcc24-aa53-4c84-9946-e81ef2e0c197',
    RENOVACAO: '3718fe53-33f1-47c6-80c3-d7adccc09db7',
  },
}));

vi.mock('@/lib/gotenberg-contract-generator', () => ({
  gerarContratoPdfGotenberg: mockGerarContratoPdfGotenberg,
}));

vi.mock('@/lib/zapsign-direct-docs', () => ({
  criarDocumentoZapSignDireto: mockCriarDocumentoZapSignDireto,
  cancelarDocumentoZapSign: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/triggers/dispatcher', () => ({
  dispatchDomainEvent: vi.fn().mockResolvedValue({ actionsExecutedCount: 1, errors: [] }),
}));

import { POST } from '../../app/api/portal/cotacoes/[id]/gerar-contrato/route';
import { cancelarDocumentoZapSign } from '@/lib/zapsign-direct-docs';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';

describe('POST /api/portal/cotacoes/[id]/gerar-contrato', () => {
  const mockUser = {
    userId: 'admin_123',
    email: 'admin@duolife.com.br',
    role: 'duolife_admin',
    partnerId: null,
  };

  const mockCotacao = {
    id: 'cot_abc123',
    client_name: 'Carlos Eduardo Souza',
    client_cpf_cnpj: '12345678909',
    client_email: 'carlos@teste.com',
    client_phone: '11999998888',
    status: 'novo',
    premio_final: 871,
    client_data: {
      tipo: '300k',
      parcela: 4,
      cupomCodigo: 'BONUS40',
      valor: 871,
      valorParcela: 217.75,
      contratoModo: 'dynamic_pdf',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNet4LifeCorretora.mockReturnValue(false); // Padrão: corretora parceira (dynamic_pdf)
    mockVerifyAuth.mockResolvedValue(mockUser);
    mockGetAccessibleQuoteById.mockResolvedValue(mockCotacao);
    mockGetCorretoraParaContrato.mockResolvedValue({
      id: 'corretora_parceira_001',
      razaoSocial: 'PARCEIRA SEGUROS LTDA',
      nomeFantasia: 'PARCEIRA CORRETORA',
      cnpj: '11.222.333/0001-44',
      susep: '123456789',
      email: 'contato@parceira.com.br',
      phone: '(11) 98765-4321',
      enderecoFormatado: 'São Paulo/SP',
      cidade: 'São Paulo',
      uf: 'SP',
      logoBuffer: null,
      logoMimeType: null,
      isNet4Life: false,
    });
    mockGetZapSignConfig.mockResolvedValue({
      apiToken: 'test_token',
      baseUrl: 'https://api.zapsign.com.br/api/v1',
      isSandbox: true,
      templateOficial: '0ba7013e-3550-4f1d-92d8-2582810a3a9e',
      template100k: '22efcc24-aa53-4c84-9946-e81ef2e0c197',
      templateRenovacao: '3718fe53-33f1-47c6-80c3-d7adccc09db7',
      docGenerationMode: 'dynamic_pdf',
    });
    mockGerarContratoPdfGotenberg.mockResolvedValue({
      base64: 'JVBERi0xLjQK...',
      docName: 'Proposta_RC.pdf',
      signatarioProponente: { nome: 'Carlos Eduardo', email: 'carlos@teste.com' },
      signatarioCorretora: { nome: 'PARCEIRA CORRETORA', email: 'contato@parceira.com.br' },
    });
    mockCriarDocumentoZapSignDireto.mockResolvedValue({
      docToken: 'zap_doc_token_123',
      signUrl: 'https://app.zapsign.com.br/verificar/123',
      signers: [
        { name: 'Carlos Eduardo', email: 'carlos@teste.com', signUrl: 'https://app.zapsign.com.br/verificar/123', status: 'pending' },
        { name: 'PARCEIRA CORRETORA', email: 'contato@parceira.com.br', signUrl: 'https://app.zapsign.com.br/verificar/456', status: 'pending' },
      ],
      rawPayload: { token: 'zap_doc_token_123' },
    });
    mockSql.mockResolvedValue([]);
  });

  it('deve gerar contrato com sucesso no modo dynamic_pdf para corretora parceira', async () => {
    const req = new NextRequest('http://localhost:3000/api/portal/cotacoes/cot_abc123/gerar-contrato', {
      method: 'POST',
      body: JSON.stringify({ forceRecreate: true }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot_abc123' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.docToken).toBe('zap_doc_token_123');
    expect(body.signUrl).toBe('https://app.zapsign.com.br/verificar/123');
    expect(body.contratoModo).toBe('dynamic_pdf');
    expect(body.totalAssinaturas).toBe(2);
  });

  it('deve gerar contrato no modo template (tokens) sem PDF para a corretora Net4Life', async () => {
    mockIsNet4LifeCorretora.mockReturnValue(true);

    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        token: 'zap_template_token_456',
        signers: [{ sign_url: 'https://app.zapsign.com.br/verificar/template_456' }],
      }),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/portal/cotacoes/cot_abc123/gerar-contrato', {
      method: 'POST',
      body: JSON.stringify({ forceRecreate: true }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot_abc123' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.docToken).toBe('zap_template_token_456');
    expect(body.signUrl).toBe('https://app.zapsign.com.br/verificar/template_456');
    expect(body.contratoModo).toBe('template');
    expect(body.totalAssinaturas).toBe(1);

    // Garante que Gotenberg NÃO foi chamado
    expect(mockGerarContratoPdfGotenberg).not.toHaveBeenCalled();
    expect(mockCriarDocumentoZapSignDireto).not.toHaveBeenCalled();

    globalFetchSpy.mockRestore();
  });

  it('deve retornar mensagem amigável se a ZapSign falhar no modo dynamic_pdf', async () => {
    mockCriarDocumentoZapSignDireto.mockRejectedValueOnce(new Error('Falha na API da ZapSign (/docs/): Token inválido'));

    const req = new NextRequest('http://localhost:3000/api/portal/cotacoes/cot_abc123/gerar-contrato', {
      method: 'POST',
      body: JSON.stringify({ forceRecreate: true }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot_abc123' }) });
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toContain('Falha na API da ZapSign');
  });
  describe('correção de contrato já assinado pelo cliente', () => {
    const criarCotacaoAssinada = () => ({
      ...mockCotacao,
      status: 'assinado',
      client_data: {
        ...mockCotacao.client_data,
        contratoToken: 'zap_doc_antigo',
        clienteAssinou: true,
        // Prazo de 7 dias vencido: não pode disparar regeração automática de contrato assinado
        contratoGeradoEm: '2020-01-01T00:00:00.000Z',
      },
    });

    const criarRequest = (body: Record<string, unknown>, headers?: Record<string, string>) =>
      new NextRequest('http://localhost:3000/api/portal/cotacoes/cot_abc123/gerar-contrato', {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      });

    it('recusa refazer contrato assinado sem motivo', async () => {
      mockGetAccessibleQuoteById.mockResolvedValue(criarCotacaoAssinada());

      const res = await POST(criarRequest({ forceRecreate: true }), { params: Promise.resolve({ id: 'cot_abc123' }) });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.requiresMotivo).toBe(true);
      expect(mockCriarDocumentoZapSignDireto).not.toHaveBeenCalled();
      expect(cancelarDocumentoZapSign).not.toHaveBeenCalled();
    });

    it('não regera contrato assinado sem pedido explícito, mesmo com prazo vencido', async () => {
      mockGetAccessibleQuoteById.mockResolvedValue(criarCotacaoAssinada());

      const res = await POST(criarRequest({}), { params: Promise.resolve({ id: 'cot_abc123' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyExisted).toBe(true);
      expect(body.docToken).toBe('zap_doc_antigo');
      expect(mockCriarDocumentoZapSignDireto).not.toHaveBeenCalled();
      expect(cancelarDocumentoZapSign).not.toHaveBeenCalled();
    });

    it('refaz com motivo: cria o novo antes de cancelar o antigo e não envia aviso automático', async () => {
      mockGetAccessibleQuoteById.mockResolvedValue(criarCotacaoAssinada());

      const res = await POST(
        criarRequest({ forceRecreate: true, motivoCorrecao: 'CPF digitado errado no contrato assinado' }),
        { params: Promise.resolve({ id: 'cot_abc123' }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.docToken).toBe('zap_doc_token_123');

      expect(cancelarDocumentoZapSign).toHaveBeenCalledWith('zap_doc_antigo');
      const ordemCriacao = mockCriarDocumentoZapSignDireto.mock.invocationCallOrder[0];
      const ordemCancelamento = vi.mocked(cancelarDocumentoZapSign).mock.invocationCallOrder[0];
      expect(ordemCriacao).toBeLessThan(ordemCancelamento);

      expect(dispatchDomainEvent).not.toHaveBeenCalled();
    });

    it('não cancela o contrato assinado se a criação do novo documento falhar', async () => {
      mockGetAccessibleQuoteById.mockResolvedValue(criarCotacaoAssinada());
      mockCriarDocumentoZapSignDireto.mockRejectedValueOnce(new Error('Falha na API da ZapSign (/docs/): indisponível'));

      const res = await POST(
        criarRequest({ forceRecreate: true, motivoCorrecao: 'CPF digitado errado no contrato assinado' }),
        { params: Promise.resolve({ id: 'cot_abc123' }) }
      );
      expect(res.status).toBe(500);
      expect(cancelarDocumentoZapSign).not.toHaveBeenCalled();
    });

    it('cliente pelo link público não consegue refazer contrato assinado', async () => {
      mockSql
        .mockResolvedValueOnce([{ partner_id: 'partner_001' }]) // public_sale_links
        .mockResolvedValueOnce([criarCotacaoAssinada()]); // cotação vinculada ao token

      const res = await POST(
        criarRequest(
          { forceRecreate: true, motivoCorrecao: 'tentativa pelo link público' },
          { 'x-public-token': 'dlk_publico_123' }
        ),
        { params: Promise.resolve({ id: 'cot_abc123' }) }
      );
      expect(res.status).toBe(409);
      expect(mockCriarDocumentoZapSignDireto).not.toHaveBeenCalled();
      expect(cancelarDocumentoZapSign).not.toHaveBeenCalled();
    });
  });
});
