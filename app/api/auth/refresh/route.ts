import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { sql } from '@/lib/pg';
import { getJwtSecret } from '@/lib/secrets';
import { rotateRefreshToken } from '@/lib/refresh-token';
import { logger } from '@/lib/logger';
import { normalizePermissions, type AuthUser } from '@/lib/auth';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('duolife_refresh')?.value;
    if (!raw) return Response.json({ error: 'Sessão expirada' }, { status: 401 });
    const result = await rotateRefreshToken(raw);
    if (!result) return Response.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });

    const [user] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.role, pu.permissions, pu.partner_id,
             p.status as partner_status
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      WHERE pu.id = ${result.userId} AND pu.is_active = true
    `;

    if (!user || user.partner_status !== 'active') {
      return Response.json({ error: 'Sessão inválida' }, { status: 401 });
    }

    const payload: AuthUser = {
      userId: user.id,
      partnerId: user.partner_id,
      name: user.name,
      email: user.email,
      role: `partner_${user.role}` as AuthUser['role'],
      permissions: normalizePermissions(user.permissions),
    };

    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
    const isProduction = process.env.NODE_ENV === 'production';

    cookieStore.set('duolife_token', token, {
      httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 60 * 60 * 8, path: '/',
    });
    cookieStore.set('duolife_refresh', result.newRaw, {
      httpOnly: true, secure: isProduction, sameSite: 'lax',
      maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30) * 86_400, path: '/api/auth',
    });

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'auth.refresh.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
