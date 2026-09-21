import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { getAsaasSyncStatus, reconcileAsaasBatch } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const status = await getAsaasSyncStatus();
    return Response.json({ ok: true, status });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.status_failed');
    return Response.json({ ok: false, error: 'Erro ao consultar status Asaas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' ? body.limit : 50;
    const onlyPending = body.onlyPending !== false;

    const result = await reconcileAsaasBatch({ limit, onlyPending });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.batch_failed');
    return Response.json({ ok: false, error: 'Erro ao processar reconciliação em lote com Asaas' }, { status: 500 });
  }
}
