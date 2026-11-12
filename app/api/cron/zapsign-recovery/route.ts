import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { verifyAdminAuth } from '@/lib/auth';
import { verifyWebhookToken } from '@/lib/webhook-auth';
import { getSystemSetting } from '@/lib/system-settings';
import { logger } from '@/lib/logger';
import { runZapSignSignatureRecovery } from '@/lib/zapsign-signature-recovery';

/**
 * Contingência de webhooks ZapSign perdidos.
 *
 * Acionado periodicamente por um agendador externo (crontab, Coolify, GitHub Actions etc.).
 * Autenticação: `Authorization: Bearer <CRON_SECRET>` ou `x-cron-secret: <CRON_SECRET>`
 * (nunca por query string), ou sessão de administrador para disparo manual.
 *
 * Parâmetros (query ou corpo JSON no POST):
 *   dryRun=true   → apenas consulta a ZapSign e relata o que seria recuperado.
 *   force=true    → ignora o intervalo mínimo entre execuções (somente administrador).
 *   limit=N       → tamanho do lote (padrão 100, máx. 500).
 */
export const dynamic = 'force-dynamic';

async function authorize(req: NextRequest): Promise<{ authorized: boolean; triggeredBy: string; isAdmin: boolean }> {
  const cronSecret = (await getSystemSetting('CRON_SECRET', process.env.CRON_SECRET || '')).trim();
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided = bearer || (req.headers.get('x-cron-secret') || '').trim();

  if (cronSecret && provided && verifyWebhookToken(provided, cronSecret)) {
    return { authorized: true, triggeredBy: 'cron', isAdmin: false };
  }

  const admin = await verifyAdminAuth();
  if (admin) return { authorized: true, triggeredBy: `admin:${admin.email}`, isAdmin: true };

  return { authorized: false, triggeredBy: 'unauthorized', isAdmin: false };
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

async function handle(req: NextRequest) {
  try {
    await ensureSchema();

    const { authorized, triggeredBy, isAdmin } = await authorize(req);
    if (!authorized) {
      logger.warn({ ip: req.headers.get('x-forwarded-for') }, 'zapsign.recovery.unauthorized');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    let dryRun = parseBool(params.get('dryRun'));
    let force = parseBool(params.get('force'));
    let limit: number | undefined = params.get('limit') ? Number(params.get('limit')) : undefined;

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.dryRun !== undefined) dryRun = parseBool(body.dryRun);
      if (body.force !== undefined) force = parseBool(body.force);
      if (body.limit !== undefined) limit = Number(body.limit);
    }

    const result = await runZapSignSignatureRecovery({
      triggeredBy,
      dryRun,
      // O agendador não pode furar o intervalo mínimo; só o administrador, manualmente.
      force: isAdmin && force,
      batchSize: limit,
    });

    const httpStatus = result.status === 'failed' ? 500 : result.status === 'partial' ? 207 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    logger.error({ err }, 'zapsign.recovery.route_failed');
    return NextResponse.json({ error: 'Erro interno ao executar a contingência ZapSign' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
