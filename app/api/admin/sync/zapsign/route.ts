import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { reconcileZapSignDocuments, getZapSignSyncStatus, type ZapSignReconcileOptions } from '@/lib/zapsign-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const status = await getZapSignSyncStatus();
    return Response.json({ ok: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao consultar status ZapSign';
    logger.error({ err, adminId: admin.userId }, 'admin.zapsign.status.failed');
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = (await req.json().catch(() => ({}))) as ZapSignReconcileOptions;
    const result = await reconcileZapSignDocuments({
      onlyPending: body?.onlyPending !== undefined ? Boolean(body.onlyPending) : true,
      limit: typeof body?.limit === 'number' ? body.limit : 500,
      concurrency: typeof body?.concurrency === 'number' ? body.concurrency : 4,
    });

    return Response.json({
      ok: true,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao reconciliar contratos com a ZapSign';
    logger.error({ err, adminId: admin.userId }, 'admin.zapsign.reconcile.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
