import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { syncWixSalesToLocalDb } from '@/lib/wix-sales-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const result = await syncWixSalesToLocalDb();
    logger.info({ adminId: admin.userId, salesCreated: result.salesCreated }, 'admin.wix.sales_sync.success');
    return Response.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao sincronizar vendas do Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.sales_sync.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
