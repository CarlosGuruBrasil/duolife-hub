import nodemailer from 'nodemailer';
import { logger } from './logger';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailOptions) {
  // Em ambiente de desenvolvimento local, exibe o conteúdo no log em vez de exigir SMTP
  const isDev = process.env.NODE_ENV !== 'production';
  const hasSmtpConfig = !!process.env.SMTP_HOST;

  if (isDev && !hasSmtpConfig) {
    logger.info({ to, subject }, 'Mock Email Send (No SMTP config)');
    console.log('--- EMAIL MOCK ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Body:', html);
    console.log('------------------');
    return { success: true, mock: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"DuoLife Hub" <noreply@duolife.com.br>',
      to,
      subject,
      html,
    });

    logger.info({ messageId: info.messageId, to }, 'Email sent successfully');
    return { success: true };
  } catch (error) {
    logger.error({ error, to }, 'Failed to send email');
    return { success: false, error };
  }
}
