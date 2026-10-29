import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'node:events';
import https from 'node:https';
import nodemailer from 'nodemailer';
import { sendMail } from '@/lib/mailer';
import { sendEmailViaNet4Life } from '@/lib/net4life-service';
import * as systemSettings from '@/lib/system-settings';

// Mock do nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

// Mock do logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock de net4life-service apenas para testar sendMail isoladamente quando necessário
vi.mock('@/lib/net4life-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/net4life-service')>();
  return {
    ...actual,
    sendEmailViaNet4Life: vi.fn(),
  };
});

describe('Mailer Headers & Net4Life Service (White-Label Dynamic From & Reply-To)', () => {
  const originalEnv = { ...process.env };
  const mockSendMailTransport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMailTransport,
    } as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('sendMail - Provedor SMTP Nodemailer', () => {
    beforeEach(() => {
      vi.spyOn(systemSettings, 'isNet4LifeInfoEnabled').mockResolvedValue(false);
      process.env.SMTP_HOST = 'smtp.duolife.com.br';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'smtp-user';
      process.env.SMTP_PASS = 'smtp-pass';
      mockSendMailTransport.mockResolvedValue({ messageId: 'smtp_msg_123' });
    });

    it('deve usar from customizado com fromName e incluir replyTo quando informados', async () => {
      process.env.EMAIL_FROM = '"DuoLife Hub" <noreply@duolife.com.br>';

      const res = await sendMail({
        to: 'cliente@exemplo.com',
        toName: 'João da Silva',
        subject: 'Sua Proposta de Seguro',
        html: '<p>Olá João</p>',
        fromName: 'Silva Seguros via DuoLife',
        replyTo: 'atendimento@silvaseguros.com.br',
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe('nodemailer_smtp');
      expect(res.messageId).toBe('smtp_msg_123');

      expect(mockSendMailTransport).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMailTransport.mock.calls[0][0];

      expect(callArgs.to).toBe('cliente@exemplo.com');
      expect(callArgs.subject).toBe('Sua Proposta de Seguro');
      expect(callArgs.html).toBe('<p>Olá João</p>');
      expect(callArgs.from).toBe('"Silva Seguros via DuoLife" <noreply@duolife.com.br>');
      expect(callArgs.replyTo).toBe('atendimento@silvaseguros.com.br');
    });

    it('deve extrair o e-mail base mesmo se EMAIL_FROM estiver formatado sem aspas ou apenas com endereço puro', async () => {
      process.env.EMAIL_FROM = 'noreply@duolife.com.br';

      await sendMail({
        to: 'cliente@exemplo.com',
        subject: 'Cotação Pronta',
        html: '<p>Detalhes</p>',
        fromName: 'Corretora Aliança via DuoLife',
        replyTo: 'contato@alianca.com.br',
      });

      const callArgs = mockSendMailTransport.mock.calls[0][0];
      expect(callArgs.from).toBe('"Corretora Aliança via DuoLife" <noreply@duolife.com.br>');
      expect(callArgs.replyTo).toBe('contato@alianca.com.br');
    });

    it('deve manter o from padrão e omitir replyTo quando não fornecidos', async () => {
      process.env.EMAIL_FROM = '"DuoLife Hub" <noreply@duolife.com.br>';

      await sendMail({
        to: 'cliente@exemplo.com',
        subject: 'Aviso do Sistema',
        html: '<p>Mensagem</p>',
      });

      const callArgs = mockSendMailTransport.mock.calls[0][0];
      expect(callArgs.from).toBe('"DuoLife Hub" <noreply@duolife.com.br>');
      expect(callArgs.replyTo).toBeUndefined();
    });

    it('deve sanitizar quebras de linha em fromName e replyTo para evitar header injection', async () => {
      process.env.EMAIL_FROM = '<noreply@duolife.com.br>';

      await sendMail({
        to: 'cliente@exemplo.com',
        subject: 'Teste Sanitização',
        html: '<p>Corpo</p>',
        fromName: 'Silva Seguros\r\nBcc: invasor@hacker.com',
        replyTo: 'atendimento@silvaseguros.com.br\r\nCc: invasor@hacker.com',
      });

      const callArgs = mockSendMailTransport.mock.calls[0][0];
      expect(callArgs.from).toBe('"Silva Seguros Bcc: invasor@hacker.com" <noreply@duolife.com.br>');
      expect(callArgs.replyTo).toBe('atendimento@silvaseguros.com.br Cc: invasor@hacker.com');
    });
  });

  describe('sendMail - Modo Dev Mock', () => {
    beforeEach(() => {
      vi.spyOn(systemSettings, 'isNet4LifeInfoEnabled').mockResolvedValue(false);
      delete process.env.SMTP_HOST;
      (process.env as any).NODE_ENV = 'development';
    });

    it('deve retornar mock: true e registrar informações em modo desenvolvimento', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const res = await sendMail({
        to: 'dev@exemplo.com',
        toName: 'Desenvolvedor',
        subject: 'Teste Mock',
        html: '<p>HTML Mock</p>',
        fromName: 'Mock Corretora via DuoLife',
        replyTo: 'mock@corretora.com.br',
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe('mock');
      expect(res.mock).toBe(true);

      const logs = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logs).toContain('--- EMAIL MOCK ---');
      expect(logs).toContain('To: dev@exemplo.com');
      expect(logs).toContain('From Name: Mock Corretora via DuoLife');
      expect(logs).toContain('Reply-To: mock@corretora.com.br');

      consoleSpy.mockRestore();
    });
  });

  describe('sendMail - Repasse para sendEmailViaNet4Life', () => {
    it('deve repassar fromName e replyTo para sendEmailViaNet4Life quando Net4Life estiver ativo', async () => {
      vi.spyOn(systemSettings, 'isNet4LifeInfoEnabled').mockResolvedValue(true);
      const mockNet4Life = vi.mocked(sendEmailViaNet4Life);
      mockNet4Life.mockResolvedValue({ success: true, messageId: 'net4life_xyz' });

      const res = await sendMail({
        to: 'destinatario@exemplo.com',
        toName: 'Maria',
        subject: 'Sua Apólice',
        html: '<p>Corpo Apólice</p>',
        templateId: 'tpl_apolice_01',
        variables: { plano: 'Vida Total' },
        fromName: 'Corretora Sol via DuoLife',
        replyTo: 'suporte@corretorasol.com.br',
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe('net4life_api');
      expect(res.messageId).toBe('net4life_xyz');

      expect(mockNet4Life).toHaveBeenCalledTimes(1);
      expect(mockNet4Life).toHaveBeenCalledWith({
        to: 'destinatario@exemplo.com',
        toName: 'Maria',
        subject: 'Sua Apólice',
        html: '<p>Corpo Apólice</p>',
        templateId: 'tpl_apolice_01',
        variables: { plano: 'Vida Total' },
        fromName: 'Corretora Sol via DuoLife',
        replyTo: 'suporte@corretorasol.com.br',
      });
    });
  });

  describe('sendEmailViaNet4Life - Injeção de remetente_nome e reply_to no payload HTTP', () => {
    let capturedBody: any = null;
    let httpsRequestSpy: any;

    beforeEach(async () => {
      // Importa a implementação real não-mockada de sendEmailViaNet4Life
      const actualNet4Life = await vi.importActual<typeof import('@/lib/net4life-service')>('@/lib/net4life-service');
      vi.mocked(sendEmailViaNet4Life).mockImplementation(actualNet4Life.sendEmailViaNet4Life);

      vi.spyOn(systemSettings, 'getNet4LifeInfoConfig').mockResolvedValue({
        apiUrl: 'https://api.duo24horas.com.br/email_marketing/v1',
        apiToken: 'valid-test-token',
        senderEmail: 'contato@duolife.com.br',
        senderName: 'DuoLife Padrão',
        replyTo: 'padrao@duolife.com.br',
        smtpUser: 'smtp_default',
        enabled: true,
      });

      capturedBody = null;

      httpsRequestSpy = vi.spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn((chunk: Buffer | string) => {
          try {
            capturedBody = JSON.parse(chunk.toString('utf-8'));
          } catch {
            capturedBody = chunk.toString('utf-8');
          }
        });
        reqEmitter.end = vi.fn(() => {
          const resEmitter: any = new EventEmitter();
          resEmitter.statusCode = 200;
          resEmitter.setEncoding = vi.fn();
          if (callback) callback(resEmitter);
          process.nextTick(() => {
            resEmitter.emit('data', JSON.stringify({ sucesso: true, id: 'api_resp_999' }));
            resEmitter.emit('end');
          });
        });
        reqEmitter.on = vi.fn((event: string, handler: any) => {
          return reqEmitter;
        });
        reqEmitter.destroy = vi.fn();
        return reqEmitter;
      });
    });

    afterEach(() => {
      if (httpsRequestSpy) httpsRequestSpy.mockRestore();
    });

    it('deve injetar remetente_nome e reply_to customizados no payload JSON da API', async () => {
      const res = await sendEmailViaNet4Life({
        to: 'cliente@teste.com',
        toName: 'Cliente Teste',
        subject: 'Confirmação',
        html: '<p>Tudo certo</p>',
        fromName: 'Alpha Seguros via DuoLife',
        replyTo: 'contato@alphaseguros.com.br',
      });

      expect(res.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.remetente_nome).toBe('Alpha Seguros via DuoLife');
      expect(capturedBody.reply_to).toBe('contato@alphaseguros.com.br');
      expect(capturedBody.remetente_email).toBe('contato@duolife.com.br');
    });

    it('deve usar fallback de senderName e replyTo da configuração quando não fornecidos em options', async () => {
      const res = await sendEmailViaNet4Life({
        to: 'cliente@teste.com',
        toName: 'Cliente Teste',
        subject: 'Aviso Institucional',
        html: '<p>Institucional</p>',
      });

      expect(res.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.remetente_nome).toBe('DuoLife Padrão');
      expect(capturedBody.reply_to).toBe('padrao@duolife.com.br');
    });

    it('deve sanitizar quebras de linha em options.fromName e options.replyTo no payload da API', async () => {
      await sendEmailViaNet4Life({
        to: 'cliente@teste.com',
        subject: 'Aviso Sanitizado',
        html: '<p>Sanitizado</p>',
        fromName: 'Nome Com\r\nQuebra',
        replyTo: 'reply@com\r\nquebra.com',
      });

      expect(capturedBody.remetente_nome).toBe('Nome Com Quebra');
      expect(capturedBody.reply_to).toBe('reply@com quebra.com');
    });
  });
});
