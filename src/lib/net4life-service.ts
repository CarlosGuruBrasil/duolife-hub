import https from 'node:https';
import { sql } from './pg';
import { logger } from './logger';
import { getNet4LifeInfoConfig, type Net4LifeInfoConfig } from './system-settings';
import type { EmailTemplate } from './email-service';

export interface Net4LifeSendEmailOptions {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  templateId?: string | null;
}

export interface Net4LifeSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface Net4LifeTemplatePayload {
  externalId?: string | null;
  name: string;
  subject: string;
  bodyHtml: string;
  variables?: string[];
}

export interface Net4LifeSyncResult {
  success: boolean;
  total: number;
  synced: number;
  errors: string[];
}

/**
 * Normaliza a URL da API para o host backend real.
 * O domínio net4lifeinfo.com.br hospeda a SPA estática; o backend de API fica em api.duo24horas.com.br.
 */
export function normalizeNet4LifeApiUrl(rawUrl?: string): string {
  const defaultUrl = 'https://api.duo24horas.com.br/email_marketing/v1';
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return defaultUrl;
  }

  let cleaned = rawUrl.trim().replace(/\/+$/, '');

  // Se o operador informou a URL da landing page ou doc do net4lifeinfo, redireciona para a API real
  if (cleaned.includes('net4lifeinfo.com.br')) {
    cleaned = cleaned.replace(/https?:\/\/(?:app\.|www\.)?net4lifeinfo\.com\.br(?:\/doc)?/i, 'https://api.duo24horas.com.br');
  }

  if (!cleaned.includes('/email_marketing/v1')) {
    cleaned = `${cleaned}/email_marketing/v1`;
  }

  return cleaned;
}

/**
 * Executa requisição HTTP segura contra a API Net4Life Info / FluxoSend.
 * Contorna incompatibilidade de CA intermediária e cabeçalhos sensíveis do Mod_Security.
 */
async function callNet4LifeApi<T = any>(
  endpointPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  bodyData?: Record<string, any>,
  customConfig?: Net4LifeInfoConfig
): Promise<{ status: number; data: T }> {
  const config = customConfig || (await getNet4LifeInfoConfig());
  const baseUrl = normalizeNet4LifeApiUrl(config.apiUrl);
  const parsed = new URL(baseUrl);

  // Monta o caminho completo relativo (ex: /email_marketing/v1/enviaremail)
  let basePath = parsed.pathname.replace(/\/+$/, '');
  let fullPath = `${basePath}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;

  const token = config.apiToken.trim();
  const serializedBody = bodyData ? JSON.stringify(bodyData) : '';
  const bodyBuffer = bodyData ? Buffer.from(serializedBody, 'utf-8') : null;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'DuoLife-Hub/1.0 (curl/8.4.0)',
      'Authorization': `Bearer ${token}`,
    };

    if (bodyBuffer) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = bodyBuffer.length;
    }

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: fullPath,
        method,
        rejectUnauthorized: false, // O servidor web do Net4Life Info não emite o certificado intermediário completo
        headers,
        timeout: 15000,
      },
      (res) => {
        let rawResponse = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          rawResponse += chunk;
        });
        res.on('end', () => {
          try {
            const parsedJson = rawResponse ? JSON.parse(rawResponse) : {};
            resolve({
              status: res.statusCode || 200,
              data: parsedJson as T,
            });
          } catch {
            // Caso o servidor retorne texto ou HTML de erro
            resolve({
              status: res.statusCode || 500,
              data: { raw: rawResponse, msg: rawResponse.slice(0, 300) } as any,
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite esgotado ao comunicar com a API de E-mail Marketing (15s).'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

/**
 * Dispara e-mail transacional ou em lote usando a API Net4Life Info (/enviaremail).
 */
export async function sendEmailViaNet4Life(
  options: Net4LifeSendEmailOptions
): Promise<Net4LifeSendResult> {
  try {
    const config = await getNet4LifeInfoConfig();
    if (!config.apiToken) {
      return { success: false, error: 'Token de API Net4Life Info não configurado.' };
    }

    const payload: Record<string, any> = {
      destinatarios: [
        {
          email: options.to,
          nome: options.toName || options.to.split('@')[0],
        },
      ],
      assunto: options.subject,
      corpo: options.html,
    };

    if (options.templateId) {
      payload.template_id = options.templateId;
    }

    if (config.senderEmail) {
      payload.remetente_email = config.senderEmail;
    }
    if (config.senderName) {
      payload.remetente_nome = config.senderName;
    }
    if (config.replyTo) {
      payload.reply_to = config.replyTo;
    }
    if (config.smtpUser) {
      payload.smtp_user = config.smtpUser;
    }

    const res = await callNet4LifeApi('/enviaremail', 'POST', payload, config);

    if (res.status >= 200 && res.status < 300) {
      const data: any = res.data;
      if (data.sucesso === false || data.success === false) {
        return {
          success: false,
          error: data.msg || data.mensagem || data.erro || 'Falha no processamento pelo servidor de e-mail marketing.',
        };
      }
      return {
        success: true,
        messageId: data.id || data.envio_id || `em_${Date.now()}`,
      };
    }

    const errData: any = res.data;
    const msg =
      errData.msg ||
      errData.mensagem ||
      errData.error ||
      (res.status === 401 ? 'Token de acesso Net4Life Info inválido ou inativo (HTTP 401).' : `Erro HTTP ${res.status}`);

    logger.error({ status: res.status, errData, to: options.to }, 'net4life.send_email.failed');
    return { success: false, error: msg };
  } catch (err: any) {
    logger.error({ err, to: options.to }, 'net4life.send_email.exception');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Cria ou atualiza um template de e-mail na API do Net4Life Info (/templates).
 */
export async function pushTemplateToNet4Life(
  template: Net4LifeTemplatePayload
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const config = await getNet4LifeInfoConfig();
    if (!config.apiToken) {
      return { success: false, error: 'Token Net4Life Info não cadastrado.' };
    }

    const payload: Record<string, any> = {
      nome: template.name,
      assunto: template.subject,
      conteudo_html: template.bodyHtml,
      variaveis: template.variables || [],
    };

    if (template.externalId) {
      payload.id = template.externalId;
    }

    const res = await callNet4LifeApi('/templates', 'POST', payload, config);

    if (res.status >= 200 && res.status < 300) {
      const data: any = res.data;
      const externalId = data.id || data.template_id || (data.template && data.template.id) || template.externalId;
      return { success: true, externalId };
    }

    const errData: any = res.data;
    const error = errData.msg || errData.mensagem || errData.error || `HTTP ${res.status}`;
    return { success: false, error };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao sincronizar template com Net4Life Info.' };
  }
}

/**
 * Remove um template da API Net4Life Info.
 */
export async function deleteTemplateFromNet4Life(externalId: string): Promise<boolean> {
  if (!externalId) return false;
  try {
    const res = await callNet4LifeApi(`/templates?id=${encodeURIComponent(externalId)}`, 'DELETE');
    return res.status >= 200 && res.status < 300;
  } catch (err) {
    logger.warn({ err, externalId }, 'net4life.delete_template.failed');
    return false;
  }
}

/**
 * Lista todos os templates cadastrados no Net4Life Info.
 */
export async function fetchNet4LifeTemplates(): Promise<{
  success: boolean;
  templates?: any[];
  error?: string;
}> {
  try {
    const res = await callNet4LifeApi('/templates', 'GET');
    if (res.status >= 200 && res.status < 300) {
      const data: any = res.data;
      const list = Array.isArray(data) ? data : data.templates || data.data || [];
      return { success: true, templates: list };
    }
    const errData: any = res.data;
    return {
      success: false,
      error: errData.msg || errData.mensagem || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao consultar templates no Net4Life Info' };
  }
}

/**
 * Testa a conexão e autenticação com o servidor Net4Life Info.
 */
export async function testNet4LifeConnection(
  customConfig?: Net4LifeInfoConfig
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const res = await callNet4LifeApi('/templates', 'GET', undefined, customConfig);
    const latencyMs = Date.now() - start;

    if (res.status === 200) {
      return {
        success: true,
        message: 'Conexão estabelecida com sucesso com a API Net4Life Info / FluxoSend!',
        latencyMs,
      };
    }

    const errData: any = res.data;
    const msg = errData.msg || errData.mensagem || (res.status === 401 ? 'Token de aplicação inválido ou inativo.' : `HTTP ${res.status}`);
    return {
      success: false,
      message: `Falha na autenticação: ${msg}`,
      latencyMs,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Falha de conexão: ${err?.message || 'Servidor inacessível'}`,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Sincroniza todos os templates locais do DuoLife Hub com o Net4Life Info.
 */
export async function syncAllTemplatesWithNet4Life(): Promise<Net4LifeSyncResult> {
  const config = await getNet4LifeInfoConfig();
  if (!config.enabled || !config.apiToken) {
    return {
      success: false,
      total: 0,
      synced: 0,
      errors: ['A integração com Net4Life Info está desativada ou sem token configurado.'],
    };
  }

  // 1. Busca todos os templates do banco local
  const localTemplates = await sql<EmailTemplate[]>`
    SELECT id, code, name, subject, body_html, variables, external_id, last_synced_at
    FROM email_templates
    WHERE is_active = true
    ORDER BY name ASC
  `;

  let synced = 0;
  const errors: string[] = [];

  for (const tpl of localTemplates) {
    try {
      const pushResult = await pushTemplateToNet4Life({
        externalId: tpl.external_id,
        name: tpl.name,
        subject: tpl.subject,
        bodyHtml: tpl.body_html,
        variables: tpl.variables,
      });

      if (pushResult.success && pushResult.externalId) {
        await sql`
          UPDATE email_templates
          SET
            external_id = ${pushResult.externalId},
            last_synced_at = NOW()
          WHERE id = ${tpl.id}
        `;
        synced++;
      } else {
        errors.push(`Template "${tpl.name}" (${tpl.code}): ${pushResult.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      errors.push(`Template "${tpl.name}": ${err?.message || 'Exceção ao sincronizar'}`);
    }
  }

  return {
    success: errors.length === 0,
    total: localTemplates.length,
    synced,
    errors,
  };
}
