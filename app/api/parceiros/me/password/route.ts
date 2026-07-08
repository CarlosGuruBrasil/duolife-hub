import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function PUT(req: Request) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Dados inválidos. A nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    // Busca o hash atual do usuário
    const [dbUser] = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM partner_users WHERE id = ${user.id}
    `;

    if (!dbUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verifica a senha atual
    const isValid = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'A senha atual está incorreta.' }, { status: 400 });
    }

    // Atualiza para a nova senha
    const newHash = await bcrypt.hash(newPassword, 10);
    await sql`
      UPDATE partner_users 
      SET password_hash = ${newHash} 
      WHERE id = ${user.id}
    `;

    logger.info({ userId: user.id }, 'User changed password successfully');
    
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'auth.change_password.failed');
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
