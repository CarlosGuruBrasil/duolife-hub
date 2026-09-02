import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import type { AutomationTriggerLogRecord } from '@/lib/triggers/types';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 50));
  const eventType = searchParams.get('eventType')?.trim() || null;
  const triggerId = searchParams.get('triggerId')?.trim() || null;
  const status = searchParams.get('status')?.trim() || null;

  try {
    const logs = await sql<AutomationTriggerLogRecord[]>`
      SELECT id, trigger_id, event_type, context_id, context_data, evaluated_nodes, actions_executed, status, error_message, created_at
      FROM automation_trigger_logs
      WHERE
        (${eventType}::text IS NULL OR event_type = ${eventType})
        AND (${triggerId}::text IS NULL OR trigger_id = ${triggerId})
        AND (${status}::text IS NULL OR status = ${status})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return Response.json({
      ok: true,
      logs,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.gatilhos.logs.get.failed');
    return Response.json({ error: 'Erro ao buscar logs de automação', details: err?.message }, { status: 500 });
  }
}
