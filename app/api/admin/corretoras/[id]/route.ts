import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig, mergeWhiteLabelConfig } from '@/lib/white-label';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;

  try {
    await ensureSchema();

    const [corretora] = await sql`
      SELECT
        c.id,
        c.razao_social,
        c.nome_fantasia,
        c.cnpj,
        c.susep,
        c.email,
        c.phone,
        c.address,
        c.status,
        c.metadata,
        c.created_at,
        c.updated_at
      FROM corretoras c
      WHERE c.id = ${id}
      LIMIT 1
    `;

    if (!corretora) {
      return Response.json({ error: 'Corretora não encontrada' }, { status: 404 });
    }

    const parceiros = await sql`
      SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, status, created_at
      FROM partners
      WHERE corretora_id = ${id}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const stats = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM partners WHERE corretora_id = ${id}) AS total_parceiros,
        (SELECT COUNT(*)::int FROM cotacoes WHERE corretora_id = ${id}) AS total_cotacoes,
        (SELECT COUNT(*)::int FROM sales WHERE corretora_id = ${id}) AS total_vendas,
        (SELECT COALESCE(SUM(premio_total), 0)::numeric FROM sales WHERE corretora_id = ${id}) AS volume_vendas
    `;

    return Response.json({
      corretora: {
        ...corretora,
        whiteLabel: getWhiteLabelConfig(corretora.metadata),
      },
      parceiros,
      stats: stats[0] || {},
      canManage: isPlatformAdmin(admin),
    });
  } catch (err) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const updateCorretoraSchema = z.object({
  razao_social: z.string().trim().min(2).optional(),
  nome_fantasia: z.string().trim().min(2).optional(),
  susep: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(8).optional(),
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  whiteLabel: z.record(z.string(), z.unknown()).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem alterar corretoras' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await ensureSchema();

    const parsed = updateCorretoraSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const [current] = await sql`SELECT id, metadata, address FROM corretoras WHERE id = ${id} LIMIT 1`;
    if (!current) {
      return Response.json({ error: 'Corretora não encontrada' }, { status: 404 });
    }

    const body = parsed.data;
    const nextMetadata = body.whiteLabel
      ? mergeWhiteLabelConfig(current.metadata, body.whiteLabel as any)
      : current.metadata;

    const nextAddress = body.address ? { ...((current.address as Record<string, unknown>) || {}), ...body.address } : current.address;

    const [updated] = await sql`
      UPDATE corretoras
      SET
        razao_social = COALESCE(${body.razao_social ?? null}, razao_social),
        nome_fantasia = COALESCE(${body.nome_fantasia ?? null}, nome_fantasia),
        susep = COALESCE(${body.susep ?? null}, susep),
        email = COALESCE(${body.email ? body.email.toLowerCase() : null}, email),
        phone = COALESCE(${body.phone ?? null}, phone),
        status = COALESCE(${body.status ?? null}, status),
        address = ${JSON.stringify(nextAddress)}::jsonb,
        metadata = ${JSON.stringify(nextMetadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, razao_social, nome_fantasia, cnpj, susep, email, phone, status, metadata, updated_at
    `;

    logger.info({ adminId: admin.userId, corretoraId: id }, 'admin.corretora.updated');
    return Response.json({ ok: true, corretora: updated });
  } catch (err) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.update.failed');
    return Response.json({ error: 'Erro interno ao atualizar corretora' }, { status: 500 });
  }
}
