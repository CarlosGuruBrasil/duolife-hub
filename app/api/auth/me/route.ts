import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifyAuth, isInternalUser, unauthorized, type AuthUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { getJwtSecret } from '@/lib/secrets';

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres').optional(),
});

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  try {
    if (isInternalUser(user)) {
      const [adminRow] = await sql<{ id: string; name: string; email: string; role: string; created_at: string }[]>`
        SELECT id, name, email, role, created_at
        FROM admin_users
        WHERE id = ${user.userId}
      `;
      if (!adminRow) return unauthorized();
      return Response.json({
        user: {
          id: adminRow.id,
          name: adminRow.name,
          email: adminRow.email,
          role: adminRow.role,
          userType: 'admin',
          createdAt: adminRow.created_at,
        },
      });
    }

    const [partnerUserRow] = await sql<{ id: string; name: string; email: string; role: string; partner_id: string; created_at: string }[]>`
      SELECT id, name, email, role, partner_id, created_at
      FROM partner_users
      WHERE id = ${user.userId}
    `;
    if (!partnerUserRow) return unauthorized();
    return Response.json({
      user: {
        id: partnerUserRow.id,
        name: partnerUserRow.name,
        email: partnerUserRow.email,
        role: partnerUserRow.role,
        partnerId: partnerUserRow.partner_id,
        userType: 'partner',
        createdAt: partnerUserRow.created_at,
      },
    });
  } catch (err) {
    logger.error({ err }, 'auth.me.get.failed');
    return Response.json({ error: 'Erro ao buscar dados do perfil' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || 'Dados inválidos';
      return Response.json({ error: errorMsg }, { status: 400 });
    }

    const { name, email, currentPassword, newPassword } = parsed.data;
    const lowerEmail = email.toLowerCase();
    const isInternal = isInternalUser(user);

    // 1. Valida se o e-mail mudou e já está em uso por outro usuário
    if (lowerEmail !== user.email.toLowerCase()) {
      const [existingAdmin] = await sql`SELECT id FROM admin_users WHERE email = ${lowerEmail} AND id != ${user.userId}`;
      const [existingPartnerUser] = await sql`SELECT id FROM partner_users WHERE email = ${lowerEmail} AND id != ${user.userId}`;
      if (existingAdmin || existingPartnerUser) {
        return Response.json({ error: 'Este e-mail já está sendo utilizado por outra conta.' }, { status: 400 });
      }
    }

    // 2. Trata alteração de senha se solicitada
    let newHash: string | undefined;
    if (newPassword) {
      if (!currentPassword) {
        return Response.json({ error: 'Informe sua senha atual para definir uma nova senha.' }, { status: 400 });
      }

      const table = isInternal ? 'admin_users' : 'partner_users';
      const [dbRow] = isInternal
        ? await sql<{ password_hash: string }[]>`SELECT password_hash FROM admin_users WHERE id = ${user.userId}`
        : await sql<{ password_hash: string }[]>`SELECT password_hash FROM partner_users WHERE id = ${user.userId}`;

      if (!dbRow) return unauthorized();
      const valid = await bcrypt.compare(currentPassword, dbRow.password_hash);
      if (!valid) {
        return Response.json({ error: 'Senha atual incorreta.' }, { status: 400 });
      }

      newHash = await bcrypt.hash(newPassword, 10);
    }

    // 3. Atualiza no banco
    if (isInternal) {
      if (newHash) {
        await sql`
          UPDATE admin_users
          SET name = ${name}, email = ${lowerEmail}, password_hash = ${newHash}
          WHERE id = ${user.userId}
        `;
      } else {
        await sql`
          UPDATE admin_users
          SET name = ${name}, email = ${lowerEmail}
          WHERE id = ${user.userId}
        `;
      }
    } else {
      if (newHash) {
        await sql`
          UPDATE partner_users
          SET name = ${name}, email = ${lowerEmail}, password_hash = ${newHash}
          WHERE id = ${user.userId}
        `;
      } else {
        await sql`
          UPDATE partner_users
          SET name = ${name}, email = ${lowerEmail}
          WHERE id = ${user.userId}
        `;
      }
    }

    // 4. Reemite o token JWT com nome/email atualizados na sessão
    const updatedPayload: AuthUser = {
      ...user,
      name,
      email: lowerEmail,
    };
    const newToken = jwt.sign(updatedPayload, getJwtSecret(), { expiresIn: '8h' });
    const cookieStore = await cookies();
    cookieStore.set('duolife_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });

    return Response.json({
      ok: true,
      message: 'Perfil atualizado com sucesso',
      user: {
        id: user.userId,
        name,
        email: lowerEmail,
      },
    });
  } catch (err) {
    logger.error({ err }, 'auth.me.update.failed');
    return Response.json({ error: 'Erro ao atualizar dados do perfil' }, { status: 500 });
  }
}
