import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { canManageOwnCompany, normalizePartnerRole, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

const partnerUserSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['manager', 'broker', 'partner']),
  managerUserId: z.string().trim().nullable().optional(),
});

const toggleSchema = z.object({
  userId: z.string().trim().min(1),
  isActive: z.boolean(),
});

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();
  if (!canManageOwnCompany(user)) {
    return Response.json({ error: 'Acesso restrito ao admin da empresa' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const users = await sql`
      SELECT
        id,
        name,
        email,
        role,
        manager_user_id,
        is_active,
        last_login_at,
        created_at
      FROM partner_users
      WHERE partner_id = ${user.partnerId!}
      ORDER BY
        CASE role
          WHEN 'director' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'broker' THEN 3
          ELSE 4
        END,
        created_at ASC
    `;

    return Response.json({ users });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'partner_users.list.failed');
    return Response.json({ error: 'Erro interno ao buscar equipe' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();
  if (!canManageOwnCompany(user)) {
    return Response.json({ error: 'Acesso restrito ao admin da empresa' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const parsed = partnerUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados do colaborador inválidos' }, { status: 400 });
    }

    const data = parsed.data;
    const normalizedRole = normalizePartnerRole(data.role);
    const managerUserId = data.managerUserId || null;

    if (managerUserId) {
      const [manager] = await sql`
        SELECT id, role
        FROM partner_users
        WHERE id = ${managerUserId}
          AND partner_id = ${user.partnerId!}
          AND is_active = true
        LIMIT 1
      `;
      if (!manager) {
        return Response.json({ error: 'Gestor informado não pertence à sua empresa' }, { status: 400 });
      }
      const managerRole = normalizePartnerRole(manager.role);
      if (managerRole !== 'director' && managerRole !== 'manager') {
        return Response.json({ error: 'O vínculo precisa apontar para diretor ou gestor' }, { status: 400 });
      }
    }

    if (data.id) {
      const [existing] = await sql`
        SELECT id, password_hash, role
        FROM partner_users
        WHERE id = ${data.id}
          AND partner_id = ${user.partnerId!}
        LIMIT 1
      `;
      if (!existing) {
        return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
      }
      if (normalizePartnerRole(existing.role) === 'director') {
        return Response.json({ error: 'O admin principal da empresa não é editado por esta tela' }, { status: 403 });
      }

      const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : existing.password_hash;
      await sql`
        UPDATE partner_users
        SET
          name = ${data.name},
          email = ${data.email.toLowerCase()},
          password_hash = ${passwordHash},
          role = ${normalizedRole},
          manager_user_id = ${managerUserId},
          updated_at = NOW()
        WHERE id = ${data.id}
      `;
    } else {
      if (!data.password) {
        return Response.json({ error: 'Senha obrigatória para novo colaborador' }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(data.password, 10);
      await sql`
        INSERT INTO partner_users (
          partner_id,
          name,
          email,
          password_hash,
          role,
          manager_user_id,
          permissions,
          is_active,
          updated_at
        )
        VALUES (
          ${user.partnerId!},
          ${data.name},
          ${data.email.toLowerCase()},
          ${passwordHash},
          ${normalizedRole},
          ${managerUserId},
          ${JSON.stringify({})}::jsonb,
          true,
          NOW()
        )
      `;
    }

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId, userId: user.userId }, 'partner_users.save.failed');
    return Response.json({ error: 'Erro interno ao salvar colaborador' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();
  if (!canManageOwnCompany(user)) {
    return Response.json({ error: 'Acesso restrito ao admin da empresa' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const parsed = toggleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const [target] = await sql`
      SELECT id, role
      FROM partner_users
      WHERE id = ${parsed.data.userId}
        AND partner_id = ${user.partnerId!}
      LIMIT 1
    `;
    if (!target) {
      return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }
    if (normalizePartnerRole(target.role) === 'director') {
      return Response.json({ error: 'O admin principal da empresa não pode ser desativado aqui' }, { status: 403 });
    }

    await sql`
      UPDATE partner_users
      SET is_active = ${parsed.data.isActive}, updated_at = NOW()
      WHERE id = ${parsed.data.userId}
    `;

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId, userId: user.userId }, 'partner_users.toggle.failed');
    return Response.json({ error: 'Erro interno ao atualizar colaborador' }, { status: 500 });
  }
}
