import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyPartnerAuth, isDevUser, isPlatformAdmin, unauthorized } from '@/lib/auth';
import { calculateConversionMetrics } from '@/lib/link-tracker';
import { somenteDigitos, validarCpf, validarCnpj } from '@/lib/documento';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const createLinkSchema = z
  .object({
    productId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
    discountPercent: z.coerce.number().min(0, 'Desconto não pode ser negativo').max(40, 'Desconto máximo permitido é de 40%').default(0),
    label: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional()),
    expiresInDays: z.coerce.number().int().positive().max(3650).optional(),
    isExclusive: z.boolean().default(false),
    targetDocument: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    targetName: z.preprocess(emptyToUndefined, z.string().trim().max(150).optional()),
    maxUses: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      if (data.isExclusive && data.targetDocument) {
        const cleanDoc = somenteDigitos(data.targetDocument);
        if (cleanDoc.length === 11) return validarCpf(cleanDoc);
        if (cleanDoc.length === 14) return validarCnpj(cleanDoc);
        return false;
      }
      return true;
    },
    {
      message: 'Documento (CPF ou CNPJ) informado para o link exclusivo é inválido',
      path: ['targetDocument'],
    }
  );

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
        COALESCE(pl.is_exclusive, false) AS is_exclusive,
        pl.target_document,
        pl.target_name,
        pl.max_uses,
        COALESCE(pl.used_count, 0)::int AS used_count,
        COALESCE(pl.views_count, 0)::int AS views_count,
        COALESCE(pl.unique_views_count, 0)::int AS unique_views_count,
        pl.last_accessed_at,
        pl.expires_at,
        pl.used_at,
        pl.created_at,
        pl.updated_at,
        pl.metadata,
        pr.id AS product_id,
        pr.name AS product_name,
        pr.code AS product_code,
        COUNT(c.id)::int AS total_cotacoes,
        COUNT(c.id) FILTER (WHERE c.status IN ('aprovada', 'emitida'))::int AS total_vendas
      FROM public_sale_links pl
      LEFT JOIN products pr ON pr.id = pl.product_id
      LEFT JOIN cotacoes c ON c.source_token = pl.token
      WHERE pl.partner_id = ${effectivePartnerId}
      GROUP BY pl.id, pr.id
      ORDER BY pl.created_at DESC
      LIMIT 100
    `;

    const baseUrl = appBaseUrl();
    const mapped = links.map((l: any) => {
      const viewsCount = Number(l.views_count || 0);
      const uniqueViewsCount = Number(l.unique_views_count || 0);
      const totalCotacoes = Number(l.total_cotacoes || 0);
      const totalVendas = Number(l.total_vendas || 0);
      const metrics = calculateConversionMetrics(viewsCount, uniqueViewsCount, totalCotacoes, totalVendas);

      return {
        ...l,
        views_count: viewsCount,
        unique_views_count: uniqueViewsCount,
        total_cotacoes: totalCotacoes,
        total_vendas: totalVendas,
        ...metrics,
        conversion_rate_cotacao: metrics.conversionRateCotacao,
        conversion_rate_venda: metrics.conversionRateVenda,
        fechamento_rate: metrics.fechamentoRate,
        url: `${baseUrl}/contratar/${l.token}`,
        isExpired: l.expires_at ? new Date(l.expires_at) < new Date() : false,
      };
    });

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

    const { productId, discountPercent, label, expiresInDays, isExclusive, targetDocument, targetName, maxUses } = parsed.data;

    // Higienização de campos exclusivos
    const cleanTargetDoc = targetDocument ? somenteDigitos(targetDocument) : null;
    const effectiveIsExclusive = Boolean(isExclusive);
    const effectiveMaxUses = effectiveIsExclusive ? (maxUses ?? 1) : (maxUses ?? null);

    // Define o produto alvo (ou padrão) e valida disponibilidade do produto e permissão do parceiro
    const targetProductId = productId || 'prod-rc-001';

    const [ppa] = await sql`
      SELECT is_active
      FROM partner_product_availability
      WHERE partner_id = ${effectivePartnerId}
        AND product_id = ${targetProductId}
      LIMIT 1
    `;

    if (ppa && ppa.is_active === false) {
      return NextResponse.json(
        { error: 'Este produto não está habilitado para este parceiro' },
        { status: 403 }
      );
    }

    const [prod] = await sql`
      SELECT id, name FROM products WHERE id = ${targetProductId} AND is_active = true LIMIT 1
    `;
    if (!prod) {
      return NextResponse.json({ error: 'Produto selecionado não está disponível' }, { status: 422 });
    }

    const isMed = targetProductId === 'prod-rc-med-001' || targetProductId === 'RC-MED-001';
    if (isMed && !isDevUser(user) && !isPlatformAdmin(user)) {
      return NextResponse.json(
        { error: 'O produto RC Médico está em desenvolvimento e não permite geração de links públicos por parceiros de vendas.' },
        { status: 403 }
      );
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
        is_exclusive,
        target_document,
        target_name,
        max_uses,
        used_count,
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
        ${effectiveIsExclusive},
        ${cleanTargetDoc},
        ${targetName || null},
        ${effectiveMaxUses},
        0,
        ${expiresAt},
        ${JSON.stringify({
          discountPercent,
          isExclusive: effectiveIsExclusive,
          targetDocument: cleanTargetDoc,
          targetName: targetName || null,
          maxUses: effectiveMaxUses,
          createdByName: user.name,
          createdByUserEmail: user.email,
          createdAt: new Date().toISOString(),
          autoGenerated: false,
        })}::jsonb,
        ${user.userId}
      )
      RETURNING id, token, label, flow_type, status, discount_percent, is_exclusive, target_document, target_name, max_uses, used_count, expires_at, created_at
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
