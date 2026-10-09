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

export const NET4LIFE_CORRETORA_ID = 'corretora_net4life_001';
export const NET4LIFE_CORRETORA_NOME = 'NET4Life Corretora de Seguros';
export const NET4LIFE_MASTER_PARTNER_ID = 'partner_net4life_master';

export interface ResolvedPartner {
  id: string;
  name: string;
  corretoraId: string;
  corretoraNome: string;
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
 * Garante deterministicamente a existência da entidade parceiro NET4Life
 * vinculada à corretora NET4Life Corretora de Seguros (corretora_net4life_001).
 */
export async function ensureNet4LifeMasterPartner(): Promise<ResolvedPartner> {
  try {
    // 1. Tenta localizar por id canônico ou por metadados de parceiro NET4Life vinculado à corretora
    const [existing] = await sql<any[]>`
      SELECT id, razao_social, nome_fantasia, corretora_id
      FROM partners
      WHERE (
        id = ${NET4LIFE_MASTER_PARTNER_ID}
        OR (corretora_id = ${NET4LIFE_CORRETORA_ID} AND (
          metadata->>'slug' = 'net4life'
          OR metadata->'whiteLabel'->>'slug' = 'net4life'
          OR metadata->'wix'->>'partnerCode' = 'net4life'
          OR LOWER(COALESCE(nome_fantasia, '')) = 'net4life'
          OR LOWER(COALESCE(razao_social, '')) = 'net4life'
          OR LOWER(COALESCE(razao_social, '')) = 'net4life corretora de seguros'
        ))
      )
      AND status = 'active'
      ORDER BY CASE WHEN id = ${NET4LIFE_MASTER_PARTNER_ID} THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1
    `;

    if (existing) {
      return {
        id: existing.id,
        name: existing.nome_fantasia || existing.razao_social || 'NET4Life',
        corretoraId: existing.corretora_id || NET4LIFE_CORRETORA_ID,
        corretoraNome: NET4LIFE_CORRETORA_NOME,
      };
    }

    // 2. Se não existir, insere/garante o parceiro master NET4Life
    const [inserted] = await sql<any[]>`
      INSERT INTO partners (
        id,
        razao_social,
        nome_fantasia,
        email,
        phone,
        status,
        corretora_id,
        metadata
      )
      VALUES (
        ${NET4LIFE_MASTER_PARTNER_ID},
        'NET4Life Corretora de Seguros',
        'NET4Life',
        'vendas@net4life.com.br',
        '+55 11 91177-1319',
        'active',
        ${NET4LIFE_CORRETORA_ID},
        ${JSON.stringify({
          slug: 'net4life',
          isMasterPartner: true,
          polo: 'net4life_wix',
          whiteLabel: {
            slug: 'net4life',
            companyName: 'NET4Life Corretora de Seguros',
          },
          wix: {
            partnerCode: 'net4life',
            cargo: 'Polo NET4Life',
          },
        })}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        corretora_id = EXCLUDED.corretora_id,
        status = 'active',
        updated_at = NOW()
      RETURNING id, razao_social, nome_fantasia, corretora_id
    `;

    if (inserted) {
      return {
        id: inserted.id,
        name: inserted.nome_fantasia || inserted.razao_social || 'NET4Life',
        corretoraId: inserted.corretora_id || NET4LIFE_CORRETORA_ID,
        corretoraNome: NET4LIFE_CORRETORA_NOME,
      };
    }
  } catch (err) {
    logger.error({ err }, 'wix.partner.ensure_net4life_master_failed');
  }

  return {
    id: NET4LIFE_MASTER_PARTNER_ID,
    name: 'NET4Life',
    corretoraId: NET4LIFE_CORRETORA_ID,
    corretoraNome: NET4LIFE_CORRETORA_NOME,
  };
}

/**
 * Resolução resiliente do parceiro responsável pela cotação/venda no Polo Wix.
 * Todas as vendas do Polo Wix são atribuídas à corretora NET4Life Corretora de Seguros.
 * Se o código de afiliado for fornecido e pertencer a um parceiro válido, vincula-o
 * à corretora NET4Life. Caso contrário (venda direta do polo ou afiliado padrão),
 * atribui diretamente ao parceiro master NET4Life.
 */
export async function resolvePartnerForWix(
  partnerCode: string | null | undefined
): Promise<ResolvedPartner> {
  const cleanCode = partnerCode ? String(partnerCode).trim() : '';

  const isGenericOrPoloNet4Life =
    !cleanCode ||
    ['net4life', 'polo', 'net4life-wix', 'matriz', 'direta', 'site'].includes(
      cleanCode.toLowerCase()
    );

  if (cleanCode && !isGenericOrPoloNet4Life) {
    // 1. Busca por código Wix mapeado no metadata
    try {
      const matchWix = await findPartnerByWixCode(cleanCode);
      if (matchWix?.id) {
        const [partner] = await sql<any[]>`
          SELECT id, razao_social, nome_fantasia, corretora_id FROM partners WHERE id = ${matchWix.id} LIMIT 1
        `;
        if (partner) {
          return {
            id: partner.id,
            name: partner.nome_fantasia || partner.razao_social || 'NET4Life',
            corretoraId: partner.corretora_id || NET4LIFE_CORRETORA_ID,
            corretoraNome: NET4LIFE_CORRETORA_NOME,
          };
        }
      }
    } catch (err) {
      logger.warn({ err, cleanCode }, 'wix.partner_resolution.find_by_wix_code_failed');
    }

    // 2. Busca parceiro ativo por slug ou id direto
    try {
      const [partner] = await sql<any[]>`
        SELECT id, razao_social, nome_fantasia, corretora_id
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
          name: partner.nome_fantasia || partner.razao_social || 'NET4Life',
          corretoraId: partner.corretora_id || NET4LIFE_CORRETORA_ID,
          corretoraNome: NET4LIFE_CORRETORA_NOME,
        };
      }
    } catch (err) {
      logger.warn({ err, cleanCode }, 'wix.partner_resolution.find_by_slug_or_id_failed');
    }
  }

  // 3. Padrão do Polo NET4Life Wix: Parceiro NET4Life da corretora NET4Life Corretora de Seguros
  return await ensureNet4LifeMasterPartner();
}
