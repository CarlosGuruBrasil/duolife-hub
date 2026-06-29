import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

const partnerProfileSchema = z.object({
  nomeFantasia: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).optional().or(z.literal('')),
  city: z.string().trim().optional(),
  state: z.string().trim().max(2).optional(),
  street: z.string().trim().optional(),
});

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();

    const [partner] = await sql`
      SELECT id, razao_social, nome_fantasia, cnpj, email, phone, address, status, created_at
      FROM partners
      WHERE id = ${user.partnerId!}
    `;

    if (!partner) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    return Response.json({ partner });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'partners.me.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  try {
    await ensureSchema();

    const parsed = partnerProfileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados do perfil inválidos' }, { status: 400 });
    }

    const data = parsed.data;
    const address = {
      city: data.city || '',
      state: data.state || '',
      street: data.street || '',
    };

    const [partner] = await sql`
      UPDATE partners
      SET
        nome_fantasia = ${data.nomeFantasia},
        email = ${data.email.toLowerCase()},
        phone = ${data.phone || null},
        address = ${JSON.stringify(address)}::jsonb,
        updated_at = NOW()
      WHERE id = ${user.partnerId!}
      RETURNING id, razao_social, nome_fantasia, cnpj, email, phone, address, status, updated_at
    `;

    if (!partner) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    return Response.json({ ok: true, partner });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'partners.me.update.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
