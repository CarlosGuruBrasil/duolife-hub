import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildContractDataForQuote,
  renderContractHtmlForQuote,
  gerarContratoPdfGotenberg,
} from '@/lib/gotenberg-contract-generator';

// Mocks para módulos externos
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  sqlMock.json = (val: any) => JSON.stringify(val);
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/corretora-resolver', () => ({
  getCorretoraParaContrato: vi.fn().mockResolvedValue({
    id: 'corretora_net4life_001',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
    nomeFantasia: 'NET4LIFE CORRETORA',
    cnpj: '07.351.909/0001-33',
    susep: '10.203040/00',
    email: 'contato@net4life.com.br',
    phone: '(11) 98765-4321',
    enderecoFormatado: 'Av. Paulista, 1000 - Bela Vista - São Paulo/SP',
    cidade: 'São Paulo',
    uf: 'SP',
    logoBuffer: null,
    logoMimeType: null,
    isNet4Life: true,
  }),
  isNet4LifeCorretora: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/pricing', () => ({
  calcularPrecoServidor: vi.fn().mockResolvedValue({
    valorTotal: 790,
    qtdParcelas: 1,
    valorParcela: 790,
    descontoPercentual: 0,
    valorOriginal: 790,
  }),
}));

vi.mock('@/lib/gotenberg-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gotenberg-client')>();
  return {
    ...actual,
    isGotenbergAvailable: vi.fn().mockResolvedValue(true),
    convertHtmlToPdf: vi.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4 Mocked Gotenberg PDF Stream'),
      base64: Buffer.from('%PDF-1.4 Mocked Gotenberg PDF Stream').toString('base64'),
      size: 42,
    }),
  };
});

import { sql } from '@/lib/pg';
import { isGotenbergAvailable, convertHtmlToPdf } from '@/lib/gotenberg-client';

describe('gotenberg-contract-generator.test.ts - Integração do Motor Gotenberg na Esteira de Cotações', () => {
  const mockCotacao = {
    id: 'cot_test_gotenberg_001',
    client_name: 'Dra. Maria Clara Fernandes',
    client_cpf_cnpj: '12345678909',
    client_email: 'maria.adv@exemplo.com.br',
    client_phone: '11999998888',
    importancia_segurada: 100000,
    premio_final: 790,
    client_data: JSON.stringify({
      logradouro: 'Rua das Flores',
      numero: '123',
      bairro: 'Jardins',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01400-000',
      dataNascto: '1985-04-15',
      dataAtividade: '2010-02-10',
      oab: '123456/SP',
      tipo: '100k',
      parcela: 1,
      cobertura: '100.000,00',
      franquia: 'Sem franquia',
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (sql as any).mockResolvedValue([mockCotacao]);
    vi.mocked(isGotenbergAvailable).mockResolvedValue(true);
  });

  describe('1. Compilação de Dados da Cotação (buildContractDataForQuote)', () => {
    it('deve extrair e formatar com precisão os dados cadastrais do proponente', async () => {
      const result = await buildContractDataForQuote('cot_test_gotenberg_001');

      expect(result.contractData.proponente?.nome).toBe('Dra. Maria Clara Fernandes');
      expect(result.contractData.proponente?.cpf).toBe('123.456.789-09');
      expect(result.contractData.proponente?.email).toBe('maria.adv@exemplo.com.br');
      expect(result.contractData.proponente?.celular).toBe('11999998888');
      expect(result.contractData.proponente?.oab).toBe('123456/SP');
      expect(result.contractData.proponente?.inicioProfissional).toBe('10/02/2010');
      expect(result.contractData.proponente?.endereco).toContain('Rua das Flores');
      expect(result.contractData.proponente?.endereco).toContain('nº 123');
      expect(result.contractData.proponente?.endereco).toContain('CEP: 01400-000');
    });

    it('deve compilar corretamente as condições comerciais e a corretora', async () => {
      const result = await buildContractDataForQuote('cot_test_gotenberg_001');

      expect(result.contractData.condicoes?.importanciaSegurada).toContain('100.000,00');
      expect(result.contractData.condicoes?.valorPremio).toContain('790,00');
      expect(result.contractData.condicoes?.vigencia).toBe('1 ano');
      expect(result.contractData.condicoes?.estipulante).toBe('DUOLIFE PLATAFORMA DE NEGÓCIOS');
      expect(result.contractData.condicoes?.corretora).toBe('NET4LIFE CORRETORA');
      expect(result.contractData.corretora?.nomeFantasia).toBe('NET4LIFE CORRETORA');
      expect(result.contractData.corretora?.cnpj).toBe('07.351.909/0001-33');
    });

    it('deve formatar o nome do documento com padrão canônico seguro', async () => {
      const result = await buildContractDataForQuote('cot_test_gotenberg_001');

      expect(result.docName).toMatch(/^Proposta_RC_100k_NET4LIFECORRETORA_Dra__Maria_Clara_Fernandes_COT_TEST\.pdf$/);
    });
  });

  describe('2. Renderização de HTML A4 e Âncoras ZapSign (renderContractHtmlForQuote)', () => {
    it('deve gerar HTML timbrado completo com cabeçalho, rodapé e as âncoras ZapSign', async () => {
      const { html, docName } = await renderContractHtmlForQuote('cot_test_gotenberg_001');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('contract-sheet-root');
      expect(html).toContain('Dra. Maria Clara Fernandes');
      expect(html).toContain('123.456.789-09');
      expect(html).toContain('10/02/2010');
      expect(html).toContain('123456/SP');
      expect(html).toContain('NET4LIFE CORRETORA');

      // Validação Crítica: As âncoras da ZapSign devem existir no HTML para assinatura instantânea
      expect(html).toContain('{{assinatura_proponente}}');
      expect(html).toContain('{{assinatura_corretora}}');

      expect(docName).toContain('.pdf');
    });
  });

  describe('3. Geração via Gotenberg com Circuit Breaker / Fallback', () => {
    it('deve gerar PDF via Gotenberg quando o serviço estiver disponível', async () => {
      const result = await gerarContratoPdfGotenberg('cot_test_gotenberg_001');

      expect(result.engine).toBe('gotenberg');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.base64).toBeTruthy();
      expect(result.signatarioProponente?.nome).toBe('Dra. Maria Clara Fernandes');
      expect(result.signatarioCorretora?.nome).toBe('NET4LIFE CORRETORA');
      expect(vi.mocked(convertHtmlToPdf)).toHaveBeenCalledTimes(1);
    });

    it('deve executar fallback transparente para PDF-Lib quando forceFallback=true', async () => {
      const result = await gerarContratoPdfGotenberg('cot_test_gotenberg_001', { forceFallback: true });

      expect(result.engine).toBe('pdflib_fallback');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.base64).toBeTruthy();
      expect(result.docName).toContain('.pdf');
      // Não deve ter chamado convertHtmlToPdf
      expect(vi.mocked(convertHtmlToPdf)).not.toHaveBeenCalled();
    });

    it('deve executar fallback transparente para PDF-Lib quando o Gotenberg estiver offline', async () => {
      vi.mocked(isGotenbergAvailable).mockResolvedValueOnce(false);

      const result = await gerarContratoPdfGotenberg('cot_test_gotenberg_001');

      expect(result.engine).toBe('pdflib_fallback');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.base64).toBeTruthy();
      expect(vi.mocked(convertHtmlToPdf)).not.toHaveBeenCalled();
    });

    it('deve recuperar com fallback para PDF-Lib se convertHtmlToPdf lançar exceção', async () => {
      vi.mocked(convertHtmlToPdf).mockRejectedValueOnce(new Error('Gotenberg 500 Internal Server Error'));

      const result = await gerarContratoPdfGotenberg('cot_test_gotenberg_001');

      expect(result.engine).toBe('pdflib_fallback');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.base64).toBeTruthy();
    });
  });
});
