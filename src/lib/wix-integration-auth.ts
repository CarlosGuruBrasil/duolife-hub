import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { hashApiKey } from '@/lib/mcp/security';
import { findPartnerByWixCode } from '@/lib/wix-sync';
import { logger } from '@/lib/logger';

export interface WixAuthContext {
  authenticated: boolean;
  clientId?: string;
  clientName?: string;
  source: 'env_wix' | 'env_integration' | 'mcp_key' | 'dev_fallback';
}

export interface ResolvedPartner {
  id: string;
  name: string;
}

/**
 * Autentica requisições Server-to-Server (S2S) vindas do Wix ou sistemas integradores.
 * Aceita autenticação via:
 * - Header `X-Api-Key: <token>`
 * - Header `Authorization: Bearer <token>`
 *
 * Valida contra:
 * 1. process.env.WIX_INTEGRATION_KEY
 * 2. process.env.INTEGRATION_API_KEY
 * 3. Tabela mcp_api_keys (via hash SHA-256)
 * 4. Chave de desenvolvimento local: `dlmcp_live_dev_test_key_001_secret`
 */
export async function verifyWixIntegrationAuth(
  req: Request | NextRequest
): Promise<WixAuthContext | null> {
  const authHeader = req.headers.get('authorization');
  const xApiKey = req.headers.get('x-api-key');

  let rawToken = '';
  if (xApiKey) {
    rawToken = xApiKey.trim();
  } else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    rawToken = authHeader.slice(7).trim();
  }

  if (!rawToken) {
    return null;
  }

  // 1. Chaves de ambiente
  const wixEnvKey = process.env.WIX_INTEGRATION_KEY?.trim();
  if (wixEnvKey && rawToken === wixEnvKey) {
    return {
      authenticated: true,
      clientId: 'env-wix',
      clientName: 'Wix S2S Integration (Env WIX_INTEGRATION_KEY)',
      source: 'env_wix',
    };
  }

  const integrationEnvKey = process.env.INTEGRATION_API_KEY?.trim();
  if (integrationEnvKey && rawToken === integrationEnvKey) {
    return {
      authenticated: true,
      clientId: 'env-integration',
      clientName: 'Wix S2S Integration (Env INTEGRATION_API_KEY)',
      source: 'env_integration',
    };
  }

  // 2. Chave de desenvolvimento local
  if (rawToken === 'dlmcp_live_dev_test_key_001_secret') {
    return {
      authenticated: true,
      clientId: 'dev-mock-client-id',
      clientName: 'Agente Dev Test Local (Mock)',
      source: 'dev_fallback',
    };
  }

  // 3. Validação por hash seguro na tabela mcp_api_keys
  try {
    const tokenHash = hashApiKey(rawToken);
    const [row] = await sql<any[]>`
      SELECT id, name, scopes, is_active, expires_at
      FROM mcp_api_keys
      WHERE key_hash = ${tokenHash}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `;

    if (row) {
      // Atualiza last_used_at de forma assíncrona
      sql`UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = ${row.id}`.catch(() => {});
      return {
        authenticated: true,
        clientId: row.id,
        clientName: row.name,
        source: 'mcp_key',
      };
    }
  } catch (err) {
    logger.error({ err }, 'wix.auth.database_lookup_failed');
  }

  return null;
}

/**
 * Middleware/helper de autenticação para handlers de rota Next.js do Wix.
 */
export async function authenticateWixRequest(
  req: Request | NextRequest
): Promise<
  | { authorized: true; context: WixAuthContext }
  | { authorized: false; response: NextResponse }
> {
  const context = await verifyWixIntegrationAuth(req);
  if (!context) {
    const path = req instanceof NextRequest ? req.nextUrl.pathname : undefined;
    logger.warn({ path }, 'wix.auth.unauthorized');
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Não autorizado',
          message: 'Credenciais de integração S2S inválidas ou ausentes (X-Api-Key ou Authorization: Bearer).',
        },
        { status: 401 }
      ),
    };
  }
  return { authorized: true, context };
}

/**
 * Resolução resiliente do parceiro responsável pela cotação do Wix.
 * Procura por:
 * 1. findPartnerByWixCode(partnerCode)
 * 2. slug do WhiteLabel ou id direto do parceiro
 * 3. Fallback: Matriz DuoLife (Venda Direta) onde status = 'active' e nome ILIKE '%duolife%'
 * 4. Fallback: Primeiro parceiro ativo no banco
 */
export async function resolvePartnerForWix(
  partnerCode: string | null | undefined
): Promise<ResolvedPartner> {
  const cleanCode = partnerCode ? String(partnerCode).trim() : '';

  if (cleanCode) {
    // 1. Busca por código Wix mapeado no metadata
    try {
      const matchWix = await findPartnerByWixCode(cleanCode);
      if (matchWix?.id) {
        const [partner] = await sql<any[]>`
          SELECT id, razao_social, nome_fantasia FROM partners WHERE id = ${matchWix.id} LIMIT 1
        `;
        if (partner) {
          return {
            id: partner.id,
            name: partner.nome_fantasia || partner.razao_social || 'Parceiro DuoLife',
          };
        }
      }
    } catch (err) {
      logger.warn({ err, cleanCode }, 'wix.partner_resolution.find_by_wix_code_failed');
    }

    // 2. Busca parceiro ativo por slug ou id direto
    try {
      const [partner] = await sql<any[]>`
        SELECT id, razao_social, nome_fantasia
        FROM partners
        WHERE (
          metadata->'whiteLabel'->>'slug' = ${cleanCode}
          OR metadata->>'slug' = ${cleanCode}
          OR LOWER(COALESCE(metadata->'whiteLabel'->>'slug', '')) = LOWER(${cleanCode})
          OR LOWER(COALESCE(metadata->>'slug', '')) = LOWER(${cleanCode})
          OR id = ${cleanCode}
        )
        AND status = 'active'
        LIMIT 1
      `;
      if (partner) {
        return {
          id: partner.id,
          name: partner.nome_fantasia || partner.razao_social || 'Parceiro DuoLife',
        };
      }
    } catch (err) {
      logger.warn({ err, cleanCode }, 'wix.partner_resolution.find_by_slug_or_id_failed');
    }
  }

  // 3. Fallback resiliente: parceiro matriz DuoLife (Venda Direta)
  try {
    const [matriz] = await sql<any[]>`
      SELECT id, razao_social, nome_fantasia
      FROM partners
      WHERE status = 'active'
        AND (razao_social ILIKE '%duolife%' OR nome_fantasia ILIKE '%duolife%')
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (matriz) {
      return {
        id: matriz.id,
        name: matriz.nome_fantasia || matriz.razao_social || 'DuoLife Venda Direta',
      };
    }

    // Primeiro parceiro ativo
    const [primeiroAtivo] = await sql<any[]>`
      SELECT id, razao_social, nome_fantasia
      FROM partners
      WHERE status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (primeiroAtivo) {
      return {
        id: primeiroAtivo.id,
        name: primeiroAtivo.nome_fantasia || primeiroAtivo.razao_social || 'Parceiro DuoLife',
      };
    }
  } catch (err) {
    logger.error({ err }, 'wix.partner_resolution.fallback_query_failed');
  }

  return {
    id: 'partner_duolife_default',
    name: 'DuoLife Venda Direta',
  };
}
