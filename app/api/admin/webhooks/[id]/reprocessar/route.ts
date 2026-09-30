import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { ensureSchema } from '@/lib/schema';
import { reprocessWebhookEvent } from '@/lib/webhook-processor';
import { logger } from '@/lib/logger';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito a usuários internos' }, { status: 403 });
  }

  await ensureSchema();

  try {
    const { id } = await params;
    if (!id) {
      return Response.json({ ok: false, error: 'ID do webhook não informado' }, { status: 400 });
    }

    const result = await reprocessWebhookEvent(id);

    return Response.json({
      ok: true,
      success: result.success,
      message: result.message || (result.success ? 'Reprocessado com sucesso' : 'Falha no reprocessamento'),
      event: result.event,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.webhooks.reprocessar.failed');
    return Response.json(
      { ok: false, error: 'Erro interno ao reprocessar webhook', details: err?.message },
      { status: 500 }
    );
  }
}
