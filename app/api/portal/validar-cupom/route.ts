import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const { ok: rateOk, retryAfter } = rateLimit(`validar-cupom:${ip}`, 30, 60_000); // 30 tentativas/min por IP
  if (!rateOk) return rateLimitResponse(retryAfter);

  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let isAdmin = false;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ ok: false, error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    const user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
    isAdmin = user.role?.startsWith('duolife_') || false;
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return Response.json({ ok: false, error: 'Código do cupom é obrigatório' }, { status: 400 });
    }

    // Busca tolerante a case e variações de identificador da coleção de cupons
    const items = await sql`
      SELECT wi.payload
      FROM wix_items wi
      JOIN wix_collections wc ON wi.wix_collection_id = wc.id
      WHERE (wc.collection_name ILIKE '%CUPOM%' OR wc.collection_id ILIKE '%CUPOM%')
        AND wi.is_active = true
      ORDER BY wi.created_at DESC
    `;

    const cupons = items
      .map(row => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          const itemObj = (parsed?.item || parsed) as Record<string, unknown>;
          const dataObj = (itemObj?.data || itemObj) as Record<string, unknown>;
          return dataObj || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const searchCode = code.trim().toLowerCase();
    const cupom = cupons.find(c => {
      const cod = String(c?.codigo || c?.nome || c?.Codigo || '').trim().toLowerCase();
      return cod === searchCode;
    });

    if (!cupom) {
      return Response.json({ ok: false, error: 'Cupom inválido ou não encontrado' }, { status: 404 });
    }

    // Validações do Cupom
    if (cupom.cupomAtivo === false) {
      return Response.json({ ok: false, error: 'Cupom inativo' }, { status: 400 });
    }

    // Validade
    if (cupom.validade) {
      const validDateStr = (cupom.validade as any)?.$date || cupom.validade;
      if (validDateStr) {
        const validDate = new Date(validDateStr);
        if (!isNaN(validDate.getTime()) && validDate < new Date()) {
          return Response.json({ ok: false, error: 'Cupom expirado' }, { status: 400 });
        }
      }
    }

    // Quantidade — usa o contador real do DuoLife (cupom_usos), não o quantidadeUsada estático do Wix,
    // que nunca é incrementado de volta.
    const cupomCodigo = String(cupom.codigo || cupom.nome || searchCode);
    const limite = Number(cupom.quantidade) || 0;
    if (limite > 0) {
      const [uso] = await sql`
        SELECT usos FROM cupom_usos WHERE UPPER(cupom_codigo) = UPPER(${cupomCodigo}) LIMIT 1
      `;
      const usados = Number(uso?.usos) || 0;
      if (usados >= limite) {
        return Response.json({ ok: false, error: 'Cupom esgotado' }, { status: 400 });
      }
    }

    return Response.json({
      ok: true,
      desconto: Number(cupom.desconto) || 0,
      codigo: cupomCodigo,
      nome: cupom.nome || cupomCodigo
    });

  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.validar-cupom.failed');
    return Response.json({ ok: false, error: 'Erro interno ao validar cupom' }, { status: 500 });
  }
}
