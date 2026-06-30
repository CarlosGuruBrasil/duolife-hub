import { NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const partnerSignupSchema = z.object({
  name: z.string().trim().min(2),
  company: z.string().trim().min(2),
  cnpj: z.string().trim().optional(),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  message: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const { ok, retryAfter } = rateLimit(`signup:${ip}`, 5, 60_000); // 5 cadastros/min por IP
  if (!ok) return rateLimitResponse(retryAfter);

  try {
    await ensureSchema();
    const parsed = partnerSignupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }
    const { name, company, cnpj, email, phone, city, state, message } = parsed.data;

    // Verifica se CNPJ/email já cadastrado
    if (cnpj) {
      const [existing] = await sql`SELECT id FROM partners WHERE cnpj = ${cnpj}`;
      if (existing) return Response.json({ error: 'CNPJ já cadastrado' }, { status: 409 });
    }

    const [partner] = await sql`
      INSERT INTO partners (razao_social, nome_fantasia, cnpj, email, phone, address, status, metadata)
      VALUES (
        ${company},
        ${company},
        ${cnpj || `PENDENTE-${Date.now()}`},
        ${email.toLowerCase()},
        ${phone},
        ${JSON.stringify({ city, state })},
        'pending',
        ${JSON.stringify({ contact_name: name, message, source: 'site_form' })}
      )
      RETURNING id, razao_social, email, status
    `;

    return Response.json({ ok: true, partner }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'partners.signup.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
