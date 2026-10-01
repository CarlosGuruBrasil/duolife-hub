import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { auditAnachronicQuotes, purgeAndReconcileAnachronicBatch } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET: Audita todas as cotações com cobranças anacrônicas do Asaas.
 */
export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const result = await auditAnachronicQuotes();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.anachronic.audit_failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao auditar cotações anacrônicas' },
      { status: 500 }
    );
  }
}

/**
 * POST: Executa a limpeza e reconciliação em lote das cotações anacrônicas.
 * Aceita { ids?: string[], dryRun?: boolean }.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : undefined;
    const dryRun = body.dryRun === true;

    const result = await purgeAndReconcileAnachronicBatch({ ids, dryRun });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.anachronic.purge_failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao processar limpeza em lote' },
      { status: 500 }
    );
  }
}
