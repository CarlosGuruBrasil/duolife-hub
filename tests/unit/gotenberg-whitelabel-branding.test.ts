import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderA4SheetHtml,
  buildContractDataForQuote,
  renderContractHtmlForQuote,
} from '@/lib/gotenberg-contract-generator';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn();
  fn.json = (val: any) => JSON.stringify(val);
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

vi.mock('@/lib/corretora-resolver', () => ({
  getCorretoraParaContrato: vi.fn().mockResolvedValue({
    id: 'corretora_alfa_001',
    razaoSocial: 'ALFA SEGUROS E PREVIDENCIA LTDA',
    nomeFantasia: 'ALFA SEGUROS',
    cnpj: '12.345.678/0001-99',
    susep: '15414.90001/01',
    email: 'atendimento@alfaseguros.com.br',
    phone: '(11) 98765-4321',
    enderecoFormatado: 'Rua das Flores, 123, Sala 401, Bela Vista, São Paulo/SP, CEP: 01310-000',
    cidade: 'São Paulo',
    uf: 'SP',
    logoBuffer: Buffer.from('fake-logo-data'),
    logoMimeType: 'image/png',
    isNet4Life: false,
    website: 'alfaseguros.com.br',
    footerText: 'Rua das Flores, 123, Sala 401, Bela Vista, São Paulo/SP, CEP: 01310-000',
    primaryColor: '#0055aa',
    isWhiteLabel: true,
  }),
  isNet4LifeCorretora: vi.fn().mockReturnValue(false),
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

describe('gotenberg-whitelabel-branding.test.ts - Branding White-Label em PDF Gotenberg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderA4SheetHtml - Renderização de Cabeçalho e Rodapé', () => {
    it('deve renderizar o cabeçalho e rodapé personalizados com dados da marca White-Label', () => {
      const html = renderA4SheetHtml({
        innerHtml: '<p>Conteudo do Contrato</p>',
        corretoraNome: 'Alfa Seguros Parceira',
        corretoraLogoUrl: 'https://cdn.alfa.com/logo.png',
        corretoraEndereco: 'Av. Paulista, 1500, São Paulo/SP',
        corretoraContato: '(11) 98765-4321 • suporte@alfa.com.br',
        corretoraWebsite: 'alfaseguros.com.br',
        corretoraCnpj: '12.345.678/0001-99',
        footerText: 'Rua das Flores, 123, Bela Vista, São Paulo/SP, CEP: 01310-000',
        primaryColor: '#0055aa',
      });

      // Cabeçalho deve conter o logotipo customizado
      expect(html).toContain('src="https://cdn.alfa.com/logo.png"');
      expect(html).toContain('alt="Alfa Seguros Parceira"');

      // Rodapé deve conter o endereço da marca parceira
      expect(html).toContain('Rua das Flores, 123, Bela Vista, São Paulo/SP, CEP: 01310-000');

      // Rodapé deve conter os contatos e website da marca parceira
      expect(html).toContain('alfaseguros.com.br');
      expect(html).toContain('(11) 98765-4321 • suporte@alfa.com.br');
      expect(html).toContain('CNPJ: 12.345.678/0001-99');
    });

    it('deve usar fallback institucional seguro caso os dados do parceiro não sejam fornecidos', () => {
      const html = renderA4SheetHtml({
        innerHtml: '<p>Conteudo do Contrato</p>',
      });

      // Se não há logo, renderiza tipografia padrão
      expect(html).toContain('Corretora Parceira');
      expect(html).toContain('Corretora de Seguros');

      // Rodapé institucional padrão
      expect(html).toContain('Avenida Brigadeiro Faria Lima, 3477');
      expect(html).toContain('kevseguros.com.br');
    });
  });

  describe('buildContractDataForQuote & renderContractHtmlForQuote', () => {
    const mockCotacao = {
      id: 'cot-wl-9988',
      client_name: 'Dra. Beatriz Santos',
      client_cpf_cnpj: '11122233344',
      client_email: 'beatriz@advogados.com.br',
      client_phone: '11999998888',
      client_data: {
        tipoDePlano: 'individual',
        oab: 'OAB/SP 432.100',
        logradouro: 'Alameda Santos, 500',
        bairro: 'Cerqueira César',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01418-000',
      },
      premio_calculado: 790,
      premio_final: 790,
      importancia_segurada: 100000,
      partner_id: 'partner-alfa-01',
    };

    it('deve construir os dados do contrato injetando metadados White-Label na estrutura de corretora', async () => {
      mockSql.mockResolvedValueOnce([mockCotacao]);

      const data = await buildContractDataForQuote('cot-wl-9988');

      expect(data.contractData.corretora?.nome).toBe('ALFA SEGUROS');
      expect(data.contractData.corretora?.cnpj).toBe('12.345.678/0001-99');
      expect(data.contractData.corretora?.website).toBe('alfaseguros.com.br');
      expect(data.contractData.corretora?.email).toBe('atendimento@alfaseguros.com.br');
      expect(data.contractData.corretora?.phone).toBe('(11) 98765-4321');
      expect(data.contractData.corretora?.primaryColor).toBe('#0055aa');
    });

    it('deve renderizar o HTML final incorporando o endereço e website White-Label no rodapé', async () => {
      mockSql.mockResolvedValueOnce([mockCotacao]);

      const result = await renderContractHtmlForQuote('cot-wl-9988');

      expect(result.html).toContain('alfaseguros.com.br');
      expect(result.html).toContain('12.345.678/0001-99');
      expect(result.html).toContain('Rua das Flores, 123');
    });
  });
});
