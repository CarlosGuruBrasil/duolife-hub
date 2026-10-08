import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { hashApiKey } from '@/lib/mcp/security';
import { McpScope } from '@/lib/mcp/types';
import { logger } from '@/lib/logger';

const DEFAULT_MCP_SCOPES: McpScope[] = [
  'insurance:catalog:read',
  'insurance:quote',
  'insurance:sale:create',
  'insurance:sale:read',
  'insurance:contract:create',
  'insurance:payment:read',
];

/**
 * GET /api/admin/mcp/keys
 * Lista todas as chaves de API MCP cadastradas e estatísticas de uso.
 */
export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const keys = await sql<any[]>`
      SELECT
        id,
        name,
        key_prefix,
        scopes,
        rate_limit_per_minute,
        is_active,
        expires_at,
        last_used_at,
        created_at
      FROM mcp_api_keys
      ORDER BY created_at DESC
    `;

    // Estatísticas de auditoria
    const [stats] = await sql<any[]>`
      SELECT
        COUNT(*)::int AS total_requests,
        COUNT(CASE WHEN result_status = 'success' THEN 1 END)::int AS success_requests,
        COUNT(CASE WHEN result_status = 'rejected' THEN 1 END)::int AS rejected_requests
      FROM mcp_audit_logs
    `.catch(() => [{ total_requests: 0, success_requests: 0, rejected_requests: 0 }]);

    return Response.json({
      ok: true,
      keys: keys || [],
      stats: {
        totalKeys: keys.length,
        activeKeys: keys.filter((k) => k.is_active).length,
        totalRequests: stats?.total_requests || 0,
        successRequests: stats?.success_requests || 0,
        rejectedRequests: stats?.rejected_requests || 0,
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.mcp.keys.get_failed');
    return Response.json(
      { error: 'Falha ao consultar chaves MCP no banco de dados.', details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mcp/keys
 * Gera e cadastra uma nova chave de API para o protocolo MCP.
 */
export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();

    if (!name || name.length < 3) {
      return Response.json(
        { error: 'Informe um nome descritivo para a chave (mínimo 3 caracteres).' },
        { status: 400 }
      );
    }

    const scopes: string[] =
      Array.isArray(body.scopes) && body.scopes.length > 0
        ? body.scopes
        : DEFAULT_MCP_SCOPES;

    const rateLimit = Math.max(10, Math.min(1000, Number(body.rateLimitPerMinute) || 300));

    // Gera token criptográfico de alta entropia
    const randomSecret = crypto.randomBytes(24).toString('hex');
    const fullToken = `dlmcp_live_${randomSecret}`;
    const tokenHash = hashApiKey(fullToken);
    const keyPrefix = fullToken.slice(0, 16);

    const [newKey] = await sql<any[]>`
      INSERT INTO mcp_api_keys (
        name,
        key_prefix,
        key_hash,
        scopes,
        rate_limit_per_minute,
        is_active,
        created_at
      )
      VALUES (
        ${name},
        ${keyPrefix},
        ${tokenHash},
        ${scopes},
        ${rateLimit},
        true,
        NOW()
      )
      RETURNING
        id,
        name,
        key_prefix,
        scopes,
        rate_limit_per_minute,
        is_active,
        created_at
    `;

    logger.info(
      { keyId: newKey.id, name: newKey.name, userEmail: user.email },
      'api.admin.mcp.keys.generated'
    );

    return Response.json({
      ok: true,
      key: newKey,
      rawToken: fullToken,
      message: 'Chave de acesso MCP gerada com sucesso! Guarde-a em local seguro.',
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.mcp.keys.post_failed');
    return Response.json(
      { error: 'Erro ao gerar nova chave de API MCP.', details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/mcp/keys
 * Alterna status (ativo/inativo) ou remove uma chave MCP.
 */
export async function PATCH(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id, isActive } = body;

    if (!id) {
      return Response.json({ error: 'ID da chave não fornecido.' }, { status: 400 });
    }

    const [updated] = await sql<any[]>`
      UPDATE mcp_api_keys
      SET is_active = ${Boolean(isActive)}
      WHERE id = ${id}
      RETURNING id, name, is_active
    `;

    if (!updated) {
      return Response.json({ error: 'Chave não encontrada.' }, { status: 404 });
    }

    logger.info(
      { keyId: id, isActive, userEmail: user.email },
      'api.admin.mcp.keys.status_updated'
    );

    return Response.json({
      ok: true,
      key: updated,
      message: `Chave ${updated.name} ${updated.is_active ? 'ativada' : 'revogada'} com sucesso.`,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.mcp.keys.patch_failed');
    return Response.json(
      { error: 'Falha ao atualizar status da chave.', details: err?.message },
      { status: 500 }
    );
  }
}
