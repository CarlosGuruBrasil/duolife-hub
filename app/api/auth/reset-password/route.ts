import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Dados inválidos. A senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Busca o token
    const [resetRecord] = await sql<{ id: string, user_id: string, user_type: string, used: boolean, expires_at: Date }[]>`
      SELECT id, user_id, user_type, used, expires_at 
      FROM password_reset_tokens 
      WHERE token_hash = ${tokenHash}
    `;

    if (!resetRecord) {
      return NextResponse.json({ error: 'Token de recuperação inválido.' }, { status: 400 });
    }

    if (resetRecord.used) {
      return NextResponse.json({ error: 'Este link de recuperação já foi utilizado.' }, { status: 400 });
    }

    if (new Date() > new Date(resetRecord.expires_at)) {
      return NextResponse.json({ error: 'Este link de recuperação expirou. Solicite um novo.' }, { status: 400 });
    }

    // Hash da nova senha
    const newHash = await bcrypt.hash(newPassword, 10);

    // Atualiza a senha na tabela correta e marca o token como usado em uma transação (via duas queries sequenciais por simplicidade)
    if (resetRecord.user_type === 'partner') {
      await sql`UPDATE partner_users SET password_hash = ${newHash} WHERE id = ${resetRecord.user_id}`;
    } else if (resetRecord.user_type === 'admin') {
      await sql`UPDATE admin_users SET password_hash = ${newHash} WHERE id = ${resetRecord.user_id}`;
    }

    await sql`UPDATE password_reset_tokens SET used = true WHERE id = ${resetRecord.id}`;

    logger.info({ userId: resetRecord.user_id, userType: resetRecord.user_type }, 'Password reset successfully via token');
    return NextResponse.json({ success: true });

  } catch (err) {
    logger.error({ err }, 'auth.reset_password.failed');
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
