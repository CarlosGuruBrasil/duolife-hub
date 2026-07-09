import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function POST(req: NextRequest) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let isAdmin = false;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active'
    `;
    if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    const user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return Response.json({ ok: false, error: 'Código do cupom é obrigatório' }, { status: 400 });
    }

    const items = await sql`
      SELECT payload
      FROM wix_items
      WHERE wix_collection_id IN (
        SELECT id FROM wix_collections WHERE collection_id = 'CUPOMPROMOCIONAL'
      )
      AND is_active = true
    `;

    const cupons = items
      .map(row => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          return parsed?.item?.data || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const searchCode = code.trim().toLowerCase();
    const cupom = cupons.find(c => c.codigo?.toLowerCase() === searchCode);

    if (!cupom) {
      return Response.json({ ok: false, error: 'Cupom inválido' }, { status: 404 });
    }

    // Validações do Cupom
    if (cupom.cupomAtivo === false) {
      return Response.json({ ok: false, error: 'Cupom inativo' }, { status: 400 });
    }

    // Validade
    if (cupom.validade) {
      const validDateStr = cupom.validade.$date || cupom.validade;
      if (validDateStr) {
        const validDate = new Date(validDateStr);
        if (!isNaN(validDate.getTime()) && validDate < new Date()) {
          return Response.json({ ok: false, error: 'Cupom expirado' }, { status: 400 });
        }
      }
    }

    // Quantidade
    const limite = Number(cupom.quantidade) || 0;
    const usados = Number(cupom.quantidadeUsada) || 0;
    if (limite > 0 && usados >= limite) {
      return Response.json({ ok: false, error: 'Cupom esgotado' }, { status: 400 });
    }

    return Response.json({
      ok: true,
      desconto: Number(cupom.desconto) || 0,
      codigo: cupom.codigo,
      nome: cupom.nome
    });

  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.validar-cupom.failed');
    return Response.json({ error: 'Erro interno ao validar cupom' }, { status: 500 });
  }
}
