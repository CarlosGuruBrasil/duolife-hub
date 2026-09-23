import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const createLinkSchema = z.object({
  productId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  discountPercent: z.coerce.number().min(0, 'Desconto não pode ser negativo').max(40, 'Desconto máximo permitido é de 40%').default(0),
  label: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional()),
  expiresInDays: z.coerce.number().int().positive().max(3650).optional(),
});

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

export async function GET() {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    await ensureSchema();

    let effectivePartnerId = user.partnerId;
    if (!effectivePartnerId && user.corretoraId) {
      const [p] = await sql`
        SELECT id FROM partners
        WHERE corretora_id = ${user.corretoraId} AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      effectivePartnerId = p?.id || null;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ error: 'Nenhum parceiro ativo associado' }, { status: 400 });
    }

    const links = await sql`
      SELECT
        pl.id,
        pl.token,
        pl.label,
        pl.flow_type,
        pl.status,
        COALESCE(pl.discount_percent, 0) AS discount_percent,
        pl.expires_at,
        pl.used_at,
        pl.created_at,
        pl.updated_at,
        pl.metadata,
        pr.id AS product_id,
        pr.name AS product_name,
        pr.code AS product_code,
        COUNT(c.id)::int AS total_cotacoes
      FROM public_sale_links pl
      LEFT JOIN products pr ON pr.id = pl.product_id
      LEFT JOIN cotacoes c ON c.source_token = pl.token
      WHERE pl.partner_id = ${effectivePartnerId}
      GROUP BY pl.id, pr.id
      ORDER BY pl.created_at DESC
      LIMIT 100
    `;

    const baseUrl = appBaseUrl();
    const mapped = links.map((l) => ({
      ...l,
      url: `${baseUrl}/contratar/${l.token}`,
      isExpired: l.expires_at ? new Date(l.expires_at) < new Date() : false,
    }));

    return NextResponse.json({ ok: true, links: mapped });
  } catch (err) {
    logger.error({ err }, 'portal.links.get.failed');
    return NextResponse.json({ error: 'Erro interno ao consultar links' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    await ensureSchema();

    let effectivePartnerId = user.partnerId;
    if (!effectivePartnerId && user.corretoraId) {
      const [p] = await sql`
        SELECT id FROM partners
        WHERE corretora_id = ${user.corretoraId} AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      effectivePartnerId = p?.id || null;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ error: 'Nenhum parceiro ativo associado' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { productId, discountPercent, label, expiresInDays } = parsed.data;

    // Se productId for fornecido, valida se o parceiro tem permissão para ofertar esse produto
    let targetProductId = productId || null;
    if (targetProductId) {
      const [available] = await sql`
        SELECT p.id, p.name FROM products p
        JOIN partner_product_availability ppa ON ppa.product_id = p.id
        WHERE p.id = ${targetProductId}
          AND ppa.partner_id = ${effectivePartnerId}
          AND ppa.is_active = true
          AND p.is_active = true
        LIMIT 1
      `;
      if (!available) {
        // Fallback: se não estiver explicitamente mapeado em partner_product_availability,
        // checa se é um produto padrão ativo
        const [prod] = await sql`
          SELECT id FROM products WHERE id = ${targetProductId} AND is_active = true LIMIT 1
        `;
        if (!prod) {
          return NextResponse.json({ error: 'Produto selecionado não está disponível' }, { status: 422 });
        }
      }
    } else {
      // Produto padrão se não especificado
      targetProductId = 'prod-rc-001';
    }

    const token = `dlk_${crypto.randomBytes(18).toString('base64url')}`;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [created] = await sql`
      INSERT INTO public_sale_links (
        token,
        partner_id,
        product_id,
        flow_type,
        label,
        status,
        discount_percent,
        expires_at,
        metadata,
        created_by_user_id
      )
      VALUES (
        ${token},
        ${effectivePartnerId},
        ${targetProductId},
        'external',
        ${label || null},
        'active',
        ${discountPercent},
        ${expiresAt},
        ${JSON.stringify({
          discountPercent,
          createdByName: user.name,
          createdByUserEmail: user.email,
          createdAt: new Date().toISOString(),
          autoGenerated: false,
        })}::jsonb,
        ${user.userId}
      )
      RETURNING id, token, label, flow_type, status, discount_percent, expires_at, created_at
    `;

    const fullUrl = `${appBaseUrl()}/contratar/${token}`;

    logger.info(
      { partnerId: effectivePartnerId, userId: user.userId, token, discountPercent },
      'portal.partner.exclusiveSaleLink.created'
    );

    return NextResponse.json(
      {
        ok: true,
        link: {
          ...created,
          url: fullUrl,
          total_cotacoes: 0,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err }, 'portal.partner.exclusiveSaleLink.create.failed');
    return NextResponse.json({ error: 'Erro interno ao criar link de venda' }, { status: 500 });
  }
}
