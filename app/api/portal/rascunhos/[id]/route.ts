import { NextRequest } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { unauthorized } from '@/lib/auth';
import { getRascunho, deleteRascunho, verifyDraftUser } from '@/lib/cotacao-rascunhos-service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await verifyDraftUser();
    if (!user) return unauthorized();
    const { id } = await params;
    await ensureSchema();
    const rascunho = await getRascunho(user, id);
    if (!rascunho) return Response.json({ error: 'Rascunho não encontrado' }, { status: 404 });
    return Response.json({ ok: true, rascunho });
  } catch (err) {
    logger.error({ err }, 'rascunhos.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await verifyDraftUser();
    if (!user) return unauthorized();
    const { id } = await params;
    await ensureSchema();
    const removed = await deleteRascunho(user, id);
    if (!removed) return Response.json({ error: 'Rascunho não encontrado' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'rascunhos.delete.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
