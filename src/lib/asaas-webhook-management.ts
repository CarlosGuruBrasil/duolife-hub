import { getAsaasConfig } from './system-settings';
import { logger } from './logger';

export interface AsaasWebhookItem {
  id?: string;
  name?: string;
  url: string;
  email?: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion?: number;
  events?: string[];
  hasAuthToken?: boolean;
}

export interface AsaasWebhookQueueStatusResult {
  ok: boolean;
  hasApiKey: boolean;
  isSandbox: boolean;
  isInterrupted: boolean;
  webhooks: AsaasWebhookItem[];
  message?: string;
  error?: string;
}

export interface ReactivateWebhookResult {
  ok: boolean;
  reactivatedCount: number;
  isInterrupted: boolean;
  webhooks: AsaasWebhookItem[];
  message: string;
  error?: string;
}

/**
 * Consulta a API do Asaas e retorna o estado atual da(s) fila(s) de webhook cadastrada(s).
 * Identifica se a fila está ativa ou se foi interrompida (interrupted: true) por falhas consecutivas.
 */
export async function getAsaasWebhookQueueStatus(): Promise<AsaasWebhookQueueStatusResult> {
  const asaasCfg = await getAsaasConfig();

  if (!asaasCfg.apiKey) {
    return {
      ok: false,
      hasApiKey: false,
      isSandbox: asaasCfg.isSandbox,
      isInterrupted: false,
      webhooks: [],
      error: 'Chave de API do Asaas (ASAAS_API_KEY) não configurada no DuoLife Hub.',
    };
  }

  const baseUrl = asaasCfg.baseUrl;
  const webhooks: AsaasWebhookItem[] = [];

  try {
    // 1. Tenta listar filas múltiplas (API v3 padrão /webhooks)
    try {
      const resList = await fetch(`${baseUrl}/webhooks`, {
        method: 'GET',
        headers: {
          access_token: asaasCfg.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'DuoLife-Hub/1.0',
        },
      });

      if (resList.ok) {
        const body = await resList.json().catch(() => ({}));
        const data = Array.isArray(body?.data) ? body.data : [];
        for (const item of data) {
          webhooks.push({
            id: item.id ? String(item.id) : undefined,
            name: item.name || undefined,
            url: item.url || '',
            email: item.email || undefined,
            enabled: Boolean(item.enabled),
            interrupted: Boolean(item.interrupted),
            apiVersion: item.apiVersion ? Number(item.apiVersion) : undefined,
            events: Array.isArray(item.events) ? item.events : undefined,
            hasAuthToken: Boolean(item.hasAuthToken || item.authToken),
          });
        }
      }
    } catch (listErr) {
      logger.warn({ listErr }, 'asaas.webhook_management.list_multiple_failed');
    }

    // 2. Se a lista estiver vazia, tenta consultar a fila padrão única (/webhook)
    if (webhooks.length === 0) {
      try {
        const resSingle = await fetch(`${baseUrl}/webhook`, {
          method: 'GET',
          headers: {
            access_token: asaasCfg.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'DuoLife-Hub/1.0',
          },
        });

        if (resSingle.ok) {
          const item = await resSingle.json().catch(() => ({}));
          if (item && item.url) {
            webhooks.push({
              id: item.id ? String(item.id) : undefined,
              name: item.name || 'Fila Padrão',
              url: item.url,
              email: item.email || undefined,
              enabled: Boolean(item.enabled),
              interrupted: Boolean(item.interrupted),
              apiVersion: item.apiVersion ? Number(item.apiVersion) : undefined,
              events: Array.isArray(item.events) ? item.events : undefined,
              hasAuthToken: Boolean(item.hasAuthToken || item.authToken),
            });
          }
        }
      } catch (singleErr) {
        logger.warn({ singleErr }, 'asaas.webhook_management.get_single_failed');
      }
    }

    const isInterrupted = webhooks.some((w) => w.interrupted);

    return {
      ok: true,
      hasApiKey: true,
      isSandbox: asaasCfg.isSandbox,
      isInterrupted,
      webhooks,
      message: isInterrupted
        ? 'Atenção: A fila de webhooks do Asaas está INTERROMPIDA devido a falhas consecutivas anteriores.'
        : webhooks.length > 0
        ? 'Fila de webhooks do Asaas ativa e operando normalmente.'
        : 'Nenhuma fila de webhook encontrada cadastrada na conta Asaas.',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Falha na comunicação com a API do Asaas';
    logger.error({ err }, 'asaas.webhook_management.status_failed');
    return {
      ok: false,
      hasApiKey: true,
      isSandbox: asaasCfg.isSandbox,
      isInterrupted: false,
      webhooks: [],
      error: errorMsg,
    };
  }
}

/**
 * Reativa a fila de webhooks no Asaas enviando { interrupted: false, enabled: true }.
 * Pode reativar uma fila específica por webhookId ou varrer todas as filas interrompidas.
 */
export async function reactivateAsaasWebhookQueue(targetWebhookId?: string): Promise<ReactivateWebhookResult> {
  const asaasCfg = await getAsaasConfig();

  if (!asaasCfg.apiKey) {
    return {
      ok: false,
      reactivatedCount: 0,
      isInterrupted: false,
      webhooks: [],
      message: 'Falha ao reativar: Chave de API do Asaas não configurada.',
      error: 'ASAAS_API_KEY_MISSING',
    };
  }

  const baseUrl = asaasCfg.baseUrl;
  let reactivatedCount = 0;
  const errors: string[] = [];

  // Se foi passado um ID específico
  if (targetWebhookId) {
    try {
      const res = await fetch(`${baseUrl}/webhooks/${targetWebhookId}`, {
        method: 'PUT',
        headers: {
          access_token: asaasCfg.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'DuoLife-Hub/1.0',
        },
        body: JSON.stringify({
          interrupted: false,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        errors.push(`Falha ao reativar webhook ${targetWebhookId}: HTTP ${res.status} ${text}`);
      } else {
        reactivatedCount++;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Erro na requisição');
    }
  } else {
    // Caso padrão: consulta status atual e reativa todas as filas que estiverem com interrupted: true
    const currentStatus = await getAsaasWebhookQueueStatus();

    if (currentStatus.webhooks.length > 0) {
      for (const wh of currentStatus.webhooks) {
        if (wh.id) {
          try {
            const res = await fetch(`${baseUrl}/webhooks/${wh.id}`, {
              method: 'PUT',
              headers: {
                access_token: asaasCfg.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'DuoLife-Hub/1.0',
              },
              body: JSON.stringify({
                interrupted: false,
                enabled: true,
              }),
            });

            if (res.ok) {
              reactivatedCount++;
            } else {
              const text = await res.text().catch(() => '');
              errors.push(`Erro webhook ${wh.id}: HTTP ${res.status} ${text}`);
            }
          } catch (err) {
            errors.push(err instanceof Error ? err.message : 'Erro na requisição');
          }
        }
      }
    }

    // Tenta também reativar no endpoint de webhook único /webhook (para contas em layout legado)
    try {
      const resSingle = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          access_token: asaasCfg.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'DuoLife-Hub/1.0',
        },
        body: JSON.stringify({
          interrupted: false,
          enabled: true,
        }),
      });

      if (resSingle.ok) {
        reactivatedCount++;
      }
    } catch (singleErr) {
      // Ignora falha de fallback de webhook único se já processou filas múltiplas
      logger.warn({ singleErr }, 'asaas.webhook_management.single_reactivate_fallback');
    }
  }

  // Consulta novamente o status para confirmar a desinterrupção
  const updatedStatus = await getAsaasWebhookQueueStatus();

  const success = reactivatedCount > 0 || !updatedStatus.isInterrupted;

  const result: ReactivateWebhookResult = {
    ok: success,
    reactivatedCount,
    isInterrupted: updatedStatus.isInterrupted,
    webhooks: updatedStatus.webhooks,
    message: success
      ? 'Fila de webhooks do Asaas desinterrompida com sucesso! O Asaas voltará a despachar os eventos normalmente.'
      : `Não foi possível desinterromper a fila do Asaas. ${errors.join('; ')}`,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };

  logger.info(
    {
      reactivatedCount,
      isInterrupted: updatedStatus.isInterrupted,
      success,
    },
    'asaas.webhook_management.reactivate_executed'
  );

  return result;
}
