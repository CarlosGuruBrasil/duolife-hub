import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sanitizeAllOrphanInstallments } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST: Executa a varredura e expurgo de parcelas órfãs/duplicadas no banco de dados.
 * Aceita { cotacaoId?: string, limit?: number }.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const cotacaoId = typeof body.cotacaoId === 'string' && body.cotacaoId.trim() ? body.cotacaoId.trim() : undefined;
    const limit = typeof body.limit === 'number' ? body.limit : undefined;

    const result = await sanitizeAllOrphanInstallments({ cotacaoId, limit });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.sanitize_installments_failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao processar saneamento de parcelas' },
      { status: 500 }
    );
  }
}
