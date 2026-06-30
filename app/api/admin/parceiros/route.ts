import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    await ensureSchema();

    const parceiros = status
      ? await sql`
          SELECT id, razao_social, nome_fantasia, cnpj, email, phone, status, created_at
          FROM partners
          WHERE status = ${status}
          ORDER BY created_at DESC
          LIMIT 200
        `
      : await sql`
          SELECT id, razao_social, nome_fantasia, cnpj, email, phone, status, created_at
          FROM partners
          ORDER BY created_at DESC
          LIMIT 200
        `;

    return Response.json({ parceiros });
  } catch (err) {
    logger.error({ err }, 'admin.parceiros.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const updateStatusSchema = z.object({
  parceiro_id: z.string().min(1),
  status: z.enum(['active', 'pending', 'suspended']),
});

export async function PATCH(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const parsed = updateStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { parceiro_id, status } = parsed.data;

    const [partner] = await sql`
      UPDATE partners SET status = ${status}, updated_at = NOW()
      WHERE id = ${parceiro_id}
      RETURNING id, razao_social, status
    `;

    if (!partner) return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });

    logger.info({ adminId: admin.userId, parceiro_id, status }, 'admin.partner.status.updated');
    return Response.json({ ok: true, partner });
  } catch (err) {
    logger.error({ err }, 'admin.parceiros.update.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
