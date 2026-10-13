import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { ensureSchema } from '@/lib/schema';
import { getActionAuditLogById } from '@/lib/action-audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores' },
      { status: 403 }
    );
  }

  await ensureSchema();

  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id?.trim();

    if (!id) {
      return Response.json(
        { error: 'Identificador do registro de auditoria não informado' },
        { status: 400 }
      );
    }

    const log = await getActionAuditLogById(id);

    if (!log) {
      return Response.json(
        { error: 'Registro de auditoria não encontrado' },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      log,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.auditoria-acoes.get_by_id_failed');
    return Response.json(
      { error: 'Erro ao buscar registro de auditoria', details: err?.message },
      { status: 500 }
    );
  }
}
