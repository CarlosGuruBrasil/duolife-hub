import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export type ActionModule =
  | 'usuarios'
  | 'corretoras'
  | 'parceiros'
  | 'vendas'
  | 'cotacoes'
  | 'produtos'
  | 'chaves_api'
  | 'configuracoes'
  | 'portal'
  | 'seguranca'
  | (string & {});

export type ActionStatus = 'success' | 'failure' | 'warning';

export interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'changed' | 'removed';
}

export interface ActionAuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_role: string;
  ip_address: string | null;
  user_agent: string | null;
  action: string;
  module: ActionModule;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  description: string;
  old_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  diff: FieldDiff[] | null;
  status: ActionStatus;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string | Date;
}

export interface RecordActionAuditParams {
  userId?: string | null;
  userName: string;
  userEmail: string;
  userRole: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  module: ActionModule;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  description: string;
  oldState?: Record<string, any> | null;
  newState?: Record<string, any> | null;
  diff?: FieldDiff[] | null;
  status?: ActionStatus;
  errorMessage?: string | null;
  metadata?: Record<string, any>;
  req?: Request | Headers | any;
}

export interface ActionAuditFilterParams {
  module?: string;
  action?: string;
  userId?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// -----------------------------------------------------------------------------
// Mascaramento LGPD e Sanitização de Dados Sensíveis
// -----------------------------------------------------------------------------

function maskCpfOrCnpj(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length === 11) {
    return `***.${clean.slice(3, 6)}.***-${clean.slice(9, 11)}`;
  }
  if (clean.length === 14) {
    return `${clean.slice(0, 2)}.***.***/${clean.slice(8, 12)}-**`;
  }
  return '***';
}

function maskPhone(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length >= 10) {
    const ddd = clean.slice(0, 2);
    const last4 = clean.slice(-4);
    return `(${ddd}) *****-${last4}`;
  }
  return '(**) *****-****';
}

function maskEmail(value: string): string {
  const parts = value.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  const first = name.slice(0, 1);
  return `${first}***@${domain}`;
}

const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'senha',
  'token',
  'secret',
  'key',
  'apikey',
  'creditcard',
  'cartao',
  'cvv',
  'cvc',
  'pin',
  'auth',
  'authorization',
  'hash',
  'passwordhash',
  'private',
  'secretkey',
];

const CPF_CNPJ_KEYS = ['cpf', 'cnpj', 'cpfcnpj', 'documentnumber', 'clientcpfcnpj', 'documento', 'num_documento'];
const PHONE_KEYS = ['phone', 'celular', 'telefone', 'clientphone', 'whatsapp', 'tel'];
const EMAIL_KEYS = ['email', 'clientemail', 'useremail', 'destinatario'];

/**
 * Ofusca dados sensíveis para conformidade com a LGPD e boas práticas de segurança.
 */
export function redactSensitiveAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') {
    return data;
  }

  try {
    const copy = JSON.parse(JSON.stringify(data));

    function walk(node: Record<string, any>) {
      for (const key of Object.keys(node)) {
        const lower = key.toLowerCase();
        const val = node[key];

        if (typeof val === 'string') {
          if (CPF_CNPJ_KEYS.includes(lower)) {
            node[key] = maskCpfOrCnpj(val);
          } else if (PHONE_KEYS.includes(lower)) {
            node[key] = maskPhone(val);
          } else if (EMAIL_KEYS.includes(lower)) {
            node[key] = maskEmail(val);
          } else if (SENSITIVE_KEY_SUBSTRINGS.some((k) => lower.includes(k))) {
            node[key] = '[REDACTED]';
          } else if (lower.includes('pix') && val.length > 30) {
            node[key] = `${val.slice(0, 25)}...[TRUNCATED]`;
          }
        } else if (typeof val === 'object' && val !== null) {
          if (SENSITIVE_KEY_SUBSTRINGS.some((k) => lower.includes(k))) {
            node[key] = '[REDACTED]';
          } else {
            walk(val);
          }
        }
      }
    }

    walk(copy);
    return copy;
  } catch {
    return '[UNSERIALIZABLE]';
  }
}

// -----------------------------------------------------------------------------
// Cálculo de Diferenças Estruturadas (Diff)
// -----------------------------------------------------------------------------

function isPlainObject(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj) && !(obj instanceof Date);
}

/**
 * Compara dois objetos chave a chave (com suporte aninhado) e retorna a lista de diferenças estruturadas.
 */
export function calculateObjectDiff(
  oldObj: Record<string, any> | null | undefined,
  newObj: Record<string, any> | null | undefined,
  prefix = ''
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const oldSafe = oldObj && typeof oldObj === 'object' ? oldObj : null;
  const newSafe = newObj && typeof newObj === 'object' ? newObj : null;

  if (!oldSafe && !newSafe) return [];

  if (!oldSafe && newSafe) {
    for (const key of Object.keys(newSafe)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const newVal = redactSensitiveAuditData(newSafe[key]);
      diffs.push({
        field: fullKey,
        oldValue: null,
        newValue: newVal,
        type: 'added',
      });
    }
    return diffs;
  }

  if (oldSafe && !newSafe) {
    for (const key of Object.keys(oldSafe)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const oldVal = redactSensitiveAuditData(oldSafe[key]);
      diffs.push({
        field: fullKey,
        oldValue: oldVal,
        newValue: null,
        type: 'removed',
      });
    }
    return diffs;
  }

  const allKeys = Array.from(new Set([...Object.keys(oldSafe!), ...Object.keys(newSafe!)]));

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const hasOld = Object.prototype.hasOwnProperty.call(oldSafe!, key);
    const hasNew = Object.prototype.hasOwnProperty.call(newSafe!, key);

    const oldVal = oldSafe![key];
    const newVal = newSafe![key];

    if (hasOld && !hasNew) {
      diffs.push({
        field: fullKey,
        oldValue: redactSensitiveAuditData(oldVal),
        newValue: null,
        type: 'removed',
      });
    } else if (!hasOld && hasNew) {
      diffs.push({
        field: fullKey,
        oldValue: null,
        newValue: redactSensitiveAuditData(newVal),
        type: 'added',
      });
    } else {
      if (isPlainObject(oldVal) && isPlainObject(newVal)) {
        const nestedDiffs = calculateObjectDiff(oldVal, newVal, fullKey);
        diffs.push(...nestedDiffs);
      } else {
        const isSame =
          oldVal === newVal ||
          (oldVal instanceof Date && newVal instanceof Date && oldVal.getTime() === newVal.getTime()) ||
          (typeof oldVal === 'object' &&
            typeof newVal === 'object' &&
            JSON.stringify(oldVal) === JSON.stringify(newVal));

        if (!isSame) {
          diffs.push({
            field: fullKey,
            oldValue: redactSensitiveAuditData(oldVal),
            newValue: redactSensitiveAuditData(newVal),
            type: 'changed',
          });
        }
      }
    }
  }

  return diffs;
}

// -----------------------------------------------------------------------------
// Extração de Metadados do Cliente HTTP
// -----------------------------------------------------------------------------

/**
 * Extrai o IP real do cliente e o User-Agent a partir da requisição HTTP ou objeto Headers.
 */
export function extractClientInfo(req: Request | Headers | any): { ip: string | null; userAgent: string | null } {
  if (!req) {
    return { ip: null, userAgent: null };
  }

  const getHeader = (name: string): string | null => {
    try {
      if (typeof req.get === 'function') {
        return req.get(name) || null;
      }
      if (req.headers && typeof req.headers.get === 'function') {
        return req.headers.get(name) || null;
      }
      if (req.headers && typeof req.headers === 'object') {
        const lowerName = name.toLowerCase();
        const foundKey = Object.keys(req.headers).find((k) => k.toLowerCase() === lowerName);
        if (foundKey) {
          const val = req.headers[foundKey];
          return Array.isArray(val) ? val[0] : val || null;
        }
      }
      if (typeof req === 'object') {
        const lowerName = name.toLowerCase();
        const foundKey = Object.keys(req).find((k) => k.toLowerCase() === lowerName);
        if (foundKey) {
          const val = req[foundKey];
          return typeof val === 'string' ? val : null;
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const rawIp =
    getHeader('cf-connecting-ip') ||
    getHeader('x-real-ip') ||
    getHeader('x-forwarded-for') ||
    getHeader('true-client-ip') ||
    getHeader('x-client-ip') ||
    null;

  let ip: string | null = null;
  if (rawIp) {
    ip = rawIp.split(',')[0].trim();
  }

  const userAgent = getHeader('user-agent') || null;

  return { ip, userAgent };
}

// -----------------------------------------------------------------------------
// Gravação Resiliente de Logs de Auditoria
// -----------------------------------------------------------------------------

/**
 * Registra uma ação administrativa ou de negócio na tabela action_audit_logs.
 * Não lança exceções para evitar interrupções no fluxo de trabalho principal.
 */
export async function recordActionAudit(params: RecordActionAuditParams): Promise<void> {
  try {
    let clientIp = params.ipAddress || null;
    let clientUserAgent = params.userAgent || null;

    if (params.req && (!clientIp || !clientUserAgent)) {
      const extracted = extractClientInfo(params.req);
      if (!clientIp) clientIp = extracted.ip;
      if (!clientUserAgent) clientUserAgent = extracted.userAgent;
    }

    const oldStateRedacted = params.oldState ? (redactSensitiveAuditData(params.oldState) as Record<string, any>) : null;
    const newStateRedacted = params.newState ? (redactSensitiveAuditData(params.newState) as Record<string, any>) : null;

    let computedDiff = params.diff ?? null;
    if (!computedDiff && (params.oldState || params.newState)) {
      computedDiff = calculateObjectDiff(oldStateRedacted, newStateRedacted);
    }

    const metadataRedacted = params.metadata ? (redactSensitiveAuditData(params.metadata) as Record<string, any>) : {};

    const userName = params.userName || 'Sistema';
    const userEmail = params.userEmail || 'sistema@duolife.com.br';
    const userRole = params.userRole || 'system';
    const status = params.status || 'success';

    await sql`
      INSERT INTO action_audit_logs (
        user_id,
        user_name,
        user_email,
        user_role,
        ip_address,
        user_agent,
        action,
        module,
        target_type,
        target_id,
        target_name,
        description,
        old_state,
        new_state,
        diff,
        status,
        error_message,
        metadata,
        created_at
      )
      VALUES (
        ${params.userId || null},
        ${userName},
        ${userEmail},
        ${userRole},
        ${clientIp},
        ${clientUserAgent},
        ${params.action},
        ${params.module},
        ${params.targetType || null},
        ${params.targetId || null},
        ${params.targetName || null},
        ${params.description},
        ${oldStateRedacted ? JSON.stringify(oldStateRedacted) : null}::jsonb,
        ${newStateRedacted ? JSON.stringify(newStateRedacted) : null}::jsonb,
        ${computedDiff ? JSON.stringify(computedDiff) : null}::jsonb,
        ${status},
        ${params.errorMessage || null},
        ${JSON.stringify(metadataRedacted)}::jsonb,
        NOW()
      )
    `;
  } catch (err) {
    logger.warn(
      {
        err,
        action: params.action,
        module: params.module,
        targetType: params.targetType,
        targetId: params.targetId,
      },
      'action_audit.persist_failed_silent'
    );
  }
}

// -----------------------------------------------------------------------------
// Seed Inicial de Demonstração
// -----------------------------------------------------------------------------

/**
 * Insere registros de demonstração na tabela action_audit_logs caso a mesma esteja vazia.
 */
export async function seedInitialAuditLogsIfEmpty(): Promise<void> {
  try {
    const rows = await sql<{ count: string | number }[]>`
      SELECT COUNT(*)::int AS count FROM action_audit_logs LIMIT 1
    `;
    const count = Number(rows[0]?.count || 0);
    if (count > 0) {
      return;
    }

    const demoLogs: RecordActionAuditParams[] = [
      {
        userId: 'admin-seed-001',
        userName: 'Carlos Eduardo',
        userEmail: 'carlos@duolife.com.br',
        userRole: 'admin',
        ipAddress: '177.136.240.12',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        action: 'usuario.criar',
        module: 'usuarios',
        targetType: 'usuario',
        targetId: 'usr-corretor-001',
        targetName: 'Dr. Roberto Silveira (Parceiro)',
        description: 'Cadastrou o usuário parceiro especialista em RC Advogados',
        oldState: null,
        newState: {
          nome: 'Dr. Roberto Silveira',
          email: 'roberto@advocacia-silveira.com.br',
          role: 'partner',
          status: 'active',
          corretora_id: 'corr-duolife-001',
        },
        status: 'success',
        metadata: { canal: 'painel_administrativo' },
      },
      {
        userId: 'admin-seed-001',
        userName: 'Carlos Eduardo',
        userEmail: 'carlos@duolife.com.br',
        userRole: 'admin',
        ipAddress: '177.136.240.12',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        action: 'corretora.atualizar',
        module: 'corretoras',
        targetType: 'corretora',
        targetId: 'corr-duolife-001',
        targetName: 'DuoLife Corretora Matriz',
        description: 'Atualizou configurações financeiras e chave PIX da corretora matriz',
        oldState: {
          banco: '341',
          pix_tipo_chave: 'cnpj',
          status: 'active',
        },
        newState: {
          banco: '260',
          pix_tipo_chave: 'cnpj',
          status: 'active',
        },
        status: 'success',
        metadata: { canal: 'painel_administrativo' },
      },
      {
        userId: 'admin-seed-001',
        userName: 'Carlos Eduardo',
        userEmail: 'carlos@duolife.com.br',
        userRole: 'admin',
        ipAddress: '177.136.240.12',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        action: 'chave_api.criar',
        module: 'seguranca',
        targetType: 'chave_api',
        targetId: 'key-mcp-ai-001',
        targetName: 'Agente MCP Vendas WhatsApp',
        description: 'Gerou nova credencial de integração para assistente de IA com escopos de cotação e emissão',
        newState: {
          name: 'Agente MCP Vendas WhatsApp',
          scopes: ['insurance:quote', 'insurance:sale:create'],
          rate_limit: 120,
        },
        status: 'success',
        metadata: { scopes_granted: 2 },
      },
      {
        userId: null,
        userName: 'Sistema DuoLife (Webhook)',
        userEmail: 'sistema@duolife.com.br',
        userRole: 'system',
        ipAddress: '54.233.112.44',
        userAgent: 'Asaas-Webhook-Dispatcher/1.0',
        action: 'venda.alterar_status',
        module: 'vendas',
        targetType: 'venda',
        targetId: 'venda-rc-2026-0941',
        targetName: 'Apólice RC Advogados #DL-RC-ADV-8832',
        description: 'Confirmação de liquidação financeira via Asaas e emissão de apólice na Akad',
        oldState: {
          status: 'waiting_payment',
          payment_status: 'PENDING',
        },
        newState: {
          status: 'policy_issued',
          payment_status: 'RECEIVED',
          policy_number: 'AKAD-RC-883201',
        },
        status: 'success',
        metadata: { gateway: 'asaas', charge_id: 'pay_9823482347' },
      },
      {
        userId: null,
        userName: 'Sistema DuoLife (Cron)',
        userEmail: 'sistema@duolife.com.br',
        userRole: 'system',
        ipAddress: '127.0.0.1',
        userAgent: 'DuoLife-Lifecycle-Worker/2.0',
        action: 'cotacao.cancelar',
        module: 'cotacoes',
        targetType: 'cotacao',
        targetId: 'cot-rc-med-1082',
        targetName: 'Cotação RC Médicos (Dra. Camila)',
        description: 'Cotação expirada automaticamente após 15 dias sem conclusão da proposta',
        oldState: {
          status: 'pending',
          valid_until: '2026-03-29T23:59:59Z',
        },
        newState: {
          status: 'cancelled',
          cancel_reason: 'expired_validity',
        },
        status: 'warning',
        metadata: { rotina: 'lifecycle_cleanup' },
      },
    ];

    for (const log of demoLogs) {
      await recordActionAudit(log);
    }

    logger.info({ count: demoLogs.length }, 'action_audit.seeded_initial_logs');
  } catch (err) {
    logger.warn({ err }, 'action_audit.seed_failed_silent');
  }
}

// -----------------------------------------------------------------------------
// Consultas e Listagem com Filtros e Paginação
// -----------------------------------------------------------------------------

/**
 * Retorna lista paginada de logs de auditoria com suporte a múltiplos filtros.
 */
export async function getActionAuditLogs(
  filters: ActionAuditFilterParams = {}
): Promise<{ logs: ActionAuditLog[]; total: number }> {
  try {
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 2000);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    let queryConditions = sql`WHERE 1=1`;

    if (filters.module && filters.module !== 'all') {
      queryConditions = sql`${queryConditions} AND module = ${filters.module}`;
    }

    if (filters.action) {
      queryConditions = sql`${queryConditions} AND action = ${filters.action}`;
    }

    if (filters.userId) {
      queryConditions = sql`${queryConditions} AND user_id = ${filters.userId}`;
    }

    if (filters.targetType) {
      queryConditions = sql`${queryConditions} AND target_type = ${filters.targetType}`;
    }

    if (filters.targetId) {
      queryConditions = sql`${queryConditions} AND target_id = ${filters.targetId}`;
    }

    if (filters.status && filters.status !== 'all') {
      queryConditions = sql`${queryConditions} AND status = ${filters.status}`;
    }

    if (filters.startDate) {
      queryConditions = sql`${queryConditions} AND created_at >= ${filters.startDate}::timestamptz`;
    }

    if (filters.endDate) {
      queryConditions = sql`${queryConditions} AND created_at <= ${filters.endDate}::timestamptz`;
    }

    if (filters.search && filters.search.trim().length > 0) {
      const searchTerm = `%${filters.search.trim()}%`;
      queryConditions = sql`${queryConditions} AND (
        user_name ILIKE ${searchTerm} OR
        user_email ILIKE ${searchTerm} OR
        description ILIKE ${searchTerm} OR
        target_name ILIKE ${searchTerm} OR
        action ILIKE ${searchTerm}
      )`;
    }

    const [countResult] = await sql<{ count: string | number }[]>`
      SELECT COUNT(*)::int AS count
      FROM action_audit_logs
      ${queryConditions}
    `;

    const total = Number(countResult?.count || 0);

    const logs = await sql<ActionAuditLog[]>`
      SELECT
        id,
        user_id,
        user_name,
        user_email,
        user_role,
        ip_address,
        user_agent,
        action,
        module,
        target_type,
        target_id,
        target_name,
        description,
        old_state,
        new_state,
        diff,
        status,
        error_message,
        metadata,
        created_at
      FROM action_audit_logs
      ${queryConditions}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { logs, total };
  } catch (err) {
    logger.error({ err, filters }, 'action_audit.get_logs_failed');
    return { logs: [], total: 0 };
  }
}

/**
 * Busca um registro específico de auditoria pelo ID.
 */
export async function getActionAuditLogById(id: string): Promise<ActionAuditLog | null> {
  try {
    const [log] = await sql<ActionAuditLog[]>`
      SELECT
        id,
        user_id,
        user_name,
        user_email,
        user_role,
        ip_address,
        user_agent,
        action,
        module,
        target_type,
        target_id,
        target_name,
        description,
        old_state,
        new_state,
        diff,
        status,
        error_message,
        metadata,
        created_at
      FROM action_audit_logs
      WHERE id = ${id}
      LIMIT 1
    `;
    return log || null;
  } catch (err) {
    logger.error({ err, id }, 'action_audit.get_log_by_id_failed');
    return null;
  }
}

/**
 * Retorna estatísticas de auditoria das últimas 24 horas.
 */
export async function getActionAuditStats(): Promise<{
  total24h: number;
  totalErrors24h: number;
  totalWarnings24h: number;
  activeUsers24h: number;
}> {
  try {
    const [stats] = await sql<
      {
        total_24h: string | number;
        total_errors_24h: string | number;
        total_warnings_24h: string | number;
        active_users_24h: string | number;
      }[]
    >`
      SELECT
        COUNT(*)::int AS total_24h,
        COUNT(CASE WHEN status = 'failure' THEN 1 END)::int AS total_errors_24h,
        COUNT(CASE WHEN status = 'warning' THEN 1 END)::int AS total_warnings_24h,
        COUNT(DISTINCT user_email)::int AS active_users_24h
      FROM action_audit_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `;

    return {
      total24h: Number(stats?.total_24h || 0),
      totalErrors24h: Number(stats?.total_errors_24h || 0),
      totalWarnings24h: Number(stats?.total_warnings_24h || 0),
      activeUsers24h: Number(stats?.active_users_24h || 0),
    };
  } catch (err) {
    logger.error({ err }, 'action_audit.get_stats_failed');
    return {
      total24h: 0,
      totalErrors24h: 0,
      totalWarnings24h: 0,
      activeUsers24h: 0,
    };
  }
}

export const listActionAuditLogs = getActionAuditLogs;
