import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { ensureDefaultEmailTemplates } from '@/lib/email-service';
import { getLifecycleConfig, runFullLifecycleScan } from '@/lib/lifecycle-service';
import { verifyAdminAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

async function authorizeRequest(req: NextRequest): Promise<{ authorized: boolean; triggeredBy: string }> {
  const config = await getLifecycleConfig();
  const authHeader = req.headers.get('authorization') || '';
  const headerSecret = req.headers.get('x-cron-secret') || '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';

  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const providedSecret = bearerToken || headerSecret || querySecret;

  // 1. Validação via CRON_SECRET (para cron jobs, Coolify, Docker, curl)
  if (config.cronSecret && providedSecret && providedSecret === config.cronSecret) {
    return { authorized: true, triggeredBy: 'cron' };
  }

  // 2. Validação via Sessão Administrativa (para disparos manuais no painel)
  const adminUser = await verifyAdminAuth();
  if (adminUser) {
    return { authorized: true, triggeredBy: `admin:${adminUser.email}` };
  }

  return { authorized: false, triggeredBy: 'unauthorized' };
}

export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}

async function handleCronRequest(req: NextRequest) {
  try {
    await ensureSchema();
    await ensureDefaultEmailTemplates();

    const { authorized, triggeredBy } = await authorizeRequest(req);
    if (!authorized) {
      logger.warn({ ip: req.headers.get('x-forwarded-for') }, 'Tentativa de execução não autorizada do cron lifecycle');
      return NextResponse.json(
        { error: 'Não autorizado. Forneça o token no cabeçalho Authorization ou autentique-se como administrador.' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const dryRunParam = url.searchParams.get('dryRun');
    const moduleParam = url.searchParams.get('module') as 'all' | 'renewal' | 'delinquency' | null;
    const targetDateParam = url.searchParams.get('targetDate') || undefined;

    let dryRun = dryRunParam === 'true' || dryRunParam === '1';
    let selectedModule: 'all' | 'renewal' | 'delinquency' = moduleParam || 'all';
    let targetDate = targetDateParam;

    // Se for POST com JSON body, mescla opções
    if (req.method === 'POST') {
      try {
        const body = await req.json().catch(() => ({}));
        if (body.dryRun !== undefined) dryRun = Boolean(body.dryRun);
        if (body.module) selectedModule = body.module;
        if (body.targetDate) targetDate = body.targetDate;
      } catch {}
    }

    logger.info({ dryRun, module: selectedModule, targetDate, triggeredBy }, 'Iniciando execução da régua de lifecycle');

    const result = await runFullLifecycleScan({
      targetDate,
      dryRun,
      module: selectedModule,
      triggeredBy,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err: any) {
    logger.error({ err }, 'Erro ao executar rota de cron lifecycle');
    return NextResponse.json(
      { error: 'Erro interno ao processar a régua de lifecycle', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
