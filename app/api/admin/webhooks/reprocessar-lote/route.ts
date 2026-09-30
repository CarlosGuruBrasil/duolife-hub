import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { ensureSchema } from '@/lib/schema';
import { reprocessBatchWebhookEvents } from '@/lib/webhook-processor';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito a usuários internos' }, { status: 403 });
  }

  await ensureSchema();

  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids : undefined;

    const summary = await reprocessBatchWebhookEvents(ids);

    return Response.json({
      ok: true,
      processed: summary.processed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      results: summary.results,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.webhooks.reprocessar_lote.failed');
    return Response.json(
      { ok: false, error: 'Erro ao reprocessar webhooks em lote', details: err?.message },
      { status: 500 }
    );
  }
}
