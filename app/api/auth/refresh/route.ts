import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { sql } from '@/lib/pg';
import { getJwtSecret } from '@/lib/secrets';
import { rotateRefreshToken } from '@/lib/refresh-token';
import { logger } from '@/lib/logger';
import { normalizePartnerRole, normalizePermissions, toPartnerUserRole, type AuthUser } from '@/lib/auth';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('duolife_refresh')?.value;
    if (!raw) return Response.json({ error: 'Sessão expirada' }, { status: 401 });
    const result = await rotateRefreshToken(raw);
    if (!result) return Response.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });

    // Tenta usuário de Corretora primeiro
    const [corretoraUser] = await sql`
      SELECT cu.id, cu.corretora_id, cu.name, cu.email, cu.role, cu.permissions,
             c.status as corretora_status, c.nome_fantasia as corretora_nome
      FROM corretora_users cu
      JOIN corretoras c ON c.id = cu.corretora_id
      WHERE cu.id = ${result.userId} AND cu.is_active = true
    `;

    if (corretoraUser) {
      if (corretoraUser.corretora_status !== 'active') {
        return Response.json({ error: 'Sessão inválida' }, { status: 401 });
      }

      const payload: AuthUser = {
        userId: corretoraUser.id,
        partnerId: null,
        corretoraId: corretoraUser.corretora_id,
        corretoraNome: corretoraUser.corretora_nome,
        name: corretoraUser.name,
        email: corretoraUser.email,
        role: corretoraUser.role as AuthUser['role'],
        partnerRole: null,
        managerUserId: null,
        permissions: normalizePermissions(corretoraUser.permissions),
      };

      const token = jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
      const isProduction = process.env.NODE_ENV === 'production';

      cookieStore.set('duolife_token', token, {
        httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 60 * 60 * 8, path: '/',
      });
      cookieStore.set('duolife_refresh', result.newRaw, {
        httpOnly: true, secure: isProduction, sameSite: 'lax',
        maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30) * 86_400, path: '/api/auth',
      });

      return Response.json({ ok: true, user: { ...payload } });
    }

    // Tenta usuário de parceiro
    const [user] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.role, pu.permissions, pu.partner_id, pu.manager_user_id,
             p.status as partner_status, p.corretora_id, c.nome_fantasia as corretora_nome
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN corretoras c ON c.id = p.corretora_id
      WHERE pu.id = ${result.userId} AND pu.is_active = true
    `;

    if (!user || user.partner_status !== 'active') {
      return Response.json({ error: 'Sessão inválida' }, { status: 401 });
    }

    const payload: AuthUser = {
      userId: user.id,
      partnerId: user.partner_id,
      corretoraId: user.corretora_id || null,
      corretoraNome: user.corretora_nome || null,
      name: user.name,
      email: user.email,
      role: toPartnerUserRole(normalizePartnerRole(user.role)),
      partnerRole: normalizePartnerRole(user.role),
      managerUserId: user.manager_user_id,
      permissions: normalizePermissions(user.permissions),
    };

    const token = jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
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
