import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';

const cotacaoSchema = z.object({
  clientName: z.string().trim().min(2),
  clientCpfCnpj: z.string().trim().min(11),
  clientEmail: z.string().trim().email().optional().or(z.literal('')),
  clientPhone: z.string().trim().optional(),
  importanciaSegurada: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
  clientData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();
    await seedInitialData();

    const cotacoes = await sql`
      SELECT
        c.id,
        c.client_name,
        c.client_cpf_cnpj,
        c.client_email,
        c.client_phone,
        c.importancia_segurada,
        c.premio_final,
        c.status,
        c.valid_until,
        c.created_at,
        p.name AS product_name
      FROM cotacoes c
      JOIN products p ON p.id = c.product_id
      WHERE c.partner_id = ${user.partnerId!}
      ORDER BY c.created_at DESC
      LIMIT 100
    `;

    return Response.json({ cotacoes });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'cotacoes.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();
    await seedInitialData();

    const parsed = cotacaoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados da cotação inválidos' }, { status: 400 });
    }

    const data = parsed.data;
    const [product] = await sql`
      SELECT id FROM products WHERE code = 'RC-001' AND is_active = true
    `;

    if (!product) {
      return Response.json({ error: 'Produto RC não configurado' }, { status: 422 });
    }

    const [cotacao] = await sql`
      INSERT INTO cotacoes (
        partner_id,
        partner_user_id,
        product_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        client_data,
        importancia_segurada,
        status,
        notes
      )
      VALUES (
        ${user.partnerId!},
        ${user.userId},
        ${product.id},
        ${data.clientName},
        ${data.clientCpfCnpj},
        ${data.clientEmail || null},
        ${data.clientPhone || null},
        ${JSON.stringify(data.clientData || {})},
        ${data.importanciaSegurada || null},
        'rascunho',
        ${data.notes || null}
      )
      RETURNING id, status, created_at
    `;

    return Response.json({ ok: true, cotacao }, { status: 201 });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'cotacoes.create.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
