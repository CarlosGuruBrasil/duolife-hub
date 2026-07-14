import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { isDevUser, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { getWhiteLabelConfig, mergeWhiteLabelConfig, type WhiteLabelLink } from '@/lib/white-label';

const whiteLabelSchema = z.object({
  slug: z.string().trim().min(2).optional().or(z.literal('')),
  companyName: z.string().trim().optional().or(z.literal('')),
  companySlogan: z.string().trim().optional().or(z.literal('')),
  companyPhone: z.string().trim().optional().or(z.literal('')),
  companyEmail: z.string().trim().email().optional().or(z.literal('')),
  companyWebsite: z.string().trim().url().optional().or(z.literal('')),
  logoUrl: z.string().trim().url().optional().or(z.literal('')),
  primaryColor: z.string().trim().optional().or(z.literal('')),
  secondaryColor: z.string().trim().optional().or(z.literal('')),
  accentColor: z.string().trim().optional().or(z.literal('')),
  domain: z.string().trim().optional().or(z.literal('')),
  subdomain: z.string().trim().optional().or(z.literal('')),
  institutionText: z.string().trim().optional().or(z.literal('')),
  footerText: z.string().trim().optional().or(z.literal('')),
  publicTitle: z.string().trim().optional().or(z.literal('')),
  publicDescription: z.string().trim().optional().or(z.literal('')),
  wixCode: z.string().trim().optional().or(z.literal('')),
  links: z.array(z.object({ label: z.string().trim().min(1), url: z.string().trim().url() })).optional(),
  availableProductIds: z.array(z.string().trim().min(1)).optional(),
  customTexts: z.record(z.string(), z.string()).optional(),
});

function cleanColor(value: string | undefined | null, fallback: string) {
  return value && value.trim() ? value.trim() : fallback;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAdminAuth();
    if (!admin) return unauthorized();
    if (!isDevUser(admin)) return Response.json({ error: 'Ajustes de white-label são exclusivos do perfil dev' }, { status: 403 });

    const { id } = await params;
    await ensureSchema();

    const [partner] = await sql`
      SELECT id, razao_social, nome_fantasia, email, phone, metadata, status, created_at
      FROM partners
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!partner) return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });

    return Response.json({
      partner: {
        ...partner,
        whiteLabel: getWhiteLabelConfig(partner.metadata),
      },
    });
  } catch (err) {
    logger.error({ err }, 'admin.branding.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const admin = await verifyAdminAuth();
    if (!admin) return unauthorized();
    if (!isDevUser(admin)) return Response.json({ error: 'Ajustes de white-label são exclusivos do perfil dev' }, { status: 403 });

    await ensureSchema();

    const parsed = whiteLabelSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Configuração white-label inválida' }, { status: 400 });
    }

    const current = await sql`
      SELECT metadata
      FROM partners
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!current[0]) return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });

    const body = parsed.data;
    const whiteLabel = {
      ...getWhiteLabelConfig(current[0].metadata),
      slug: body.slug || getWhiteLabelConfig(current[0].metadata).slug,
      companyName: body.companyName || getWhiteLabelConfig(current[0].metadata).companyName,
      companySlogan: body.companySlogan || getWhiteLabelConfig(current[0].metadata).companySlogan,
      companyPhone: body.companyPhone || getWhiteLabelConfig(current[0].metadata).companyPhone,
      companyEmail: body.companyEmail || getWhiteLabelConfig(current[0].metadata).companyEmail,
      companyWebsite: body.companyWebsite || getWhiteLabelConfig(current[0].metadata).companyWebsite,
      logoUrl: body.logoUrl || getWhiteLabelConfig(current[0].metadata).logoUrl,
      primaryColor: cleanColor(body.primaryColor, getWhiteLabelConfig(current[0].metadata).primaryColor),
      secondaryColor: cleanColor(body.secondaryColor, getWhiteLabelConfig(current[0].metadata).secondaryColor),
      accentColor: cleanColor(body.accentColor, getWhiteLabelConfig(current[0].metadata).accentColor),
      domain: body.domain || getWhiteLabelConfig(current[0].metadata).domain,
      subdomain: body.subdomain || getWhiteLabelConfig(current[0].metadata).subdomain,
      institutionText: body.institutionText || getWhiteLabelConfig(current[0].metadata).institutionText,
      footerText: body.footerText || getWhiteLabelConfig(current[0].metadata).footerText,
      publicTitle: body.publicTitle || getWhiteLabelConfig(current[0].metadata).publicTitle,
      publicDescription: body.publicDescription || getWhiteLabelConfig(current[0].metadata).publicDescription,
      wixCode: body.wixCode || getWhiteLabelConfig(current[0].metadata).wixCode,
      links: (body.links as WhiteLabelLink[] | undefined) ?? getWhiteLabelConfig(current[0].metadata).links,
      availableProductIds: body.availableProductIds ?? getWhiteLabelConfig(current[0].metadata).availableProductIds,
      customTexts: body.customTexts ?? getWhiteLabelConfig(current[0].metadata).customTexts,
    };
    const [partner] = await sql`
      UPDATE partners
      SET metadata = ${JSON.stringify(mergeWhiteLabelConfig(current[0].metadata, whiteLabel))}::jsonb,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, razao_social, metadata, updated_at
    `;

    logger.info({ adminId: admin.userId, partnerId: id }, 'admin.partner.whiteLabel.updated');
    return Response.json({ ok: true, partner });
  } catch (err) {
    logger.error({ err, partnerId: id }, 'admin.partner.whiteLabel.update.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
