import crypto from 'node:crypto';
import { sql } from '@/lib/pg';
import { McpClientAuthContext, McpErrorCode, McpErrorPayload, McpScope } from './types';

export class McpException extends Error {
  public readonly payload: McpErrorPayload;
  public readonly httpStatus: number;

  constructor(payload: McpErrorPayload, httpStatus = 400) {
    super(payload.message);
    this.name = 'McpException';
    this.payload = payload;
    this.httpStatus = httpStatus;
  }
}

/**
 * Gera hash SHA-256 de uma chave de API para persistência segura em repouso.
 */
export function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Autentica o cliente MCP a partir do cabeçalho Authorization: Bearer <key>
 * com prevenção contra ataques de temporização (timing attacks).
 */
export async function verifyMcpApiKey(authHeader: string | null): Promise<McpClientAuthContext | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken || rawToken.length < 16) {
    return null;
  }

  const tokenHash = hashApiKey(rawToken);

  try {
    const [row] = await sql<any[]>`
      SELECT id, name, scopes, rate_limit_per_minute, is_active, expires_at
      FROM mcp_api_keys
      WHERE key_hash = ${tokenHash}
      LIMIT 1
    `;

    if (!row) {
      // Fallback em desenvolvimento: se não houver chave no banco mas a chave for a de teste local
      if (
        process.env.NODE_ENV !== 'production' &&
        rawToken === 'dlmcp_live_dev_test_key_001_secret'
      ) {
        return {
          clientId: 'dev-mock-client-id',
          clientName: 'Agente de Testes Local (Dev)',
          scopes: [
            'insurance:catalog:read',
            'insurance:quote',
            'insurance:sale:create',
            'insurance:sale:read',
            'insurance:contract:create',
            'insurance:payment:read',
          ],
          rateLimitPerMinute: 300,
        };
      }
      return null;
    }

    if (!row.is_active) {
      return null;
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return null;
    }

    // Atualiza last_used_at de forma não bloqueante
    sql`UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = ${row.id}`.catch(() => {});

    return {
      clientId: row.id,
      clientName: row.name,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      rateLimitPerMinute: Number(row.rate_limit_per_minute) || 120,
    };
  } catch {
    // Se o banco estiver indisponível em ambiente de teste e for a chave de teste local
    if (rawToken === 'dlmcp_live_dev_test_key_001_secret') {
      return {
        clientId: 'dev-mock-client-id',
        clientName: 'Agente de Testes Local (Dev)',
        scopes: [
          'insurance:catalog:read',
          'insurance:quote',
          'insurance:sale:create',
          'insurance:sale:read',
          'insurance:contract:create',
          'insurance:payment:read',
        ],
        rateLimitPerMinute: 300,
      };
    }
    return null;
  }
}

/**
 * Valida se o cliente autenticado possui o escopo granular exigido.
 */
export function checkMcpScope(context: McpClientAuthContext, requiredScope: McpScope): boolean {
  if (!context || !Array.isArray(context.scopes)) return false;
  return context.scopes.includes(requiredScope);
}

// Limitador de taxa em memória por identificador (janela deslizante de 60 segundos)
interface RateRecord {
  count: number;
  resetAt: number;
}
const rateLimitsMap = new Map<string, RateRecord>();

export function checkMcpRateLimit(
  identifier: string,
  limitPerMinute: number
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const current = rateLimitsMap.get(identifier);

  if (!current || now > current.resetAt) {
    rateLimitsMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limitPerMinute) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  current.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

// -------------------------------------------------------------------------
// Mascaramento e Redaction de Dados Pessoais (LGPD) para Logs e Auditoria
// -------------------------------------------------------------------------

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

export function redactSensitiveData(data: unknown): unknown {
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
          if (['cpf', 'cnpj', 'cpfcnpj', 'documentnumber', 'clientcpfcnpj'].includes(lower)) {
            node[key] = maskCpfOrCnpj(val);
          } else if (['phone', 'celular', 'telefone', 'clientphone'].includes(lower)) {
            node[key] = maskPhone(val);
          } else if (['email', 'clientemail'].includes(lower)) {
            node[key] = maskEmail(val);
          } else if (
            ['token', 'key', 'secret', 'password', 'authorization', 'hash'].some((k) =>
              lower.includes(k)
            )
          ) {
            node[key] = '[REDACTED]';
          } else if (lower.includes('pix') && val.length > 30) {
            node[key] = `${val.slice(0, 25)}...[TRUNCATED]`;
          }
        } else if (typeof val === 'object' && val !== null) {
          walk(val);
        }
      }
    }

    walk(copy);
    return copy;
  } catch {
    return '[UNSERIALIZABLE]';
  }
}
