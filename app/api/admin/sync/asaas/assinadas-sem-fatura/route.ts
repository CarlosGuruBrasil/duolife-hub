import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import {
  auditSignedQuotesWithoutInvoice,
  generateInvoicesForSignedQuotesBatch,
} from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET: Audita todas as cotações com contrato assinado mas sem fatura gerada no Asaas.
 */
export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const result = await auditSignedQuotesWithoutInvoice();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.assinadas_sem_fatura.audit_failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao auditar cotações assinadas sem fatura' },
      { status: 500 }
    );
  }
}

/**
 * POST: Gera as faturas no Asaas em lote para cotações assinadas.
 * Aceita { ids?: string[] }.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : undefined;

    const result = await generateInvoicesForSignedQuotesBatch({ ids });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'api.admin.sync.asaas.assinadas_sem_fatura.generate_failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao gerar faturas em lote' },
      { status: 500 }
    );
  }
}
