import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { getAllSystemSettings, updateSystemSettings } from '@/lib/system-settings';
import { logger } from '@/lib/logger';

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso permitido exclusivamente a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const dbSettings = await getAllSystemSettings();

    // Mapeia os valores atuais com fallback para variáveis de ambiente
    const settings = {
      ASAAS_API_KEY: dbSettings['ASAAS_API_KEY'] || process.env.ASAAS_API_KEY || '',
      ASAAS_ENVIRONMENT: dbSettings['ASAAS_ENVIRONMENT'] || (process.env.ASAAS_BASE_URL?.includes('sandbox') ? 'sandbox' : 'sandbox'),
      ASAAS_WEBHOOK_SECRET: dbSettings['ASAAS_WEBHOOK_SECRET'] || process.env.ASAAS_WEBHOOK_SECRET || '',

      ZAPSIGN_API_TOKEN: dbSettings['ZAPSIGN_API_TOKEN'] || process.env.ZAPSIGN_API_TOKEN || '',
      ZAPSIGN_ENVIRONMENT: dbSettings['ZAPSIGN_ENVIRONMENT'] || (process.env.ZAPSIGN_SANDBOX === 'true' ? 'sandbox' : 'sandbox'),
      ZAPSIGN_TEMPLATE_OFICIAL: dbSettings['ZAPSIGN_TEMPLATE_OFICIAL'] || process.env.ZAPSIGN_TEMPLATE_OFICIAL || '',
      ZAPSIGN_TEMPLATE_100K: dbSettings['ZAPSIGN_TEMPLATE_100K'] || process.env.ZAPSIGN_TEMPLATE_100K || '',
      ZAPSIGN_TEMPLATE_RENOVACAO: dbSettings['ZAPSIGN_TEMPLATE_RENOVACAO'] || process.env.ZAPSIGN_TEMPLATE_RENOVACAO || '',
      ZAPSIGN_WEBHOOK_SECRET: dbSettings['ZAPSIGN_WEBHOOK_SECRET'] || process.env.ZAPSIGN_WEBHOOK_SECRET || '',

      WIX_API_KEY: dbSettings['WIX_API_KEY'] || process.env.WIX_API_KEY || process.env.WIX_AUTH_TOKEN || '',
      WIX_SITE_ID: dbSettings['WIX_SITE_ID'] || process.env.WIX_SITE_ID || process.env.WIX_SITEID || '',
      WIX_INTEGRATION_ENABLED: dbSettings['WIX_INTEGRATION_ENABLED'] || process.env.WIX_INTEGRATION_ENABLED || 'true',
    };

    return Response.json({
      ok: true,
      settings,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'api.admin.chaves-api.get.failed');
    return Response.json({ error: 'Erro interno ao buscar configurações' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso permitido exclusivamente a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return Response.json({ error: 'Payload de configurações inválido' }, { status: 400 });
    }

    const updatedBy = user.email || user.name || 'duolife_dev';
    await updateSystemSettings(settings, updatedBy);

    logger.info({ user: user.email, keysUpdated: Object.keys(settings) }, 'api.admin.chaves-api.update.success');

    return Response.json({
      ok: true,
      message: 'Chaves de API e Modo Teste salvos com sucesso!',
    });
  } catch (err) {
    logger.error({ err }, 'api.admin.chaves-api.post.failed');
    return Response.json({ error: 'Erro interno ao salvar configurações' }, { status: 500 });
  }
}
