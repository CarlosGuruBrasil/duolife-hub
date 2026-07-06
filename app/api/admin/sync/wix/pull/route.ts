import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { pullWixIntoLocalMirror } from '@/lib/wix-pull';
import { logger } from '@/lib/logger';

export async function POST(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const result = await pullWixIntoLocalMirror();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, adminId: admin.userId }, 'admin.wix.pull.failed');
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao sincronizar Wix',
    }, { status: 503 });
  }
}

