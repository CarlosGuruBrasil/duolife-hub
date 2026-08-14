import crypto from 'crypto';
import { sql } from '@/lib/pg';
import { sendMail } from '@/lib/mailer';

type ResetUserType = 'partner' | 'admin';
type ResetMailPurpose = 'reset' | 'invite';

interface IssueResetOptions {
  userId: string;
  userType: ResetUserType;
  email: string;
  userName: string;
  origin?: string | null;
  purpose?: ResetMailPurpose;
}

function buildResetUrl(rawToken: string, origin?: string | null) {
  const baseOrigin = origin || process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
  return `${baseOrigin}/login/redefinir-senha?token=${rawToken}`;
}

function buildResetMailHtml(userName: string, resetUrl: string, purpose: ResetMailPurpose) {
  const isInvite = purpose === 'invite';
  const intro = isInvite
    ? 'Criamos seu acesso ao <strong>DuoLife Hub</strong>. Para definir sua senha e entrar pela primeira vez, clique no botão abaixo:'
    : 'Recebemos uma solicitação para redefinir a senha da sua conta no <strong>DuoLife Hub</strong>. Para criar uma nova senha, clique no botão abaixo:';
  const footer = isInvite
    ? 'Este link é válido por 1 hora. Se você ainda não esperava esse acesso, fale com o time DuoLife antes de prosseguir.'
    : 'Este link é válido por 1 hora. Se você não solicitou esta alteração, pode ignorar este e-mail com segurança. Sua senha não será alterada.';

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #0e4a5a;">Olá, ${userName}</h2>
      <p>${intro}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #00d4e0; color: #072a33; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
          ${isInvite ? 'Criar Minha Senha' : 'Redefinir Minha Senha'}
        </a>
      </div>
      <p style="font-size: 14px; color: #666;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
      <p style="font-size: 14px; word-break: break-all; color: #0e4a5a;">${resetUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 12px; color: #999;">
        ${footer}
      </p>
    </div>
  `;
}

export async function issuePasswordResetEmail({
  userId,
  userType,
  email,
  userName,
  origin,
  purpose = 'reset',
}: IssueResetOptions) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await sql`
    INSERT INTO password_reset_tokens (user_id, user_type, token_hash, expires_at)
    VALUES (${userId}, ${userType}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  const resetUrl = buildResetUrl(rawToken, origin);
  const html = buildResetMailHtml(userName, resetUrl, purpose);

  const mailResult = await sendMail({
    to: email,
    subject: purpose === 'invite' ? 'Crie seu acesso - DuoLife Hub' : 'Redefinição de Senha - DuoLife Hub',
    html,
  });

  if (!mailResult.success) {
    throw new Error('Falha ao enviar e-mail de recuperação');
  }

  return { resetUrl, expiresAt };
}
