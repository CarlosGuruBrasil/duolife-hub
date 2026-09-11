import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { getAllSystemSettings, updateSystemSettings } from '@/lib/system-settings';
import { logger } from '@/lib/logger';

const SECRET_KEYS = new Set([
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_SECRET',
  'ZAPSIGN_API_TOKEN',
  'ZAPSIGN_WEBHOOK_SECRET',
  'WIX_API_KEY',
  'BREVO_API_KEY',
  'BREVO_WEBHOOK_SECRET',
  'EMAIL_MARKETING_API_KEY',
  'EMAIL_MARKETING_WEBHOOK_SECRET',
  'NET4LIFE_INFO_API_TOKEN',
]);

function maskSecret(val: string): string {
  if (!val) return '';
  if (val.length <= 8) return '********';
  return `********${val.slice(-4)}`;
}

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
    const rawSettings: Record<string, string> = {
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

      BREVO_API_KEY: dbSettings['BREVO_API_KEY'] || dbSettings['EMAIL_MARKETING_API_KEY'] || process.env.BREVO_API_KEY || process.env.EMAIL_MARKETING_API_KEY || '',
      BREVO_SENDER_EMAIL: dbSettings['BREVO_SENDER_EMAIL'] || dbSettings['EMAIL_MARKETING_FROM_EMAIL'] || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_MARKETING_FROM_EMAIL || 'contato@duolife.com.br',
      BREVO_SENDER_NAME: dbSettings['BREVO_SENDER_NAME'] || dbSettings['EMAIL_MARKETING_FROM_NAME'] || process.env.BREVO_SENDER_NAME || process.env.EMAIL_MARKETING_FROM_NAME || 'DuoLife Hub',
      BREVO_LIST_ID: dbSettings['BREVO_LIST_ID'] || dbSettings['EMAIL_MARKETING_LIST_ID'] || process.env.BREVO_LIST_ID || process.env.EMAIL_MARKETING_LIST_ID || '',
      BREVO_WEBHOOK_SECRET: dbSettings['BREVO_WEBHOOK_SECRET'] || dbSettings['EMAIL_MARKETING_WEBHOOK_SECRET'] || process.env.BREVO_WEBHOOK_SECRET || process.env.EMAIL_MARKETING_WEBHOOK_SECRET || '',
      BREVO_INTEGRATION_ENABLED: dbSettings['BREVO_INTEGRATION_ENABLED'] || dbSettings['EMAIL_MARKETING_ENABLED'] || process.env.BREVO_INTEGRATION_ENABLED || process.env.EMAIL_MARKETING_ENABLED || 'true',

      NET4LIFE_INFO_API_URL: dbSettings['NET4LIFE_INFO_API_URL'] || process.env.NET4LIFE_INFO_API_URL || 'https://net4lifeinfo.com.br/email_marketing/v1',
      NET4LIFE_INFO_API_TOKEN: dbSettings['NET4LIFE_INFO_API_TOKEN'] || process.env.NET4LIFE_INFO_API_TOKEN || '',
      NET4LIFE_INFO_SENDER_EMAIL: dbSettings['NET4LIFE_INFO_SENDER_EMAIL'] || process.env.NET4LIFE_INFO_SENDER_EMAIL || 'contato@duolife.com.br',
      NET4LIFE_INFO_SENDER_NAME: dbSettings['NET4LIFE_INFO_SENDER_NAME'] || process.env.NET4LIFE_INFO_SENDER_NAME || 'DuoLife Hub',
      NET4LIFE_INFO_REPLY_TO: dbSettings['NET4LIFE_INFO_REPLY_TO'] || process.env.NET4LIFE_INFO_REPLY_TO || '',
      NET4LIFE_INFO_SMTP_USER: dbSettings['NET4LIFE_INFO_SMTP_USER'] || process.env.NET4LIFE_INFO_SMTP_USER || '',
      NET4LIFE_INFO_ENABLED: dbSettings['NET4LIFE_INFO_ENABLED'] || process.env.NET4LIFE_INFO_ENABLED || 'true',
    };

    // Mascara segredos para evitar information disclosure no browser
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawSettings)) {
      settings[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
    }

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

    // Filtra para nunca sobrescrever chaves de API com a máscara retornada pelo GET
    const sanitizedSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (SECRET_KEYS.has(key) && (trimmed.startsWith('********') || trimmed === '')) {
          // Não alterou o segredo existente, ignora
          continue;
        }
        sanitizedSettings[key] = trimmed;
      }
    }

    const updatedBy = user.email || user.name || 'duolife_dev';
    if (Object.keys(sanitizedSettings).length > 0) {
      await updateSystemSettings(sanitizedSettings, updatedBy);
    }

    logger.info({ user: user.email, keysUpdated: Object.keys(sanitizedSettings) }, 'api.admin.chaves-api.update.success');

    return Response.json({
      ok: true,
      message: 'Chaves de API e Modo Teste salvos com sucesso!',
    });
  } catch (err) {
    logger.error({ err }, 'api.admin.chaves-api.post.failed');
    return Response.json({ error: 'Erro interno ao salvar configurações' }, { status: 500 });
  }
}
