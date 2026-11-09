import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { unauthorized } from '@/lib/auth';
import {
  listRascunhos,
  saveRascunho,
  RASCUNHO_MAX_PAYLOAD_BYTES,
  verifyDraftUser,
} from '@/lib/cotacao-rascunhos-service';

const optionalText = z.string().trim().max(200).nullish();

const saveSchema = z.object({
  id: z.string().trim().min(1).max(64).nullish(),
  productId: z.string().trim().max(100).nullish(),
  partnerId: z.string().trim().max(64).nullish(),
  step: z.coerce.number().int().min(1).max(6),
  clientName: optionalText,
  clientCpfCnpj: z.string().trim().max(30).nullish(),
  payload: z.record(z.string(), z.unknown()),
});

export async function GET() {
  try {
    const user = await verifyDraftUser();
    if (!user) return unauthorized();
    await ensureSchema();
    const rascunhos = await listRascunhos(user);
    return Response.json({ ok: true, rascunhos });
  } catch (err) {
    logger.error({ err }, 'rascunhos.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await verifyDraftUser();
    if (!user) return unauthorized();

    const raw = await req.text();
    if (raw.length > RASCUNHO_MAX_PAYLOAD_BYTES) {
      return Response.json({ error: 'Rascunho muito grande' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Dados do rascunho inválidos', details: parsed.error.issues }, { status: 400 });
    }

    await ensureSchema();
    const saved = await saveRascunho(user, {
      ...parsed.data,
      id: parsed.data.id || undefined,
    });
    return Response.json({ ok: true, rascunho: saved });
  } catch (err) {
    logger.error({ err }, 'rascunhos.save.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
