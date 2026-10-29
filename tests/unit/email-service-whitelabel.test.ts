import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de dependências
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.json = (val: any) => val;
  return { sql: sqlMock };
});

vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sql } from '@/lib/pg';
import { sendMail } from '@/lib/mailer';
import {
  normalizeEmailVariables,
  renderTemplateString,
  sendTemplatedEmail,
  DEFAULT_TEMPLATES,
  type SendTemplatedEmailOptions,
} from '@/lib/email-service';

describe('White-Label Email Templates & Normalization (email-service.ts)', () => {
  const mockSql = sql as any;
  const mockSendMail = sendMail as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeEmailVariables — White-Label & Branding', () => {
    it('deve normalizar aliases de nome da empresa (whitelabel_empresa e corretora_nome para empresa_nome)', () => {
      const norm1 = normalizeEmailVariables({ whitelabel_empresa: 'Silva Corretora' });
      expect(norm1.empresa_nome).toBe('Silva Corretora');
      expect(norm1.whitelabel_empresa).toBe('Silva Corretora');

      const norm2 = normalizeEmailVariables({ corretora_nome: 'Corretora Modelo' });
      expect(norm2.empresa_nome).toBe('Corretora Modelo');
    });

    it('deve normalizar aliases de logotipo (whitelabel_logo_url e whitelabel_logo para logo_url)', () => {
      const norm1 = normalizeEmailVariables({ whitelabel_logo_url: 'https://cdn.example.com/logo1.png' });
      expect(norm1.logo_url).toBe('https://cdn.example.com/logo1.png');
      expect(norm1.whitelabel_logo_url).toBe('https://cdn.example.com/logo1.png');

      const norm2 = normalizeEmailVariables({ whitelabel_logo: 'https://cdn.example.com/logo2.png' });
      expect(norm2.logo_url).toBe('https://cdn.example.com/logo2.png');
    });

    it('deve aplicar fallbacks padrão de cores DuoLife caso não sejam informadas', () => {
      const norm = normalizeEmailVariables({});
      expect(norm.cor_primaria).toBe('#0e4a5a');
      expect(norm.cor_secundaria).toBe('#7fa8b2');
      expect(norm.cor_destaque).toBe('#00d4e0');
    });

    it('deve respeitar cores customizadas informadas via snake_case ou camelCase', () => {
      const norm = normalizeEmailVariables({
        cor_primaria: '#1a365d',
        secondaryColor: '#2b6cb0',
        accentColor: '#319795',
      });
      expect(norm.cor_primaria).toBe('#1a365d');
      expect(norm.cor_secundaria).toBe('#2b6cb0');
      expect(norm.cor_destaque).toBe('#319795');
    });

    it('deve gerar whitelabel_header_html automaticamente com <img> quando logo_url for informada', () => {
      const norm = normalizeEmailVariables({
        empresa_nome: 'Prado Seguros',
        logo_url: 'https://cdn.prado.com/logo.png',
      });
      expect(norm.whitelabel_header_html).toContain('<img');
      expect(norm.whitelabel_header_html).toContain('src="https://cdn.prado.com/logo.png"');
      expect(norm.whitelabel_header_html).toContain('alt="Prado Seguros"');
    });

    it('deve gerar whitelabel_header_html com <h1> seguro quando logo_url não for informada', () => {
      const norm = normalizeEmailVariables({
        empresa_nome: 'Prado Seguros',
      });
      expect(norm.whitelabel_header_html).toContain('<h1');
      expect(norm.whitelabel_header_html).toContain('Prado Seguros');
    });

    it('deve preservar whitelabel_header_html e whitelabel_footer_html quando já passados explicitamente', () => {
      const customHeader = '<div class="custom-brand"><img src="https://img.com/x.png" /></div>';
      const customFooter = '<p class="custom-foot">Contato da Corretora 11 9999-9999</p>';

      const norm = normalizeEmailVariables({
        whitelabel_header_html: customHeader,
        whitelabel_footer_html: customFooter,
      });

      expect(norm.whitelabel_header_html).toBe(customHeader);
      expect(norm.whitelabel_footer_html).toBe(customFooter);
    });

    it('não deve realizar duplo escape de tags HTML em whitelabel_header_html e whitelabel_footer_html', () => {
      const template = '<div class="header">{{whitelabel_header_html}}</div><div class="footer">{{whitelabel_footer_html}}</div>';
      const vars = {
        whitelabel_header_html: '<img src="https://cdn.example.com/logo.png" alt="Empresa &amp; Cia" />',
        whitelabel_footer_html: '<p>Atendimento: contato@empresa.com.br</p>',
      };

      const rendered = renderTemplateString(template, vars, true);
      expect(rendered).toContain('<img src="https://cdn.example.com/logo.png" alt="Empresa &amp; Cia" />');
      expect(rendered).toContain('<p>Atendimento: contato@empresa.com.br</p>');
      expect(rendered).not.toContain('&lt;img');
      expect(rendered).not.toContain('&lt;p&gt;');
    });
  });

  describe('SendTemplatedEmailOptions & sendTemplatedEmail', () => {
    it('deve repassar fromName e replyTo para a função sendMail', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        code: 'boas_vindas',
        name: 'Boas-vindas',
        subject: 'Bem-vindo à {{empresa_nome|DuoLife}}!',
        body_html: '<h1>Olá {{nome}}</h1>',
        variables: ['nome', 'empresa_nome'],
        external_id: 'ext-tpl-1',
        is_active: true,
      };

      // Mock de retorno do select do template
      mockSql.mockResolvedValueOnce([mockTemplate]);
      // Mock de retorno do insert de log
      mockSql.mockResolvedValueOnce([{ id: 'log-123' }]);

      mockSendMail.mockResolvedValueOnce({
        success: true,
        messageId: 'msg-456',
        provider: 'nodemailer_smtp',
      });

      const options: SendTemplatedEmailOptions = {
        templateCode: 'boas_vindas',
        to: 'cliente@exemplo.com.br',
        toName: 'Carlos Souza',
        variables: {
          empresa_nome: 'Silva Seguros',
          cor_primaria: '#1a365d',
        },
        fromName: 'Silva Seguros via DuoLife',
        replyTo: 'atendimento@silvaseguros.com.br',
      };

      const result = await sendTemplatedEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];

      expect(callArgs.to).toBe('cliente@exemplo.com.br');
      expect(callArgs.toName).toBe('Carlos Souza');
      expect(callArgs.fromName).toBe('Silva Seguros via DuoLife');
      expect(callArgs.replyTo).toBe('atendimento@silvaseguros.com.br');
      expect(callArgs.subject).toBe('Bem-vindo à Silva Seguros!');
    });
  });

  describe('Renderização dos Templates Padrão (DEFAULT_TEMPLATES)', () => {
    const templatesByCode = new Map(DEFAULT_TEMPLATES.map((t) => [t.code, t]));

    it('boas_vindas: deve renderizar cores e header/footer White-Label quando informados, e fallback quando ausentes', () => {
      const tpl = templatesByCode.get('boas_vindas')!;
      expect(tpl).toBeDefined();

      // Com White-Label
      const renderedWL = renderTemplateString(tpl.body_html, {
        nome: 'João Silva',
        empresa_nome: 'Santos Corretora',
        cor_primaria: '#112233',
        cor_destaque: '#44bb88',
        whitelabel_header_html: '<img src="https://cdn.santos.com/logo.png" alt="Santos Corretora" />',
        whitelabel_footer_html: 'Santos Corretora • (11) 9999-0000',
      }, true);

      expect(renderedWL).toContain('background: #112233');
      expect(renderedWL).toContain('<img src="https://cdn.santos.com/logo.png" alt="Santos Corretora" />');
      expect(renderedWL).toContain('Santos Corretora • (11) 9999-0000');

      // Sem White-Label (fallback DuoLife)
      const renderedDefault = renderTemplateString(tpl.body_html, {
        nome: 'João Silva',
      }, true);

      expect(renderedDefault).toContain('#0e4a5a');
      expect(renderedDefault).toContain('DuoLife');
    });

    it('cotacao_gerada: deve injetar cor_primaria no cabeçalho e cor_destaque no botão de ação', () => {
      const tpl = templatesByCode.get('cotacao_gerada')!;
      expect(tpl).toBeDefined();

      const rendered = renderTemplateString(tpl.body_html, {
        nome: 'Maria Fernandes',
        cotacao_id: 'COT-8877',
        valor: '1.250,00',
        link_proposta: 'https://duolife.com.br/proposta/8877',
        cor_primaria: '#0f172a',
        cor_destaque: '#e11d48',
        empresa_nome: 'Alpha Seguros',
      }, true);

      expect(rendered).toContain('background: #0f172a');
      expect(rendered).toContain('background: #e11d48');
      expect(rendered).toContain('Alpha Seguros');
    });

    it('proposta_criada: deve aplicar estilização White-Label no header, botão ZapSign e footer', () => {
      const tpl = templatesByCode.get('proposta_criada')!;
      expect(tpl).toBeDefined();

      const rendered = renderTemplateString(tpl.body_html, {
        nome: 'Roberto Dias',
        cotacao_id: 'PROP-9900',
        valor: '2.400,00',
        link_assinatura: 'https://zapsign.co/sign/9900',
        cor_primaria: '#1e3a8a',
        cor_destaque: '#f59e0b',
        whitelabel_header_html: '<div class="brand">Roberto Corretagem</div>',
        whitelabel_footer_html: 'Roberto Corretagem &bull; SUSEP 12345',
      }, true);

      expect(rendered).toContain('background: #1e3a8a');
      expect(rendered).toContain('background: #f59e0b');
      expect(rendered).toContain('<div class="brand">Roberto Corretagem</div>');
      expect(rendered).toContain('Roberto Corretagem &bull; SUSEP 12345');
    });

    it('fatura_gerada: deve aplicar cores e elementos da corretora no e-mail de cobrança', () => {
      const tpl = templatesByCode.get('fatura_gerada')!;
      expect(tpl).toBeDefined();

      const rendered = renderTemplateString(tpl.body_html, {
        nome: 'Ana Paula',
        cotacao_id: 'FAT-1020',
        valor: '450,00',
        vencimento: '10/11/2026',
        link_fatura: 'https://asaas.com/i/1020',
        cor_primaria: '#064e3b',
        cor_destaque: '#10b981',
        empresa_nome: 'Verde Corretora',
      }, true);

      expect(rendered).toContain('background: #064e3b');
      expect(rendered).toContain('background: #10b981');
      expect(rendered).toContain('Verde Corretora');
    });

    it('pagamento_confirmado: deve aplicar cor_primaria e identificação da corretora', () => {
      const tpl = templatesByCode.get('pagamento_confirmado')!;
      expect(tpl).toBeDefined();

      const rendered = renderTemplateString(tpl.body_html, {
        nome: 'Lucas Mendes',
        cotacao_id: 'PAG-3344',
        valor: '890,00',
        cor_primaria: '#312e81',
        empresa_nome: 'Nexus Benefícios',
      }, true);

      expect(rendered).toContain('background: #312e81');
      expect(rendered).toContain('Nexus Benefícios');
    });

    it('contrato_assinado: deve aplicar identificação da corretora e cabeçalho dinâmico', () => {
      const tpl = templatesByCode.get('contrato_assinado')!;
      expect(tpl).toBeDefined();

      const rendered = renderTemplateString(tpl.body_html, {
        nome: 'Beatriz Lima',
        cotacao_id: 'ASS-5566',
        cor_primaria: '#047857',
        empresa_nome: 'Elite Proteção',
      }, true);

      expect(rendered).toContain('background: #047857');
      expect(rendered).toContain('Elite Proteção');
    });
  });
});
