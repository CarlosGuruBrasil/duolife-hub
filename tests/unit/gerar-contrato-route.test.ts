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
  isNet4LifeCorretora: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/system-settings', () => ({
  getZapSignConfig: mockGetZapSignConfig,
  sanitizeApiToken: (t: string) => t,
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
    mockVerifyAuth.mockResolvedValue(mockUser);
    mockGetAccessibleQuoteById.mockResolvedValue(mockCotacao);
    mockGetCorretoraParaContrato.mockResolvedValue({
      id: 'corretora_net4life_001',
      razaoSocial: 'NETFORLIFE TECNOLOGIA LTDA',
      nomeFantasia: 'NET4LIFE',
      cnpj: '07.351.909/0001-33',
      susep: '202058392',
      email: 'contato@net4life.com.br',
      phone: '(48) 99139-4912',
      enderecoFormatado: 'Florianópolis/SC',
      cidade: 'Florianópolis',
      uf: 'SC',
      logoBuffer: null,
      logoMimeType: null,
      isNet4Life: true,
    });
    mockGetZapSignConfig.mockResolvedValue({
      apiToken: 'test_token',
      baseUrl: 'https://api.zapsign.com.br/api/v1',
      isSandbox: true,
      docGenerationMode: 'dynamic_pdf',
    });
    mockGerarContratoPdfGotenberg.mockResolvedValue({
      base64: 'JVBERi0xLjQK...',
      docName: 'Proposta_RC.pdf',
      signatarioProponente: { nome: 'Carlos Eduardo', email: 'carlos@teste.com' },
      signatarioCorretora: { nome: 'NET4LIFE', email: 'contato@net4life.com.br' },
    });
    mockCriarDocumentoZapSignDireto.mockResolvedValue({
      docToken: 'zap_doc_token_123',
      signUrl: 'https://app.zapsign.com.br/verificar/123',
      signers: [
        { name: 'Carlos Eduardo', email: 'carlos@teste.com', signUrl: 'https://app.zapsign.com.br/verificar/123', status: 'pending' },
        { name: 'NET4LIFE', email: 'contato@net4life.com.br', signUrl: 'https://app.zapsign.com.br/verificar/456', status: 'pending' },
      ],
      rawPayload: { token: 'zap_doc_token_123' },
    });
    mockSql.mockResolvedValue([]);
  });

  it('deve gerar contrato com sucesso no modo dynamic_pdf', async () => {
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

  it('deve retornar mensagem amigável se a ZapSign falhar', async () => {
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
});
