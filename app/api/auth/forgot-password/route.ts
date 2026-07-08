import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { sendMail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
    }

    // Procura o usuário primeiro em partner_users, depois em admin_users
    let userId = '';
    let userType = '';
    let userName = '';

    const [partner] = await sql<{ id: string, name: string }[]>`
      SELECT id, name FROM partner_users WHERE email = ${email} LIMIT 1
    `;

    if (partner) {
      userId = partner.id;
      userType = 'partner';
      userName = partner.name;
    } else {
      const [admin] = await sql<{ id: string, name: string }[]>`
        SELECT id, name FROM admin_users WHERE email = ${email} LIMIT 1
      `;
      if (admin) {
        userId = admin.id;
        userType = 'admin';
        userName = admin.name;
      }
    }

    // Se o usuário não existir, não retornamos erro para evitar enumeração de contas
    if (!userId) {
      // Delay fake para mitigar timing attacks
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ success: true });
    }

    // Gerar token de 32 bytes (64 chars hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Token expira em 1 hora
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await sql`
      INSERT INTO password_reset_tokens (user_id, user_type, token_hash, expires_at)
      VALUES (${userId}, ${userType}, ${tokenHash}, ${expiresAt.toISOString()})
    `;

    // Disparar e-mail
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
    const resetUrl = `${origin}/login/redefinir-senha?token=${rawToken}`;
    
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #0e4a5a;">Olá, ${userName}</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>DuoLife Hub</strong>.</p>
        <p>Para criar uma nova senha, clique no botão abaixo:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #00d4e0; color: #072a33; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
            Redefinir Minha Senha
          </a>
        </div>
        <p style="font-size: 14px; color: #666;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
        <p style="font-size: 14px; word-break: break-all; color: #0e4a5a;">${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999;">
          Este link é válido por 1 hora. Se você não solicitou esta alteração, pode ignorar este e-mail com segurança. Sua senha não será alterada.
        </p>
      </div>
    `;

    const mailResult = await sendMail({
      to: email,
      subject: 'Redefinição de Senha - DuoLife Hub',
      html: emailHtml
    });

    if (!mailResult.success) {
      throw new Error('Falha ao enviar e-mail de recuperação');
    }

    logger.info({ userId, userType }, 'Password reset requested and email sent');
    return NextResponse.json({ success: true });

  } catch (err) {
    logger.error({ err }, 'auth.forgot_password.failed');
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
