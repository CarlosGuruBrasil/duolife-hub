import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { sql } from '@/lib/pg';
import {
  resolveWhiteLabelForPartnerId,
  resolveWhiteLabelForQuoteId,
  resolveWhiteLabelForContext,
  buildEmailWhiteLabelVariables,
} from '@/lib/email-whitelabel';
import { DEFAULT_WHITE_LABEL } from '@/lib/white-label';

describe('Email White-Label Resolution & Variables (src/lib/email-whitelabel)', () => {
  const mockSql = sql as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveWhiteLabelForPartnerId', () => {
    it('deve retornar DEFAULT_WHITE_LABEL se o partnerId for nulo ou vazio', async () => {
      const res = await resolveWhiteLabelForPartnerId('');
      expect(res).toEqual(DEFAULT_WHITE_LABEL);
    });

    it('deve retornar DEFAULT_WHITE_LABEL se o parceiro não for encontrado no banco', async () => {
      mockSql.mockResolvedValueOnce([]);
      const res = await resolveWhiteLabelForPartnerId('partner-inexistente');
      expect(res).toEqual(DEFAULT_WHITE_LABEL);
    });

    it('deve herdar atributos da corretora mãe quando o parceiro não possui customização própria', async () => {
      mockSql.mockResolvedValueOnce([
        {
          id: 'partner-001',
          email: 'contato@parceiro.com.br',
          metadata: {
            whiteLabel: {
              companyName: 'Consultor João',
              companyPhone: '11988887777',
            },
          },
          corretora_metadata: {
            whiteLabel: {
              companyName: 'Corretora Mãe Seguros',
              logoUrl: 'https://cdn.duolife.com/corretora-logo.png',
              primaryColor: '#0a2540',
              accentColor: '#00d4ff',
              companyEmail: 'atendimento@corretoramae.com.br',
              susep: 'SUSEP-998877',
            },
          },
        },
      ]);

      const res = await resolveWhiteLabelForPartnerId('partner-001');

      expect(res.companyName).toBe('Consultor João'); // Prioridade do parceiro
      expect(res.companyPhone).toBe('11988887777'); // Do parceiro
      expect(res.logoUrl).toBe('https://cdn.duolife.com/corretora-logo.png'); // Herdado da corretora
      expect(res.primaryColor).toBe('#0a2540'); // Herdado da corretora
      expect(res.accentColor).toBe('#00d4ff'); // Herdado da corretora
      expect(res.companyEmail).toBe('atendimento@corretoramae.com.br'); // Herdado da corretora
      expect(res.susep).toBe('SUSEP-998877'); // Herdado da corretora
    });
  });

  describe('resolveWhiteLabelForQuoteId', () => {
    it('deve retornar DEFAULT_WHITE_LABEL se o quoteId for inválido', async () => {
      const res = await resolveWhiteLabelForQuoteId('');
      expect(res).toEqual(DEFAULT_WHITE_LABEL);
    });

    it('deve retornar DEFAULT_WHITE_LABEL se a cotação não existir ou não tiver partner_id', async () => {
      mockSql.mockResolvedValueOnce([{ partner_id: null }]);
      const res = await resolveWhiteLabelForQuoteId('quote-sem-parceiro');
      expect(res).toEqual(DEFAULT_WHITE_LABEL);
    });

    it('deve buscar o parceiro da cotação e resolver o white-label correspondente', async () => {
      // 1ª chamada: busca cotação
      mockSql.mockResolvedValueOnce([{ partner_id: 'partner-from-quote' }]);
      // 2ª chamada: busca parceiro com corretora
      mockSql.mockResolvedValueOnce([
        {
          id: 'partner-from-quote',
          email: 'quote-partner@example.com',
          metadata: {
            whiteLabel: {
              companyName: 'Corretora Cotação VIP',
              primaryColor: '#112233',
            },
          },
          corretora_metadata: null,
        },
      ]);

      const res = await resolveWhiteLabelForQuoteId('quote-123');
      expect(res.companyName).toBe('Corretora Cotação VIP');
      expect(res.primaryColor).toBe('#112233');
    });
  });

  describe('resolveWhiteLabelForContext', () => {
    it('deve retornar defaults da DuoLife se o contexto for nulo ou vazio', async () => {
      const { whiteLabel, partnerEmail } = await resolveWhiteLabelForContext({});
      expect(whiteLabel).toEqual(DEFAULT_WHITE_LABEL);
      expect(partnerEmail).toBeUndefined();
    });

    it('deve resolver a partir de context.parceiro.id com email do parceiro', async () => {
      mockSql.mockResolvedValueOnce([
        {
          id: 'p-1',
          email: 'db-email@parceiro.com',
          metadata: {
            whiteLabel: {
              companyName: 'Alfa Corretora',
            },
          },
          corretora_metadata: null,
        },
      ]);

      const { whiteLabel, partnerEmail } = await resolveWhiteLabelForContext({
        parceiro: {
          id: 'p-1',
          email: 'context-email@parceiro.com',
        },
      });

      expect(whiteLabel.companyName).toBe('Alfa Corretora');
      // Context tem precedência ou usa o que foi fornecido
      expect(partnerEmail).toBe('context-email@parceiro.com');
    });

    it('deve resolver a partir de context.cotacao.id quando não houver parceiro no contexto', async () => {
      // 1ª chamada: busca parceiro da cotação
      mockSql.mockResolvedValueOnce([{ partner_id: 'p-quote' }]);
      // 2ª chamada: busca dados do parceiro
      mockSql.mockResolvedValueOnce([
        {
          id: 'p-quote',
          email: 'consultor@cotacao.com',
          metadata: {
            whiteLabel: {
              companyName: 'Beta Seguros',
            },
          },
          corretora_metadata: null,
        },
      ]);

      const { whiteLabel, partnerEmail } = await resolveWhiteLabelForContext({
        cotacao: { id: 'cotacao-999' },
      });

      expect(whiteLabel.companyName).toBe('Beta Seguros');
      expect(partnerEmail).toBe('consultor@cotacao.com');
    });
  });

  describe('buildEmailWhiteLabelVariables', () => {
    it('deve aplicar fallbacks padrão da DuoLife para configurações vazias', () => {
      const vars = buildEmailWhiteLabelVariables(DEFAULT_WHITE_LABEL);

      expect(vars.empresa_nome).toBe('DuoLife');
      expect(vars.cor_primaria).toBe('#0e4a5a');
      expect(vars.cor_secundaria).toBe('#7fa8b2');
      expect(vars.cor_destaque).toBe('#00d4e0');
      expect(vars.from_name).toBe('DuoLife Hub');
      expect(vars.reply_to).toBeUndefined();
      expect(vars.whitelabel_header_html).toContain('<h1');
      expect(vars.whitelabel_header_html).toContain('DuoLife');
      expect(vars.whitelabel_footer_html).toContain('<p');
      expect(vars.whitelabel_footer_html).toContain('DuoLife');
    });

    it('deve usar logo_url quando fornecido gerando tag img responsiva', () => {
      const customWl = {
        ...DEFAULT_WHITE_LABEL,
        companyName: 'Silva Corretora',
        logoUrl: 'https://cdn.example.com/logo.png',
        companyPhone: '(11) 99999-9999',
        companyEmail: 'atendimento@silva.com.br',
        primaryColor: '#003366',
      };

      const vars = buildEmailWhiteLabelVariables(customWl);

      expect(vars.empresa_nome).toBe('Silva Corretora');
      expect(vars.from_name).toBe('Silva Corretora via DuoLife');
      expect(vars.reply_to).toBe('atendimento@silva.com.br');
      expect(vars.cor_primaria).toBe('#003366');
      expect(vars.whitelabel_header_html).toContain('<img');
      expect(vars.whitelabel_header_html).toContain('src="https://cdn.example.com/logo.png"');
      expect(vars.whitelabel_header_html).toContain('alt="Silva Corretora"');
      expect(vars.whitelabel_footer_html).toContain('Silva Corretora');
      expect(vars.whitelabel_footer_html).toContain('(11) 99999-9999');
      expect(vars.whitelabel_footer_html).toContain('atendimento@silva.com.br');
    });

    it('deve respeitar fallbackPartnerEmail se companyEmail for vazio', () => {
      const wlSemEmail = {
        ...DEFAULT_WHITE_LABEL,
        companyName: 'Parceiro Sem Email Cadastrado',
      };

      const vars = buildEmailWhiteLabelVariables(wlSemEmail, 'fallback@parceiro.com.br');
      expect(vars.reply_to).toBe('fallback@parceiro.com.br');
    });

    it('deve sanitizar caracteres especiais HTML e prevenir injeções nos cabeçalhos', () => {
      const maliciousWl = {
        ...DEFAULT_WHITE_LABEL,
        companyName: 'Seguros <script>alert(1)</script>',
        companyEmail: 'contato@evil.com\r\nBcc: hacker@stealth.com',
      };

      const vars = buildEmailWhiteLabelVariables(maliciousWl);

      // HTML deve estar escapado
      expect(vars.whitelabel_header_html).not.toContain('<script>');
      expect(vars.whitelabel_header_html).toContain('&lt;script&gt;');
      expect(vars.whitelabel_footer_html).not.toContain('<script>');

      // Cabeçalhos From e Reply-To não devem ter quebras de linha
      expect(vars.from_name).not.toContain('\r');
      expect(vars.from_name).not.toContain('\n');
      expect(vars.reply_to).not.toContain('\r');
      expect(vars.reply_to).not.toContain('\n');
      expect(vars.reply_to).toBe('contato@evil.com Bcc: hacker@stealth.com');
    });
  });
});
