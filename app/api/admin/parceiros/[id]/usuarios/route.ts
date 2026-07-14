import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { verifyAdminAuth, unauthorized, normalizePartnerRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

const partnerUserSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['director', 'manager', 'broker', 'partner']),
  managerUserId: z.string().trim().nullable().optional(),
});

const toggleSchema = z.object({
  userId: z.string().trim().min(1),
  isActive: z.boolean(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    await ensureSchema();
    const { id: partnerId } = await params;
    const parsed = partnerUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados do usuário inválidos' }, { status: 400 });
    }

    const data = parsed.data;
    const normalizedRole = normalizePartnerRole(data.role);
    const managerUserId = normalizedRole === 'director' ? null : (data.managerUserId || null);

    const [partner] = await sql`
      SELECT id
      FROM partners
      WHERE id = ${partnerId}
      LIMIT 1
    `;
    if (!partner) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    if (managerUserId) {
      const [manager] = await sql`
        SELECT id, role
        FROM partner_users
        WHERE id = ${managerUserId}
          AND partner_id = ${partnerId}
          AND is_active = true
        LIMIT 1
      `;
      if (!manager) {
        return Response.json({ error: 'Gestor informado não pertence a esta operação' }, { status: 400 });
      }
      const managerRole = normalizePartnerRole(manager.role);
      if (managerRole !== 'director' && managerRole !== 'manager') {
        return Response.json({ error: 'A vinculação só pode apontar para diretor ou gestor' }, { status: 400 });
      }
    }

    if (data.id) {
      const [existing] = await sql`
        SELECT id, password_hash
        FROM partner_users
        WHERE id = ${data.id}
          AND partner_id = ${partnerId}
        LIMIT 1
      `;
      if (!existing) {
        return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
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
        return Response.json({ error: 'A senha é obrigatória para novos usuários' }, { status: 400 });
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
          ${partnerId},
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
    logger.error({ err }, 'admin.partner_users.save.failed');
    return Response.json({ error: 'Erro interno ao salvar usuário' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    await ensureSchema();
    const { id: partnerId } = await params;
    const parsed = toggleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    await sql`
      UPDATE partner_users
      SET is_active = ${parsed.data.isActive}, updated_at = NOW()
      WHERE id = ${parsed.data.userId}
        AND partner_id = ${partnerId}
    `;

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'admin.partner_users.toggle.failed');
    return Response.json({ error: 'Erro interno ao atualizar usuário' }, { status: 500 });
  }
}
