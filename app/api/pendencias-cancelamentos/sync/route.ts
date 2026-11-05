import { NextRequest } from 'next/server';
import {
  verifyAuth,
  isInternalUser,
  getPartnerAccessContext,
  unauthorized,
  type PartnerAccessContext,
} from '@/lib/auth';
import { reconcileAsaasBatch } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const user = await verifyAuth();
  if (!user) {
    return unauthorized();
  }

  let access: PartnerAccessContext | null = null;
  if (isInternalUser(user)) {
    access = {
      partnerId: null,
      corretoraId: null,
      isCorretoraUser: false,
      isInternal: true,
      partnerRole: null,
      role: user.role,
      visibleUserIds: null,
    };
  } else {
    access = await getPartnerAccessContext(user);
  }

  if (!access) {
    return Response.json(
      { ok: false, error: 'Acesso negado para este perfil' },
      { status: 403 }
    );
  }

  try {
    const isInternal = access.isInternal;
    const partnerId = isInternal ? undefined : access.partnerId || undefined;
    const limit = isInternal ? 50 : 25;

    // Executa reconciliação em lote com o Asaas suprimindo disparos acidentais de notificações
    const syncResult = await reconcileAsaasBatch({
      partnerId,
      limit,
      onlyPending: true,
      skipNotifications: true,
    });

    return Response.json({
      ok: true,
      totalProcessed: syncResult.totalProcessed,
      updatedToPaid: syncResult.updatedToPaid,
      alreadyPaid: syncResult.alreadyPaid,
      stillPending: syncResult.stillPending,
      errors: syncResult.errors,
      durationMs: syncResult.durationMs,
      message: 'Sincronização com o Asaas concluída com sucesso.',
    });
  } catch (err) {
    logger.error({ err, userId: user.userId }, 'pendencias_cancelamentos.sync.failed');
    return Response.json(
      { ok: false, error: 'Erro ao sincronizar cobranças com o Asaas' },
      { status: 500 }
    );
  }
}
