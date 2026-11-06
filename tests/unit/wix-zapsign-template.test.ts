import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  determinarTemplateZapSignNet4Life,
  montarVariaveisTemplateZapSign,
} from '@/lib/zapsign-template-service';
import { DEFAULT_ZAPSIGN_TEMPLATES } from '@/lib/system-settings';

const {
  mockSql,
  mockAuthenticateWixRequest,
  mockGetZapSignConfig,
  mockCancelarDocumentoZapSign,
} = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);

  return {
    mockSql: sqlFn,
    mockAuthenticateWixRequest: vi.fn(),
    mockGetZapSignConfig: vi.fn(),
    mockCancelarDocumentoZapSign: vi.fn(),
  };
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

vi.mock('@/lib/wix-integration-auth', () => ({
  authenticateWixRequest: mockAuthenticateWixRequest,
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

vi.mock('@/lib/zapsign-direct-docs', () => ({
  cancelarDocumentoZapSign: mockCancelarDocumentoZapSign,
  criarDocumentoZapSignDireto: vi.fn(),
}));

import { POST } from '../../app/api/v1/integracao/wix/cotacoes/[id]/gerar-contrato/route';

describe('Resolução de Modelos e Variáveis ZapSign Net4Life', () => {
  it('deve selecionar o Template 100k para propostas novas de 100 mil', () => {
    const res = determinarTemplateZapSignNet4Life({
      tipo: '100k',
      cobertura: '100.000,00',
      isRenovacao: 'Não',
    });
    expect(res.templateId).toBe(DEFAULT_ZAPSIGN_TEMPLATES.PLANO_100K);
    expect(res.tipoContrato).toBe('100k');
    expect(res.is100k).toBe(true);
    expect(res.isRenovacao).toBe(false);
  });

  it('deve selecionar o Template Renovação para proposta 100k com renovação ativa', () => {
    const res = determinarTemplateZapSignNet4Life({
      tipo: '100k',
      renovacao: true,
    });
    expect(res.templateId).toBe(DEFAULT_ZAPSIGN_TEMPLATES.RENOVACAO);
    expect(res.tipoContrato).toBe('100k_renovacao');
    expect(res.isRenovacao).toBe(true);
  });

  it('deve selecionar o Template Renovação para proposta 300k com renovação ativa', () => {
    const res = determinarTemplateZapSignNet4Life({
      tipo: '300k',
      isRenovacao: 'Sim',
    });
    expect(res.templateId).toBe(DEFAULT_ZAPSIGN_TEMPLATES.RENOVACAO);
    expect(res.tipoContrato).toBe('renovacao');
    expect(res.isRenovacao).toBe(true);
  });

  it('deve selecionar o Template Oficial Padrão para 300k/500k/1mi novo', () => {
    const res = determinarTemplateZapSignNet4Life({
      tipo: '300k',
      cobertura: '300.000,00',
      isRenovacao: 'Não',
    });
    expect(res.templateId).toBe(DEFAULT_ZAPSIGN_TEMPLATES.OFICIAL);
    expect(res.tipoContrato).toBe('oficial');
    expect(res.isRenovacao).toBe(false);
  });

  it('deve montar variáveis com dados higienizados e endereço formatado', () => {
    const cotacao = {
      id: 'cot_123',
      client_name: 'Carlos Augusto Duarte',
      client_cpf_cnpj: '03545174905',
      client_email: 'carlosad1981@gmail.com',
      client_phone: '48984148790',
      premio_final: 310,
    };

    const clientData = {
      dataNascto: '1981-11-08',
      logradouro: 'Servidão Inácia de Medeiros',
      numero: '52',
      bairro: 'Córrego Grande',
      cidade: 'Florianópolis',
      uf: 'SC',
      cep: '88037-065',
      oab: '34567',
      dataAtividade: '2020-11-03',
      associadoEscritorio: 'Não',
      faturamentoAntes: 'R$ 200.000,00',
      faturamentoDepois: 'R$ 300.000,00',
    };

    const { variaveis, dataArray } = montarVariaveisTemplateZapSign(clientData, cotacao);

    expect(variaveis.nome).toBe('Carlos Augusto Duarte');
    expect(variaveis.cpf).toBe('035.451.749-05');
    expect(variaveis.email).toBe('carlosad1981@gmail.com');
    expect(variaveis.oab).toBe('34567');
    expect(variaveis.dataNascto).toBe('08/11/1981');
    expect(variaveis.inicioProfissional).toBe('03/11/2020');
    expect(variaveis.escritorio).toBe('Não associado');
    expect(variaveis.faturamentoAntes).toBe('R$ 200.000,00');
    expect(variaveis.faturamentoDepois).toBe('R$ 300.000,00');
    expect(variaveis.endereco).toContain('Servidão Inácia de Medeiros, nº 52');
    expect(variaveis.lgpd).toBe('X');

    // Verifica que nenhum item no dataArray possui valor nulo ou undefined
    for (const item of dataArray) {
      expect(typeof item.de).toBe('string');
      expect(typeof item.para).toBe('string');
      expect(item.para).not.toBe('null');
      expect(item.para).not.toBe('undefined');
    }
  });
});

describe('POST /api/v1/integracao/wix/cotacoes/[id]/gerar-contrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateWixRequest.mockResolvedValue({ authorized: true });
    mockGetZapSignConfig.mockResolvedValue({
      apiToken: 'fake_zapsign_token',
      baseUrl: 'https://api.zapsign.com.br/api/v1',
      isSandbox: true,
      templateOficial: '0ba7013e-3550-4f1d-92d8-2582810a3a9e',
      template100k: '22efcc24-aa53-4c84-9946-e81ef2e0c197',
      templateRenovacao: '3718fe53-33f1-47c6-80c3-d7adccc09db7',
    });
  });

  it('deve rejeitar se não autorizado pela autenticação Wix', async () => {
    mockAuthenticateWixRequest.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Não autorizado' }, { status: 401 }),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/integracao/wix/cotacoes/cot_123/gerar-contrato', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot_123' }) });
    expect(res.status).toBe(401);
  });

  it('deve gerar contrato via modelo ZapSign (tokens) para proposta do Wix e gravar no banco', async () => {
    const mockCotacao = {
      id: 'cot_wix_999',
      client_name: 'Carlos Augusto Duarte',
      client_cpf_cnpj: '03545174905',
      client_email: 'carlosad1981@gmail.com',
      client_phone: '48984148790',
      premio_final: 310,
      status: 'rascunho',
      client_data: {
        tipo: '100k',
        parcela: 1,
      },
    };

    mockSql.mockImplementation((strings: any) => {
      const query = Array.isArray(strings) ? strings.join('') : String(strings);
      if (query.includes('FROM cotacoes WHERE id =')) {
        return [mockCotacao];
      }
      if (query.includes('FROM signature_documents')) {
        return []; // Nenhum documento existente
      }
      return [];
    });

    let capturedPayload: any = null;
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (String(url).includes('/models/create-doc/')) {
        capturedPayload = JSON.parse(init.body);
        return {
          ok: true,
          text: async () => JSON.stringify({
            token: 'zap_doc_token_wix_789',
            signers: [{ sign_url: 'https://app.zapsign.com.br/verificar/wix_789' }],
          }),
        } as any;
      }
      return { ok: true, text: async () => '{}' } as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/integracao/wix/cotacoes/cot_wix_999/gerar-contrato', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'cot_wix_999' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.docToken).toBe('zap_doc_token_wix_789');
    expect(body.signUrl).toBe('https://app.zapsign.com.br/verificar/wix_789');
    expect(body.status).toBe('contrato_gerado');

    // Verifica que o payload enviado à ZapSign utilizou o Template 100k e enviou tokens
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.template_id).toBe('22efcc24-aa53-4c84-9946-e81ef2e0c197');
    expect(capturedPayload.signer_name).toBe('Carlos Augusto Duarte');
    expect(capturedPayload.data).toBeDefined();
    expect(Array.isArray(capturedPayload.data)).toBe(true);

    // Garante que NENHUM base64_pdf foi enviado
    expect(capturedPayload.base64_pdf).toBeUndefined();

    globalFetchSpy.mockRestore();
  });
});
