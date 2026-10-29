import { createHash } from 'node:crypto';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

/**
 * Gera um hash SHA-256 criptográfico unidirecional do endereço IP do cliente.
 * Atende estritamente à LGPD: nenhum IP é armazenado em texto claro no banco de dados.
 */
export function hashClientIp(ip: string, salt?: string): string {
  const actualSalt = salt || process.env.LINK_TRACKER_SALT || 'duolife_link_tracker_salt_v1';
  return createHash('sha256')
    .update(`${actualSalt}:${ip.trim()}`)
    .digest('hex');
}

/**
 * Extrai dados de acesso e conexão do cliente a partir dos cabeçalhos da requisição HTTP.
 * Prioriza proxies reversos (Cloudflare `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`).
 */
export function extractClientAccessData(
  headers: Headers | Record<string, string | string[] | undefined>
): {
  ip: string;
  userAgent: string | null;
  referer: string | null;
} {
  const getHeader = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === 'function') {
      const val = (headers as Headers).get(name);
      return val && val.trim() ? val.trim() : null;
    }
    const lowerName = name.toLowerCase();
    const foundKey = Object.keys(headers).find((k) => k.toLowerCase() === lowerName);
    if (!foundKey) return null;
    const raw = (headers as Record<string, string | string[] | undefined>)[foundKey];
    if (!raw) return null;
    const str = Array.isArray(raw) ? raw[0] : raw;
    return str && str.trim() ? str.trim() : null;
  };

  // Prioridade de IP: cf-connecting-ip (Cloudflare) > x-real-ip > x-forwarded-for > true-client-ip
  const cfIp = getHeader('cf-connecting-ip');
  const realIp = getHeader('x-real-ip');
  const fwdFor = getHeader('x-forwarded-for');
  const trueClientIp = getHeader('true-client-ip');

  let ip = '127.0.0.1'; // Fallback seguro
  if (cfIp) {
    ip = cfIp.split(',')[0].trim();
  } else if (realIp) {
    ip = realIp.split(',')[0].trim();
  } else if (fwdFor) {
    ip = fwdFor.split(',')[0].trim();
  } else if (trueClientIp) {
    ip = trueClientIp.split(',')[0].trim();
  }

  const userAgent = getHeader('user-agent');
  const referer = getHeader('referer') || getHeader('referrer');

  return {
    ip,
    userAgent: userAgent || null,
    referer: referer || null,
  };
}

/**
 * Registra o acesso ao link de venda de autocadastro e atualiza os contadores agregados.
 * Trata acessos únicos vs recorrentes baseado no ip_hash do visitante.
 * Tratamento defensivo: falhas de log/banco não lançam exceções na requisição pública.
 */
export async function trackSaleLinkAccess(params: {
  linkId: string;
  token: string;
  partnerId: string;
  ip?: string;
  userAgent?: string | null;
  referer?: string | null;
}): Promise<{ tracked: boolean; isUnique: boolean }> {
  try {
    const clientIp = params.ip || '127.0.0.1';
    const ipHash = hashClientIp(clientIp);

    // 1. Verifica se já existe registro de acesso anterior deste visitor para este link
    const existingAccess = await sql<{ id: string }[]>`
      SELECT id
      FROM sale_link_access_logs
      WHERE link_id = ${params.linkId}
        AND ip_hash = ${ipHash}
      LIMIT 1
    `;

    const isUnique = existingAccess.length === 0;

    // 2. Insere o log de auditoria de acesso
    await sql`
      INSERT INTO sale_link_access_logs (
        link_id,
        token,
        partner_id,
        ip_hash,
        user_agent,
        referer
      ) VALUES (
        ${params.linkId},
        ${params.token},
        ${params.partnerId},
        ${ipHash},
        ${params.userAgent ?? null},
        ${params.referer ?? null}
      )
    `;

    // 3. Atualiza contadores agregados em public_sale_links
    if (isUnique) {
      await sql`
        UPDATE public_sale_links
        SET views_count = views_count + 1,
            unique_views_count = unique_views_count + 1,
            last_accessed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${params.linkId}
      `;
    } else {
      await sql`
        UPDATE public_sale_links
        SET views_count = views_count + 1,
            last_accessed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${params.linkId}
      `;
    }

    return { tracked: true, isUnique };
  } catch (error) {
    logger.error(
      {
        err: error,
        linkId: params.linkId,
        token: params.token,
      },
      'Erro ao rastrear acesso ao link de venda'
    );
    return { tracked: false, isUnique: false };
  }
}

/**
 * Calcula as taxas de conversão do funil de vendas formatadas com 1 casa decimal.
 * Protegido contra divisão por zero e valores inválidos.
 */
export function calculateConversionMetrics(
  viewsCount: number,
  uniqueViewsCount: number,
  totalCotacoes: number,
  totalVendas: number
): {
  conversionRateCotacao: number;
  conversionRateVenda: number;
  fechamentoRate: number;
} {
  const safeViews = Number.isFinite(viewsCount) && viewsCount > 0 ? viewsCount : 0;
  const safeCotacoes = Number.isFinite(totalCotacoes) && totalCotacoes > 0 ? totalCotacoes : 0;
  const safeVendas = Number.isFinite(totalVendas) && totalVendas > 0 ? totalVendas : 0;

  const conversionRateCotacao =
    safeViews > 0 ? Number(((safeCotacoes / safeViews) * 100).toFixed(1)) : 0;

  const conversionRateVenda =
    safeViews > 0 ? Number(((safeVendas / safeViews) * 100).toFixed(1)) : 0;

  const fechamentoRate =
    safeCotacoes > 0 ? Number(((safeVendas / safeCotacoes) * 100).toFixed(1)) : 0;

  return {
    conversionRateCotacao,
    conversionRateVenda,
    fechamentoRate,
  };
}
