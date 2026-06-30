import { NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

function validarCnpj(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '');
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const calc = (len: number) => {
    let s = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { s += Number(n[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(n[12]) && calc(13) === Number(n[13]);
}

const partnerSignupSchema = z.object({
  name: z.string().trim().min(2),
  company: z.string().trim().min(2),
  cnpj: z.string().trim().refine(v => !v || validarCnpj(v), { message: 'CNPJ inválido' }).optional(),
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
      const first = parsed.error.issues[0];
      return Response.json({ error: first?.message ?? 'Campos obrigatórios faltando' }, { status: 400 });
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
        ${cnpj || null},
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
