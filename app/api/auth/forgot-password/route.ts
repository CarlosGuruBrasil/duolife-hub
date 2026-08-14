import { NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { issuePasswordResetEmail } from '@/lib/password-reset';

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

    await issuePasswordResetEmail({
      userId,
      userType: userType as 'partner' | 'admin',
      email,
      userName,
      origin: req.headers.get('origin'),
      purpose: 'reset',
    });

    logger.info({ userId, userType }, 'Password reset requested and email sent');
    return NextResponse.json({ success: true });

  } catch (err) {
    logger.error({ err }, 'auth.forgot_password.failed');
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
