import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { ensureSchema } from '@/lib/schema';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito a usuários internos' }, { status: 403 });
  }

  await ensureSchema();

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
  const provider = searchParams.get('provider')?.trim() || null;
  const status = searchParams.get('status')?.trim() || null;
  const search = searchParams.get('search')?.trim() || null;

  try {
    // 1. Estatísticas gerais
    const [statsRow] = await sql<{
      total: number;
      success_count: number;
      failed_count: number;
      pending_count: number;
      asaas_count: number;
      zapsign_count: number;
      wix_count: number;
    }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE processed = true AND (error_message IS NULL OR error_message = ''))::int AS success_count,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL AND error_message != '')::int AS failed_count,
        COUNT(*) FILTER (WHERE processed = false AND (error_message IS NULL OR error_message = ''))::int AS pending_count,
        COUNT(*) FILTER (WHERE provider = 'asaas')::int AS asaas_count,
        COUNT(*) FILTER (WHERE provider = 'zapsign')::int AS zapsign_count,
        COUNT(*) FILTER (WHERE provider = 'wix')::int AS wix_count
      FROM webhook_events
    `;

    const total = statsRow?.total || 0;
    const successCount = statsRow?.success_count || 0;
    const failedCount = statsRow?.failed_count || 0;
    const pendingCount = statsRow?.pending_count || 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 100;

    // 2. Consulta filtrada
    const searchPattern = search ? `%${search}%` : null;

    const logs = await sql<any[]>`
      SELECT
        id,
        provider,
        event_type,
        external_id,
        signature_valid,
        payload,
        processed,
        error_message,
        retry_count,
        last_retried_at,
        request_headers,
        created_at
      FROM webhook_events
      WHERE
        (${provider}::text IS NULL OR provider = ${provider})
        AND (
          ${status}::text IS NULL
          OR (${status} = 'success' AND processed = true AND (error_message IS NULL OR error_message = ''))
          OR (${status} = 'failed' AND error_message IS NOT NULL AND error_message != '')
          OR (${status} = 'pending' AND processed = false AND (error_message IS NULL OR error_message = ''))
        )
        AND (
          ${searchPattern}::text IS NULL
          OR external_id ILIKE ${searchPattern}
          OR event_type ILIKE ${searchPattern}
          OR error_message ILIKE ${searchPattern}
          OR payload::text ILIKE ${searchPattern}
        )
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // 3. Contagem total de registros filtrados para paginação
    const [filteredCountRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM webhook_events
      WHERE
        (${provider}::text IS NULL OR provider = ${provider})
        AND (
          ${status}::text IS NULL
          OR (${status} = 'success' AND processed = true AND (error_message IS NULL OR error_message = ''))
          OR (${status} = 'failed' AND error_message IS NOT NULL AND error_message != '')
          OR (${status} = 'pending' AND processed = false AND (error_message IS NULL OR error_message = ''))
        )
        AND (
          ${searchPattern}::text IS NULL
          OR external_id ILIKE ${searchPattern}
          OR event_type ILIKE ${searchPattern}
          OR error_message ILIKE ${searchPattern}
          OR payload::text ILIKE ${searchPattern}
        )
    `;

    return Response.json({
      ok: true,
      logs,
      totalFiltered: filteredCountRow?.count || 0,
      stats: {
        total,
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
        successRate,
        byProvider: {
          asaas: statsRow?.asaas_count || 0,
          zapsign: statsRow?.zapsign_count || 0,
          wix: statsRow?.wix_count || 0,
        },
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.webhooks.auditoria.failed');
    return Response.json(
      { error: 'Erro ao carregar auditoria de webhooks', details: err?.message },
      { status: 500 }
    );
  }
}
