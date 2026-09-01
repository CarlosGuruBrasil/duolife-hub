import { NextRequest } from 'next/server';
import { z } from 'zod';
import { canManageOwnCompany, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { getWhiteLabelConfig, mergeWhiteLabelConfig } from '@/lib/white-label';
import { getOrCreatePartnerSaleLink } from '@/lib/referral';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const partnerProfileSchema = z.object({
  nomeFantasia: z.string().trim().min(2, 'Nome fantasia precisa ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  phone: z.preprocess(emptyToUndefined, z.string().trim().min(8).optional()),
  city: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  state: z.preprocess(emptyToUndefined, z.string().trim().max(2).optional()),
  street: z.preprocess(emptyToUndefined, z.string().trim().optional()),

  // Configurações White Label & Referral
  wixCode: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{2,20}$/, 'Código de indicação deve ter de 2 a 20 caracteres (apenas letras, números, hífen e sublinhado)')
      .optional()
  ),
  slug: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companyName: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companySlogan: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companyPhone: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companyEmail: z.preprocess(emptyToUndefined, z.string().trim().email('E-mail comercial inválido').optional()),
  companyWebsite: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  logoUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  primaryColor: z.preprocess(emptyToUndefined, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Cor primária inválida').optional()),
  secondaryColor: z.preprocess(emptyToUndefined, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Cor secundária inválida').optional()),
  accentColor: z.preprocess(emptyToUndefined, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Cor de destaque inválida').optional()),
  publicTitle: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  publicDescription: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();

    const [partner] = await sql<
      Array<{
        id: string;
        razao_social: string;
        nome_fantasia: string | null;
        cnpj: string | null;
        cpf: string | null;
        person_type: string;
        email: string;
        phone: string | null;
        address: Record<string, unknown> | null;
        status: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>
    >`
      SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, address, status, metadata, created_at
      FROM partners
      WHERE id = ${user.partnerId!}
    `;

    if (!partner) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    const whiteLabel = getWhiteLabelConfig(partner.metadata);
    const saleLink = await getOrCreatePartnerSaleLink(partner.id);

    return Response.json({
      partner,
      whiteLabel,
      saleLink,
    });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'partners.me.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();
  if (!canManageOwnCompany(user)) {
    return Response.json({ error: 'Somente o gestor ou diretor da corretora pode alterar estes dados' }, { status: 403 });
  }

  try {
    await ensureSchema();

    const body = await req.json();
    const parsed = partnerProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados do perfil inválidos';
      return Response.json({ error: firstError }, { status: 400 });
    }

    const data = parsed.data;

    // 1. Busca dados atuais do parceiro para mesclar metadata
    const [current] = await sql<
      Array<{
        id: string;
        metadata: Record<string, unknown>;
      }>
    >`
      SELECT id, metadata
      FROM partners
      WHERE id = ${user.partnerId!}
      LIMIT 1
    `;

    if (!current) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    // 2. Valida unicidade do código de indicação (wixCode / slug)
    const normalizedWixCode = data.wixCode ? data.wixCode.toUpperCase().trim() : undefined;
    if (normalizedWixCode) {
      const conflict = await sql`
        SELECT id
        FROM partners
        WHERE id != ${user.partnerId!}
          AND (
            metadata->'whiteLabel'->>'wixCode' ILIKE ${normalizedWixCode}
            OR metadata->'whiteLabel'->>'slug' ILIKE ${normalizedWixCode}
          )
        LIMIT 1
      `;

      if (conflict.length > 0) {
        return Response.json(
          { error: `O código de indicação "${normalizedWixCode}" já está em uso por outro parceiro.` },
          { status: 409 }
        );
      }
    }

    // 3. Atualiza os dados de endereço
    const address = {
      city: data.city || '',
      state: data.state || '',
      street: data.street || '',
    };

    // 4. Mescla o White Label no metadata
    const whiteLabelPatch = {
      ...(normalizedWixCode !== undefined ? { wixCode: normalizedWixCode } : {}),
      ...(data.slug !== undefined ? { slug: data.slug.toLowerCase().trim() } : {}),
      ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
      ...(data.companySlogan !== undefined ? { companySlogan: data.companySlogan } : {}),
      ...(data.companyPhone !== undefined ? { companyPhone: data.companyPhone } : {}),
      ...(data.companyEmail !== undefined ? { companyEmail: data.companyEmail.toLowerCase() } : {}),
      ...(data.companyWebsite !== undefined ? { companyWebsite: data.companyWebsite } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.primaryColor !== undefined ? { primaryColor: data.primaryColor } : {}),
      ...(data.secondaryColor !== undefined ? { secondaryColor: data.secondaryColor } : {}),
      ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
      ...(data.publicTitle !== undefined ? { publicTitle: data.publicTitle } : {}),
      ...(data.publicDescription !== undefined ? { publicDescription: data.publicDescription } : {}),
    };

    const nextMetadata = mergeWhiteLabelConfig(current.metadata, whiteLabelPatch);

    // 5. Salva no banco de dados
    const [partner] = await sql`
      UPDATE partners
      SET
        nome_fantasia = ${data.nomeFantasia},
        email = ${data.email.toLowerCase()},
        phone = ${data.phone || null},
        address = ${JSON.stringify(address)}::jsonb,
        metadata = ${JSON.stringify(nextMetadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${user.partnerId!}
      RETURNING id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, address, status, metadata, updated_at
    `;

    const whiteLabel = getWhiteLabelConfig(partner.metadata);
    const saleLink = await getOrCreatePartnerSaleLink(partner.id);

    logger.info({ partnerId: user.partnerId }, 'partners.me.updated');

    return Response.json({
      ok: true,
      partner,
      whiteLabel,
      saleLink,
    });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'partners.me.update.failed');
    return Response.json({ error: 'Erro interno ao salvar perfil' }, { status: 500 });
  }
}
