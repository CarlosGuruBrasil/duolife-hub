import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getJwtSecret } from '@/lib/secrets';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createRefreshToken } from '@/lib/refresh-token';
import type { AuthUser } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const { ok, retryAfter } = rateLimit(`login:${ip}`, 10, 60_000); // 10 tentativas/min por IP
  if (!ok) return rateLimitResponse(retryAfter);

  try {
    await ensureSchema();
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    // Tenta admin DuoLife primeiro
    const [admin] = await sql`
      SELECT id, name, email, password_hash, role
      FROM admin_users
      WHERE email = ${email.toLowerCase()} AND is_active = true
    `;

    if (admin) {
      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) return Response.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });

      const payload: AuthUser = {
        userId: admin.id,
        partnerId: null,
        name: admin.name,
        email: admin.email,
        role: admin.role as AuthUser['role'],
        permissions: {},
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
      const cookieStore = await cookies();
      cookieStore.set('duolife_token', token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 60 * 60 * 8, path: '/',
      });
      return Response.json({ ok: true, user: { ...payload } });
    }

    // Tenta usuário de parceiro
    const [user] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.password_hash, pu.role, pu.permissions, pu.partner_id,
             p.status as partner_status
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      WHERE pu.email = ${email.toLowerCase()} AND pu.is_active = true
    `;

    if (!user) return Response.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });
    if (user.partner_status !== 'active') {
      return Response.json({ error: 'Parceiro não está ativo. Entre em contato com a DuoLife.' }, { status: 403 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return Response.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });

    // Atualiza last_login_at
    await sql`UPDATE partner_users SET last_login_at = NOW() WHERE id = ${user.id}`;

    const payload: AuthUser = {
      userId: user.id,
      partnerId: user.partner_id,
      name: user.name,
      email: user.email,
      role: `partner_${user.role}` as AuthUser['role'],
      permissions: user.permissions || {},
    };
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
    const refreshRaw = await createRefreshToken(user.id);
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === 'production';
    cookieStore.set('duolife_token', token, {
      httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 60 * 60 * 8, path: '/',
    });
    cookieStore.set('duolife_refresh', refreshRaw, {
      httpOnly: true, secure: isProduction, sameSite: 'lax',
      maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30) * 86_400, path: '/api/auth',
    });
    return Response.json({ ok: true, user: { ...payload } });

  } catch (err) {
    logger.error({ err }, 'auth.login.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
