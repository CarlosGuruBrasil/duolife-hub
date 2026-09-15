import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { pullWixIntoLocalMirror, listWixCollectionsStatus, type WixPullOptions } from '@/lib/wix-pull';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const collections = await listWixCollectionsStatus();
    return Response.json({ ok: true, collections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar coleções do Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.list_collections.failed');
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = (await req.json().catch(() => ({}))) as WixPullOptions;
    const result = await pullWixIntoLocalMirror({
      collections: Array.isArray(body?.collections) ? body.collections : undefined,
      entities: body?.entities && typeof body.entities === 'object' ? body.entities : undefined,
      createdAfter: typeof body?.createdAfter === 'string' && body.createdAfter.trim() ? body.createdAfter.trim() : undefined,
      onlyNew: Boolean(body?.onlyNew),
      maxItemsPerCollection: typeof body?.maxItemsPerCollection === 'number' ? body.maxItemsPerCollection : undefined,
    });

    return Response.json({
      ok: true,
      data: result,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.pull.failed');
    return Response.json(
      {
        ok: false,
        error: message || 'Erro ao sincronizar Wix. Verifique os logs do servidor para detalhes.',
      },
      { status: message.includes('desligada') ? 409 : 503 }
    );
  }
}
