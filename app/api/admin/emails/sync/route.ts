import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { logger } from '@/lib/logger';
import { isNet4LifeInfoEnabled } from '@/lib/system-settings';
import { syncAllTemplatesWithNet4Life, fetchNet4LifeTemplates } from '@/lib/net4life-service';

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const isEnabled = await isNet4LifeInfoEnabled();
    if (!isEnabled) {
      return Response.json(
        {
          error:
            'A integração com o E-mail Marketing Net4Life Info não está configurada ou ativa. Cadastre o token da aplicação em Configurações > Chaves de API antes de sincronizar.',
        },
        { status: 400 }
      );
    }

    const result = await syncAllTemplatesWithNet4Life();

    logger.info(
      { userId: user.userId, userEmail: user.email, result },
      'emails.templates.sync_all_executed'
    );

    return Response.json({
      ok: result.success,
      total: result.total,
      synced: result.synced,
      errors: result.errors,
      message: result.success
        ? `Sincronização concluída com sucesso! ${result.synced} de ${result.total} templates sincronizados com o Net4Life Info.`
        : `${result.synced} de ${result.total} templates sincronizados. Ocorreram avisos em alguns modelos.`,
    });
  } catch (err: any) {
    logger.error({ err }, 'emails.templates.sync_all_failed');
    return Response.json(
      { error: err?.message || 'Falha ao sincronizar templates com o servidor de e-mail marketing.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const isEnabled = await isNet4LifeInfoEnabled();
    if (!isEnabled) {
      return Response.json({ ok: false, message: 'Integração Net4Life Info desativada ou sem token.' });
    }

    const remoteData = await fetchNet4LifeTemplates();
    return Response.json({
      ok: remoteData.success,
      templates: remoteData.templates || [],
      error: remoteData.error,
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
