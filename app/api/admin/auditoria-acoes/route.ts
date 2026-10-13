import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { ensureSchema } from '@/lib/schema';
import {
  listActionAuditLogs,
  getActionAuditStats,
  seedInitialAuditLogsIfEmpty,
} from '@/lib/action-audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores' },
      { status: 403 }
    );
  }

  await ensureSchema();
  await seedInitialAuditLogsIfEmpty();

  const searchParams = req.nextUrl.searchParams;

  // Paginação e limites
  const limitParam = Number(searchParams.get('limit')) || 50;
  const limit = Math.min(200, Math.max(1, limitParam));

  let page = 1;
  if (searchParams.has('page')) {
    page = Math.max(1, Number(searchParams.get('page')) || 1);
  }

  let offset = 0;
  if (searchParams.has('offset')) {
    offset = Math.max(0, Number(searchParams.get('offset')) || 0);
    if (!searchParams.has('page')) {
      page = Math.floor(offset / limit) + 1;
    }
  } else {
    offset = (page - 1) * limit;
  }

  // Filtros de busca
  const search = (searchParams.get('search') || searchParams.get('q'))?.trim() || undefined;
  const moduleParam = searchParams.get('module')?.trim();
  const module = moduleParam && moduleParam !== 'all' ? moduleParam : undefined;

  const actionParam = searchParams.get('action')?.trim();
  const action = actionParam && actionParam !== 'all' ? actionParam : undefined;

  const statusParam = searchParams.get('status')?.trim();
  const status = statusParam && statusParam !== 'all' ? statusParam : undefined;

  const userId = searchParams.get('userId')?.trim() || undefined;
  const startDate = searchParams.get('startDate')?.trim() || undefined;
  const endDate = searchParams.get('endDate')?.trim() || undefined;

  try {
    const [{ logs, total }, stats] = await Promise.all([
      listActionAuditLogs({
        search,
        module,
        action,
        status,
        userId,
        startDate,
        endDate,
        limit,
        offset,
      }),
      getActionAuditStats(),
    ]);

    const total24h = Number(stats?.total24h || 0);
    const totalErrors24h = Number(stats?.totalErrors24h || 0);
    const totalWarnings24h = Number(stats?.totalWarnings24h || 0);
    const activeUsers24h = Number(stats?.activeUsers24h || 0);
    const successRate24h =
      total24h > 0
        ? Math.max(0, Math.min(100, Math.round(((total24h - totalErrors24h) / total24h) * 100)))
        : 100;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return Response.json({
      ok: true,
      logs,
      total,
      stats: {
        totalRegistered: total,
        total24h,
        totalErrors24h,
        totalWarnings24h,
        activeUsers24h,
        successRate24h,
      },
      page,
      limit,
      totalPages,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.auditoria-acoes.get_failed');
    return Response.json(
      { error: 'Erro ao carregar registros de auditoria de ações', details: err?.message },
      { status: 500 }
    );
  }
}
