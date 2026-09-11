import { sql } from './pg';
import { ensureSchema } from './schema';

export interface SystemSetting {
  key: string;
  value: string;
  description?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  isSandbox: boolean;
  webhookSecret: string;
}

export interface ZapSignConfig {
  apiToken: string;
  baseUrl: string;
  isSandbox: boolean;
  templateOficial: string;
  template100k: string;
  templateRenovacao: string;
  webhookSecret: string;
}

export interface WixConfigSettings {
  apiKey: string;
  siteId: string;
  integrationEnabled: boolean;
}

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  listId: string;
  webhookSecret: string;
  enabled: boolean;
}

export interface Net4LifeInfoConfig {
  apiUrl: string;
  apiToken: string;
  senderEmail: string;
  senderName: string;
  replyTo: string;
  smtpUser: string;
  enabled: boolean;
}

/**
 * Busca todas as configurações salvas no banco de dados.
 */
export async function getAllSystemSettings(): Promise<Record<string, string>> {
  await ensureSchema();
  try {
    const rows = await sql<{ key: string; value: string }[]>`
      SELECT key, value FROM system_settings
    `;
    const settingsMap: Record<string, string> = {};
    for (const row of rows) {
      settingsMap[row.key] = row.value;
    }
    return settingsMap;
  } catch {
    return {};
  }
}

/**
 * Busca o valor de uma chave específica do banco de dados, usando fallback de env var se necessário.
 */
export async function getSystemSetting(key: string, fallbackEnvValue?: string): Promise<string> {
  await ensureSchema();
  try {
    const rows = await sql<{ value: string }[]>`
      SELECT value FROM system_settings WHERE key = ${key} LIMIT 1
    `;
    if (rows.length > 0 && rows[0].value !== undefined && rows[0].value !== '') {
      return rows[0].value;
    }
  } catch {
    // ignora erro e usa fallback
  }
  return fallbackEnvValue || '';
}

/**
 * Salva ou atualiza um conjunto de configurações no banco de dados.
 */
export async function updateSystemSettings(
  settings: Record<string, string>,
  updatedBy: string
): Promise<void> {
  await ensureSchema();
  for (const [key, value] of Object.entries(settings)) {
    const cleanKey = key.trim();
    const cleanVal = value !== undefined && value !== null ? String(value).trim() : '';
    
    await sql`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES (${cleanKey}, ${cleanVal}, ${updatedBy}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
    `;
  }
}

/**
 * Retorna as configurações ativas do Asaas (API Key, Base URL e modo Sandbox).
 */
export async function getAsaasConfig(): Promise<AsaasConfig> {
  const dbSettings = await getAllSystemSettings();

  const apiKey = dbSettings['ASAAS_API_KEY'] || process.env.ASAAS_API_KEY || '';
  const webhookSecret = dbSettings['ASAAS_WEBHOOK_SECRET'] || process.env.ASAAS_WEBHOOK_SECRET || '';
  
  // Determina se é Sandbox ou Produção
  let envSetting = dbSettings['ASAAS_ENVIRONMENT'];
  if (!envSetting) {
    const envUrl = process.env.ASAAS_BASE_URL || '';
    envSetting = envUrl.includes('sandbox') ? 'sandbox' : 'production';
  }

  const isSandbox = envSetting === 'sandbox';
  const baseUrl = isSandbox
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://www.asaas.com/api/v3';

  return {
    apiKey,
    baseUrl,
    isSandbox,
    webhookSecret,
  };
}

/**
 * Retorna as configurações ativas do ZapSign (API Token, Base URL, templates e modo Sandbox).
 */
export async function getZapSignConfig(): Promise<ZapSignConfig> {
  const dbSettings = await getAllSystemSettings();

  const apiToken = dbSettings['ZAPSIGN_API_TOKEN'] || process.env.ZAPSIGN_API_TOKEN || '';
  const webhookSecret = dbSettings['ZAPSIGN_WEBHOOK_SECRET'] || process.env.ZAPSIGN_WEBHOOK_SECRET || '';
  const templateOficial = dbSettings['ZAPSIGN_TEMPLATE_OFICIAL'] || process.env.ZAPSIGN_TEMPLATE_OFICIAL || '';
  const template100k = dbSettings['ZAPSIGN_TEMPLATE_100K'] || process.env.ZAPSIGN_TEMPLATE_100K || '';
  const templateRenovacao = dbSettings['ZAPSIGN_TEMPLATE_RENOVACAO'] || process.env.ZAPSIGN_TEMPLATE_RENOVACAO || '';

  let envSetting = dbSettings['ZAPSIGN_ENVIRONMENT'];
  if (!envSetting) {
    const isSandboxEnv = process.env.ZAPSIGN_SANDBOX === 'true' || (process.env.ZAPSIGN_BASE_URL || '').includes('sandbox');
    envSetting = isSandboxEnv ? 'sandbox' : 'production';
  }

  const isSandbox = envSetting === 'sandbox';
  const baseUrl = isSandbox
    ? 'https://sandbox.api.zapsign.com.br/api/v1'
    : 'https://api.zapsign.com.br/api/v1';

  return {
    apiToken,
    baseUrl,
    isSandbox,
    templateOficial,
    template100k,
    templateRenovacao,
    webhookSecret,
  };
}

/**
 * Retorna as configurações ativas do Wix (API Key e Site ID).
 */
export async function getWixConfigSettings(): Promise<WixConfigSettings> {
  const dbSettings = await getAllSystemSettings();
  const apiKey = dbSettings['WIX_API_KEY'] || process.env.WIX_API_KEY || process.env.WIX_AUTH_TOKEN || '';
  const siteId = dbSettings['WIX_SITE_ID'] || process.env.WIX_SITE_ID || process.env.WIX_SITEID || '';
  const integrationEnabled =
    (dbSettings['WIX_INTEGRATION_ENABLED'] || process.env.WIX_INTEGRATION_ENABLED || 'true') !== 'false';

  return { apiKey, siteId, integrationEnabled };
}

export async function isWixIntegrationEnabled(): Promise<boolean> {
  const value = await getSystemSetting('WIX_INTEGRATION_ENABLED', process.env.WIX_INTEGRATION_ENABLED || 'true');
  return value !== 'false';
}

/**
 * Retorna as configurações ativas do Brevo (API Key, remetente, list ID e status).
 */
export async function getBrevoConfig(): Promise<BrevoConfig> {
  const dbSettings = await getAllSystemSettings();
  const apiKey =
    dbSettings['BREVO_API_KEY'] ||
    dbSettings['EMAIL_MARKETING_API_KEY'] ||
    process.env.BREVO_API_KEY ||
    process.env.EMAIL_MARKETING_API_KEY ||
    '';
  const senderEmail =
    dbSettings['BREVO_SENDER_EMAIL'] ||
    dbSettings['EMAIL_MARKETING_FROM_EMAIL'] ||
    process.env.BREVO_SENDER_EMAIL ||
    process.env.EMAIL_MARKETING_FROM_EMAIL ||
    'contato@duolife.com.br';
  const senderName =
    dbSettings['BREVO_SENDER_NAME'] ||
    dbSettings['EMAIL_MARKETING_FROM_NAME'] ||
    process.env.BREVO_SENDER_NAME ||
    process.env.EMAIL_MARKETING_FROM_NAME ||
    'DuoLife Hub';
  const listId =
    dbSettings['BREVO_LIST_ID'] ||
    dbSettings['EMAIL_MARKETING_LIST_ID'] ||
    process.env.BREVO_LIST_ID ||
    process.env.EMAIL_MARKETING_LIST_ID ||
    '';
  const webhookSecret =
    dbSettings['BREVO_WEBHOOK_SECRET'] ||
    dbSettings['EMAIL_MARKETING_WEBHOOK_SECRET'] ||
    process.env.BREVO_WEBHOOK_SECRET ||
    process.env.EMAIL_MARKETING_WEBHOOK_SECRET ||
    '';
  const rawEnabled =
    dbSettings['BREVO_INTEGRATION_ENABLED'] ||
    dbSettings['EMAIL_MARKETING_ENABLED'] ||
    process.env.BREVO_INTEGRATION_ENABLED ||
    process.env.EMAIL_MARKETING_ENABLED ||
    'true';
  const enabled = rawEnabled !== 'false';

  return {
    apiKey,
    senderEmail,
    senderName,
    listId,
    webhookSecret,
    enabled,
  };
}

export async function isBrevoIntegrationEnabled(): Promise<boolean> {
  const config = await getBrevoConfig();
  return config.enabled && !!config.apiKey;
}

/**
 * Retorna as configurações ativas da API de E-mail Marketing Net4Life Info.
 */
export async function getNet4LifeInfoConfig(): Promise<Net4LifeInfoConfig> {
  const dbSettings = await getAllSystemSettings();
  const apiUrl =
    dbSettings['NET4LIFE_INFO_API_URL'] ||
    process.env.NET4LIFE_INFO_API_URL ||
    'https://net4lifeinfo.com.br/email_marketing/v1';
  const apiToken =
    dbSettings['NET4LIFE_INFO_API_TOKEN'] ||
    process.env.NET4LIFE_INFO_API_TOKEN ||
    '';
  const senderEmail =
    dbSettings['NET4LIFE_INFO_SENDER_EMAIL'] ||
    process.env.NET4LIFE_INFO_SENDER_EMAIL ||
    'contato@duolife.com.br';
  const senderName =
    dbSettings['NET4LIFE_INFO_SENDER_NAME'] ||
    process.env.NET4LIFE_INFO_SENDER_NAME ||
    'DuoLife Hub';
  const replyTo =
    dbSettings['NET4LIFE_INFO_REPLY_TO'] ||
    process.env.NET4LIFE_INFO_REPLY_TO ||
    '';
  const smtpUser =
    dbSettings['NET4LIFE_INFO_SMTP_USER'] ||
    process.env.NET4LIFE_INFO_SMTP_USER ||
    '';
  const rawEnabled =
    dbSettings['NET4LIFE_INFO_ENABLED'] ||
    process.env.NET4LIFE_INFO_ENABLED ||
    'true';
  const enabled = rawEnabled !== 'false';

  return {
    apiUrl,
    apiToken,
    senderEmail,
    senderName,
    replyTo,
    smtpUser,
    enabled,
  };
}

export async function isNet4LifeInfoEnabled(): Promise<boolean> {
  const config = await getNet4LifeInfoConfig();
  return config.enabled && !!config.apiToken;
}


