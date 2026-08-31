import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { compareClientsWithWix, syncWixClientsToLocalDb } from '@/lib/wix-compare';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const result = await compareClientsWithWix();
    return Response.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao processar comparativo com Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.comparison.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const syncResult = await syncWixClientsToLocalDb();
    const freshComparison = await compareClientsWithWix();

    return Response.json({
      ok: true,
      sync: syncResult,
      data: freshComparison,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao sincronizar clientes do Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.sync_clients.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
