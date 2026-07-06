import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';

const linkSchema = z.object({
  productId: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  flowType: z.enum(['internal', 'external']).optional(),
  expiresInDays: z.coerce.number().int().positive().max(3650).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;
  await ensureSchema();

  const links = await sql`
    SELECT
      pl.id,
      pl.token,
      pl.label,
      pl.flow_type,
      pl.status,
      pl.expires_at,
      pl.used_at,
      pl.created_at,
      pl.updated_at,
      pl.metadata,
      pr.name AS product_name,
      pr.code AS product_code
    FROM public_sale_links pl
    LEFT JOIN products pr ON pr.id = pl.product_id
    WHERE pl.partner_id = ${id}
    ORDER BY pl.created_at DESC
    LIMIT 100
  `;

  return Response.json({ links });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;
  await ensureSchema();

  const parsed = linkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const token = `dlk_${crypto.randomBytes(18).toString('base64url')}`;
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  try {
    const [link] = await sql`
      INSERT INTO public_sale_links (
        token,
        partner_id,
        product_id,
        flow_type,
        label,
        status,
        expires_at,
        metadata,
        created_by_user_id
      )
      VALUES (
        ${token},
        ${id},
        ${parsed.data.productId || null},
        ${parsed.data.flowType || 'external'},
        ${parsed.data.label || null},
        'active',
        ${expiresAt},
        ${JSON.stringify(parsed.data.metadata || {})}::jsonb,
        ${admin.userId}
      )
      RETURNING id, token, label, flow_type, status, expires_at, created_at
    `;

    logger.info({ adminId: admin.userId, partnerId: id, token }, 'admin.partner.publicLink.created');
    return Response.json({
      ok: true,
      link: {
        ...link,
        url: `${appBaseUrl()}/contratar/${token}`,
      },
    }, { status: 201 });
  } catch (err) {
    logger.error({ err, partnerId: id }, 'admin.partner.publicLink.create.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
