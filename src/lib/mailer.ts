import nodemailer from 'nodemailer';
import { logger } from './logger';
import { isNet4LifeInfoEnabled } from './system-settings';
import { sendEmailViaNet4Life } from './net4life-service';

export interface SendMailOptions {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  templateId?: string | null;
  variables?: Record<string, any>;
  fromName?: string | null;
  replyTo?: string | null;
}

export interface SendMailResult {
  success: boolean;
  provider?: 'net4life_api' | 'nodemailer_smtp' | 'mock';
  mock?: boolean;
  messageId?: string;
  error?: any;
}

/**
 * Extrai o e-mail puro de strings como '"Nome" <email@dom.com>' ou '<email@dom.com>' ou 'email@dom.com'.
 */
function extractEmail(address: string): string {
  const match = address.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return address.trim().replace(/^["']|["']$/g, '');
}

/**
 * Sanitiza quebras de linha para evitar injeção em cabeçalhos SMTP (\r, \n).
 */
function sanitizeHeader(val?: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[\r\n]+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export async function sendMail({
  to,
  toName,
  subject,
  html,
  templateId,
  variables,
  fromName,
  replyTo,
}: SendMailOptions): Promise<SendMailResult> {
  const isDev = process.env.NODE_ENV !== 'production';

  // 1. Provedor Primário Oficial: API Net4Life Info / FluxoSend
  const net4lifeEnabled = await isNet4LifeInfoEnabled();
  if (net4lifeEnabled) {
    logger.info({ to, subject, templateId }, 'Disparando e-mail via API Net4Life Info');
    const net4lifeResult = await sendEmailViaNet4Life({
      to,
      toName,
      subject,
      html,
      templateId,
      variables,
      fromName,
      replyTo,
    });

    if (net4lifeResult.success) {
      logger.info({ messageId: net4lifeResult.messageId, to }, 'E-mail enviado com sucesso via Net4Life Info');
      return {
        success: true,
        provider: 'net4life_api',
        messageId: net4lifeResult.messageId,
      };
    }

    logger.warn(
      { error: net4lifeResult.error, to },
      'Falha no envio via Net4Life Info. Verificando fallback SMTP...'
    );
  }

  // 2. Provedor Secundário (Fallback): Nodemailer SMTP
  const smtpHost = process.env.SMTP_HOST?.trim();
  const hasSmtpConfig = !!smtpHost && smtpHost !== '127.0.0.1' && smtpHost !== 'localhost';

  if (hasSmtpConfig) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      });

      const rawFrom = process.env.EMAIL_FROM || process.env.SMTP_FROM || '"DuoLife Hub" <noreply@duolife.com.br>';
      const cleanFromName = sanitizeHeader(fromName);
      const cleanReplyTo = sanitizeHeader(replyTo);

      let fromHeader = rawFrom;
      if (cleanFromName) {
        const cleanSenderEmail = extractEmail(rawFrom);
        fromHeader = `"${cleanFromName}" <${cleanSenderEmail}>`;
      }

      const mailPayload: nodemailer.SendMailOptions = {
        from: fromHeader,
        to,
        subject,
        html,
      };

      if (cleanReplyTo) {
        mailPayload.replyTo = cleanReplyTo;
      }

      const info = await transporter.sendMail(mailPayload);

      logger.info({ messageId: info.messageId, to }, 'E-mail enviado com sucesso via SMTP');
      return { success: true, provider: 'nodemailer_smtp', messageId: info.messageId };
    } catch (smtpError) {
      logger.error({ smtpError, to }, 'Falha no envio de e-mail via SMTP');
      return { success: false, provider: 'nodemailer_smtp', error: smtpError };
    }
  }

  // 3. Modo de Desenvolvimento Local sem SMTP ou Net4Life configurados
  if (isDev) {
    logger.info({ to, subject }, 'Simulação de Envio de E-mail (Ambiente Dev)');
    console.log('--- EMAIL MOCK ---');
    console.log('To:', to, toName ? `(${toName})` : '');
    if (fromName) console.log('From Name:', fromName);
    if (replyTo) console.log('Reply-To:', replyTo);
    console.log('Subject:', subject);
    console.log('Body snippet:', html.slice(0, 200) + '...');
    console.log('------------------');
    return { success: true, provider: 'mock', mock: true };
  }

  // 4. Em Produção, se nenhum provedor estiver ativo, retorna erro explícito
  const errorMsg = net4lifeEnabled
    ? 'Falha na comunicação com o servidor de e-mail marketing Net4Life Info.'
    : 'Nenhum provedor de e-mail ativo. Configure as credenciais do E-mail Marketing (Net4Life Info) em Configurações > Chaves de API.';

  logger.error({ to, subject }, errorMsg);
  return {
    success: false,
    error: errorMsg,
  };
}

export const sendEmail = sendMail;
