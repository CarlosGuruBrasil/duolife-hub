import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { validarCnpj, somenteDigitos } from '@/lib/documento';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig } from '@/lib/white-label';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    await ensureSchema();

    const corretoras = await sql`
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
        c.updated_at,
        (SELECT COUNT(*)::int FROM partners p WHERE p.corretora_id = c.id) AS partners_count,
        (SELECT COUNT(*)::int FROM cotacoes cot WHERE cot.corretora_id = c.id) AS cotacoes_count,
        (SELECT COUNT(*)::int FROM sales s WHERE s.corretora_id = c.id) AS sales_count
      FROM corretoras c
      WHERE (${status}::text IS NULL OR c.status = ${status})
      ORDER BY c.created_at ASC
    `;

    const formatted = corretoras.map((item) => ({
      ...item,
      whiteLabel: getWhiteLabelConfig(item.metadata),
    }));

    return Response.json({
      corretoras: formatted,
      canManage: isPlatformAdmin(admin),
    });
  } catch (err) {
    logger.error({ err }, 'admin.corretoras.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const createCorretoraSchema = z.object({
  razao_social: z.string().trim().min(2, 'Informe a Razão Social'),
  nome_fantasia: z.string().trim().min(2, 'Informe o Nome Fantasia'),
  cnpj: z.string().trim().min(14, 'Informe o CNPJ'),
  susep: z.string().trim().optional(),
  email: z.string().trim().email('E-mail institucional inválido'),
  phone: z.string().trim().min(8, 'Informe o telefone'),
  street: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().max(2).optional(),
  slug: z.string().trim().min(2).regex(/^[a-z0-9_-]+$/, 'Slug deve ter apenas letras minúsculas, números e hífens').optional(),
  primaryColor: z.string().trim().optional(),
  secondaryColor: z.string().trim().optional(),
  logoUrl: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  const cnpjLimpo = somenteDigitos(data.cnpj);
  if (!validarCnpj(cnpjLimpo)) {
    ctx.addIssue({
      code: 'custom',
      path: ['cnpj'],
      message: 'CNPJ inválido',
    });
  }
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem cadastrar corretoras' }, { status: 403 });
  }

  const parsed = createCorretoraSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message);
    return Response.json({ error: issues[0] ?? 'Dados inválidos', issues }, { status: 400 });
  }

  const data = parsed.data;
  const cnpj = somenteDigitos(data.cnpj);
  const email = data.email.toLowerCase();

  try {
    await ensureSchema();

    const [cnpjExiste] = await sql`SELECT id FROM corretoras WHERE cnpj = ${cnpj} LIMIT 1`;
    if (cnpjExiste) {
      return Response.json({ error: 'Já existe uma corretora cadastrada com este CNPJ' }, { status: 409 });
    }

    const address = {
      street: data.street || '',
      neighborhood: data.neighborhood || '',
      city: data.city || '',
      state: data.state || '',
    };

    const whiteLabel = {
      slug: data.slug || data.nome_fantasia.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      companyName: data.nome_fantasia,
      companyPhone: data.phone,
      companyEmail: email,
      logoUrl: data.logoUrl || '',
      primaryColor: data.primaryColor || '#004172',
      secondaryColor: data.secondaryColor || '#00a0af',
      susep: data.susep || '',
    };

    const [corretora] = await sql`
      INSERT INTO corretoras (
        razao_social,
        nome_fantasia,
        cnpj,
        susep,
        email,
        phone,
        address,
        status,
        metadata
      )
      VALUES (
        ${data.razao_social},
        ${data.nome_fantasia},
        ${cnpj},
        ${data.susep || null},
        ${email},
        ${data.phone},
        ${JSON.stringify(address)}::jsonb,
        'active',
        ${JSON.stringify({ whiteLabel, created_by: admin.userId })}::jsonb
      )
      RETURNING id, razao_social, nome_fantasia, cnpj, susep, email, phone, status, created_at
    `;

    logger.info({ adminId: admin.userId, corretoraId: corretora.id }, 'admin.corretoras.created');
    return Response.json({ ok: true, corretora }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'admin.corretoras.create.failed');
    return Response.json({ error: 'Erro interno ao cadastrar corretora' }, { status: 500 });
  }
}
