import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isDevUser, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]+$/).max(40),
  category: z.string().trim().min(2).max(80),
  productType: z.enum(['insurance', 'service']),
  integrationType: z.enum(['full_journey', 'external_link']).default('full_journey'),
  externalLinkUrl: z.string().trim().optional(),
  providerName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
  publicTitle: z.string().trim().max(160).optional(),
  targetAudience: z.string().trim().max(300).optional(),
  insurerCnpj: z.string().trim().max(18).optional(),
  commissionRate: z.coerce.number().min(0).max(100).nullable(),
  minPremium: z.coerce.number().positive().nullable(),
  useRcJourney: z.boolean(),
  policyPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]+$/).max(20).optional(),
  validityDays: z.coerce.number().int().min(1).max(3650).nullable(),
  saleRecognition: z.enum(['on_payment', 'on_full_payment', 'on_issuance']),
  renewalEnabled: z.boolean(),
  requiresUnderwriting: z.boolean(),
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).max(20),
  availability: z.enum(['all_active', 'selected']),
  partnerIds: z.array(z.string().uuid()).max(200).default([]),
});

export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) return Response.json({ error: 'Sem permissão para gerenciar produtos' }, { status: 403 });
  try {
    const [products, partners] = await Promise.all([
      sql`SELECT id, name, code, category, product_type, integration_type, external_link_url, insurer_name, description, base_commission_rate, min_premium, flow_key, is_active, is_quoteable, public_title, target_audience, insurer_cnpj, validity_days, sale_recognition, renewal_enabled, requires_underwriting, required_documents, (SELECT count(*)::int FROM partner_product_availability ppa WHERE ppa.product_id = products.id AND ppa.is_active) AS partners_count FROM products ORDER BY created_at DESC`,
      sql`SELECT id, razao_social, nome_fantasia FROM partners WHERE status = 'active' ORDER BY COALESCE(nome_fantasia, razao_social)`,
    ]);
    return Response.json({ products, partners });
  } catch (error) {
    logger.error({ error }, 'admin.products.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) return Response.json({ error: 'Sem permissão para cadastrar produtos' }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Dados do produto inválidos' }, { status: 400 });
  const input = parsed.data;
  const rcFlow = input.useRcJourney && input.integrationType === 'full_journey';
  if (rcFlow && input.productType !== 'insurance') return Response.json({ error: 'O fluxo RC só pode ser usado em seguros' }, { status: 422 });
  if (input.availability === 'selected' && input.partnerIds.length === 0) return Response.json({ error: 'Selecione ao menos um parceiro' }, { status: 422 });
  try {
    const [product] = await sql`
      INSERT INTO products (name, code, category, insurer_name, insurer_cnpj, description, public_title, target_audience, base_commission_rate, min_premium, is_active, product_type, integration_type, external_link_url, flow_key, pricing_strategy, policy_prefix, is_quoteable, is_contractable, is_payable, validity_days, sale_recognition, renewal_enabled, requires_underwriting, required_documents)
      VALUES (${input.name}, ${input.code}, ${input.category}, ${input.providerName || null}, ${input.insurerCnpj || null}, ${input.description || null}, ${input.publicTitle || null}, ${input.targetAudience || null}, ${input.commissionRate}, ${input.minPremium}, true, ${input.productType}, ${input.integrationType}, ${input.externalLinkUrl || null}, ${rcFlow ? 'rc_professional_v1' : 'manual_v1'}, ${rcFlow ? 'rc_wix_planos_v1' : 'manual_v1'}, ${rcFlow ? (input.policyPrefix || 'DL-RC') : null}, ${rcFlow || !!input.externalLinkUrl}, ${rcFlow}, ${rcFlow}, ${input.validityDays}, ${input.saleRecognition}, ${input.renewalEnabled}, ${input.requiresUnderwriting}, ${JSON.stringify(input.requiredDocuments)}::jsonb)
      RETURNING id, name, code
    `;
    const partnerIds = input.availability === 'all_active'
      ? (await sql<{ id: string }[]>`SELECT id FROM partners WHERE status = 'active'`).map((partner) => partner.id)
      : input.partnerIds;
    if (partnerIds.length) await sql`
      INSERT INTO partner_product_availability (partner_id, product_id, is_active)
      SELECT partner_id, ${product.id}, true FROM UNNEST(${partnerIds}::text[]) AS partner_id
      ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true, updated_at = NOW()
    `;
    logger.info({ adminId: admin.userId, productId: product.id, code: product.code }, 'admin.product.created');
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    logger.error({ error, code: input.code }, 'admin.product.create.failed');
    return Response.json({ error: 'Não foi possível cadastrar o produto. Verifique se o código já existe.' }, { status: 409 });
  }
}
