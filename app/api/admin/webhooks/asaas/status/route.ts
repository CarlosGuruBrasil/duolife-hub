import { NextResponse } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { getAsaasWebhookQueueStatus } from '@/lib/asaas-webhook-management';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const status = await getAsaasWebhookQueueStatus();
    return NextResponse.json(status);
  } catch (err) {
    logger.error({ err }, 'api.admin.webhooks.asaas.status_failed');
    return NextResponse.json(
      { ok: false, error: 'Falha ao consultar status da fila Asaas' },
      { status: 500 }
    );
  }
}
