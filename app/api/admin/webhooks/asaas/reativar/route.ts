import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { reactivateAsaasWebhookQueue } from '@/lib/asaas-webhook-management';
import { recordActionAudit } from '@/lib/action-audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const webhookId = typeof body.webhookId === 'string' ? body.webhookId.trim() : undefined;

    const result = await reactivateAsaasWebhookQueue(webhookId);

    // Registra na trilha de auditoria administrativa
    await recordActionAudit({
      action: 'ASAAS_WEBHOOK_QUEUE_REACTIVATED',
      module: 'chaves_api',
      targetType: 'webhook',
      targetId: webhookId || 'all',
      description: 'Reativação da fila de webhooks do Asaas solicitada pelo administrador',
      userId: admin.userId,
      userName: admin.name || admin.email,
      userEmail: admin.email,
      userRole: admin.role,
      status: result.ok ? 'success' : 'failure',
      metadata: {
        reactivatedCount: result.reactivatedCount,
        isInterrupted: result.isInterrupted,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'api.admin.webhooks.asaas.reactivate_failed');
    return NextResponse.json(
      { ok: false, error: 'Falha ao reativar fila de webhooks no Asaas' },
      { status: 500 }
    );
  }
}
