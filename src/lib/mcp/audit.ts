import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { redactSensitiveData } from './security';
import { McpErrorCode } from './types';

export interface RecordMcpAuditParams {
  requestId: string;
  clientId?: string | null;
  tool: string;
  saleSessionId?: string | null;
  resultStatus: 'success' | 'error' | 'rejected';
  errorCode?: McpErrorCode | string | null;
  durationMs: number;
  inputRaw: unknown;
  outputRaw: unknown;
}

/**
 * Persiste um registro de auditoria na tabela mcp_audit_logs com mascaramento prévio
 * de dados pessoais (LGPD) e tolerância a falhas sem bloquear o fluxo principal.
 */
export async function recordMcpAuditLog(params: RecordMcpAuditParams): Promise<void> {
  const inputRedacted = redactSensitiveData(params.inputRaw);
  const outputRedacted = redactSensitiveData(params.outputRaw);

  try {
    await sql`
      INSERT INTO mcp_audit_logs (
        request_id,
        client_id,
        tool,
        sale_session_id,
        result_status,
        error_code,
        duration_ms,
        input_redacted,
        output_redacted,
        created_at
      )
      VALUES (
        ${params.requestId},
        ${params.clientId || null},
        ${params.tool},
        ${params.saleSessionId || null},
        ${params.resultStatus},
        ${params.errorCode || null},
        ${params.durationMs},
        ${JSON.stringify(inputRedacted)}::jsonb,
        ${JSON.stringify(outputRedacted)}::jsonb,
        NOW()
      )
    `;
  } catch (err) {
    logger.warn(
      {
        err,
        requestId: params.requestId,
        tool: params.tool,
      },
      'mcp.audit.persist_failed_silent'
    );
  }
}
