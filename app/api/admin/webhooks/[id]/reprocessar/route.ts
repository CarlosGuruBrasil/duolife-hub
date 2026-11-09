import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { reprocessWebhookEvent } from '@/lib/webhook-processor';
import { recordActionAudit } from '@/lib/action-audit';
import { logger } from '@/lib/logger';

/**
 * Reexecução MANUAL de um único webhook, exclusiva de administradores.
 *
 * Body obrigatório:
 *  - confirm: true                     (confirmação explícita do clique)
 *  - reason: string (mín. 10 chars)    (motivo, gravado na auditoria)
 * Opcional:
 *  - allowSideEffects: boolean         (libera e-mails, gatilhos e cobranças; padrão false)
 *  - confirmAlreadyProcessed: boolean  (exigido quando o evento já foi processado)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  await ensureSchema();

  const { id } = await params;
  if (!id) {
    return Response.json({ ok: false, error: 'ID do webhook não informado' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const confirm = body?.confirm === true;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const allowSideEffects = body?.allowSideEffects === true;
  const confirmAlreadyProcessed = body?.confirmAlreadyProcessed === true;

  if (!confirm || reason.length < 10) {
    return Response.json(
      { ok: false, error: 'Confirmação explícita e motivo (mín. 10 caracteres) são obrigatórios.' },
      { status: 400 }
    );
  }

  const [event] = await sql<{ id: string; provider: string; event_type: string | null; processed: boolean; created_at: string }[]>`
    SELECT id, provider, event_type, processed, created_at FROM webhook_events WHERE id = ${id} LIMIT 1
  `;
  if (!event) {
    return Response.json({ ok: false, error: 'Evento de webhook não encontrado' }, { status: 404 });
  }
  if (event.processed && !confirmAlreadyProcessed) {
    return Response.json(
      { ok: false, error: 'Este webhook já foi processado. Confirme explicitamente para executá-lo novamente.' },
      { status: 409 }
    );
  }

  try {
    const result = await reprocessWebhookEvent(id, { allowSideEffects });

    await recordActionAudit({
      action: 'WEBHOOK_MANUAL_REPROCESS',
      module: 'auditoria_webhooks',
      targetType: 'webhook',
      targetId: id,
      description: `Reexecução manual de webhook ${event.provider}/${event.event_type || '-'}: ${reason}`,
      userId: admin.userId,
      userName: admin.name || admin.email,
      userEmail: admin.email,
      userRole: admin.role,
      status: result.success ? 'success' : 'failure',
      metadata: {
        reason,
        allowSideEffects,
        wasProcessed: event.processed,
        eventCreatedAt: event.created_at,
        message: result.message,
      },
    });

    return Response.json({
      ok: true,
      success: result.success,
      message: result.message || (result.success ? 'Executado com sucesso' : 'Falha na execução'),
      sideEffects: allowSideEffects ? 'liberados' : 'suprimidos',
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
