import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';

const updateLinkSchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  label: z.string().trim().min(1).max(100).optional(),
});

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

async function resolveEffectivePartnerId(user: { partnerId?: string | null; corretoraId?: string | null }) {
  let effectivePartnerId = user.partnerId || null;
  if (!effectivePartnerId && user.corretoraId) {
    const [p] = await sql`
      SELECT id FROM partners
      WHERE corretora_id = ${user.corretoraId} AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    effectivePartnerId = p?.id || null;
  }
  return effectivePartnerId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    await ensureSchema();

    const effectivePartnerId = await resolveEffectivePartnerId(user);
    if (!effectivePartnerId) {
      return NextResponse.json({ error: 'Nenhum parceiro ativo associado' }, { status: 400 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID do link é obrigatório' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = updateLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const [existing] = await sql`
      SELECT
        id,
        partner_id,
        token,
        product_id,
        flow_type,
        label,
        status,
        discount_percent,
        expires_at,
        used_at,
        metadata,
        created_at,
        updated_at
      FROM public_sale_links
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing || existing.partner_id !== effectivePartnerId) {
      return NextResponse.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    const { status, label } = parsed.data;
    const newStatus = status ?? existing.status;
    const newLabel = label !== undefined ? label : existing.label;

    const [updated] = await sql`
      UPDATE public_sale_links
      SET
        status = ${newStatus},
        label = ${newLabel},
        updated_at = NOW()
      WHERE id = ${id} AND partner_id = ${effectivePartnerId}
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
        used_at,
        metadata,
        created_at,
        updated_at
    `;

    if (!updated) {
      return NextResponse.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    const baseUrl = appBaseUrl();
    const formatted = {
      ...updated,
      url: `${baseUrl}/contratar/${updated.token}`,
      isExpired: updated.expires_at ? new Date(updated.expires_at) < new Date() : false,
    };

    logger.info(
      { partnerId: effectivePartnerId, linkId: id, status: newStatus, label: newLabel },
      'portal.links.updated'
    );

    return NextResponse.json({ ok: true, link: formatted });
  } catch (err) {
    logger.error({ err }, 'portal.links.patch.failed');
    return NextResponse.json({ error: 'Erro interno ao atualizar link' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    await ensureSchema();

    const effectivePartnerId = await resolveEffectivePartnerId(user);
    if (!effectivePartnerId) {
      return NextResponse.json({ error: 'Nenhum parceiro ativo associado' }, { status: 400 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID do link é obrigatório' }, { status: 400 });
    }

    const [existing] = await sql`
      SELECT id, partner_id
      FROM public_sale_links
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing || existing.partner_id !== effectivePartnerId) {
      return NextResponse.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    await sql`
      UPDATE public_sale_links
      SET
        status = 'inactive',
        updated_at = NOW()
      WHERE id = ${id} AND partner_id = ${effectivePartnerId}
    `;

    logger.info(
      { partnerId: effectivePartnerId, linkId: id },
      'portal.links.deactivated'
    );

    return NextResponse.json({ ok: true, message: 'Link desativado com sucesso' });
  } catch (err) {
    logger.error({ err }, 'portal.links.delete.failed');
    return NextResponse.json({ error: 'Erro interno ao desativar link' }, { status: 500 });
  }
}
