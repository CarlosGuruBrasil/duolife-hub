import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const patchLinkSchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  label: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  discountPercent: z.coerce.number().min(0).max(40).optional(),
});

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const admin = await verifyAdminAuth();
    if (!admin) return unauthorized();
    if (!isPlatformAdmin(admin)) {
      return Response.json(
        { error: 'Links públicos são exclusivos de administradores' },
        { status: 403 }
      );
    }

    const { id, linkId } = await params;
    await ensureSchema();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const parsed = patchLinkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Dados inválidos', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const [link] = await sql`
      UPDATE public_sale_links
      SET
        status = COALESCE(${parsed.data.status ?? null}, status),
        label = COALESCE(${parsed.data.label ?? null}, label),
        discount_percent = COALESCE(${parsed.data.discountPercent ?? null}, discount_percent),
        updated_at = NOW()
      WHERE id = ${linkId} AND partner_id = ${id}
      RETURNING
        id,
        token,
        partner_id,
        product_id,
        flow_type,
        label,
        status,
        discount_percent,
        expires_at,
        created_at,
        updated_at
    `;

    if (!link) {
      return Response.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    logger.info({ adminId: admin.userId, partnerId: id, linkId }, 'admin.partner.publicLink.updated');

    return Response.json({
      ok: true,
      link: {
        ...link,
        ...(link.token ? { url: `${appBaseUrl()}/contratar/${link.token}` } : {}),
      },
    });
  } catch (err) {
    logger.error({ err }, 'admin.links.patch.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const admin = await verifyAdminAuth();
    if (!admin) return unauthorized();
    if (!isPlatformAdmin(admin)) {
      return Response.json(
        { error: 'Links públicos são exclusivos de administradores' },
        { status: 403 }
      );
    }

    const { id, linkId } = await params;
    await ensureSchema();

    const [link] = await sql`
      UPDATE public_sale_links
      SET
        status = 'inactive',
        updated_at = NOW()
      WHERE id = ${linkId} AND partner_id = ${id}
      RETURNING id, status, updated_at
    `;

    if (!link) {
      return Response.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    logger.info({ adminId: admin.userId, partnerId: id, linkId }, 'admin.partner.publicLink.deactivated');

    return Response.json({ ok: true, message: 'Link desativado com sucesso' });
  } catch (err) {
    logger.error({ err }, 'admin.links.delete.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
