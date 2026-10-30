import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { calculateConversionMetrics } from '@/lib/link-tracker';
import { gerarLinksCsv, type SaleLinkExportRow } from '@/lib/links-csv';

export const dynamic = 'force-dynamic';

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    await ensureSchema();

    let effectivePartnerId = user.partnerId;
    if (!effectivePartnerId && user.corretoraId) {
      const [p] = await sql`
        SELECT id FROM partners
        WHERE corretora_id = ${user.corretoraId} AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      effectivePartnerId = p?.id || null;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ error: 'Nenhum parceiro ativo associado' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const filterStatus = searchParams.get('status');
    const filterExclusive = searchParams.get('isExclusive');
    const filterProductId = searchParams.get('productId');

    const links = await sql`
      SELECT
        pl.id,
        pl.token,
        pl.label,
        pl.flow_type,
        pl.status,
        COALESCE(pl.discount_percent, 0) AS discount_percent,
        COALESCE(pl.is_exclusive, false) AS is_exclusive,
        pl.target_document,
        pl.target_name,
        pl.max_uses,
        COALESCE(pl.used_count, 0)::int AS used_count,
        COALESCE(pl.views_count, 0)::int AS views_count,
        COALESCE(pl.unique_views_count, 0)::int AS unique_views_count,
        pl.last_accessed_at,
        pl.expires_at,
        pl.used_at,
        pl.created_at,
        pl.updated_at,
        pl.metadata,
        pr.id AS product_id,
        pr.name AS product_name,
        pr.code AS product_code,
        COUNT(c.id)::int AS total_cotacoes,
        COUNT(c.id) FILTER (WHERE c.status IN ('aprovada', 'emitida'))::int AS total_vendas
      FROM public_sale_links pl
      LEFT JOIN products pr ON pr.id = pl.product_id
      LEFT JOIN cotacoes c ON c.source_token = pl.token
      WHERE pl.partner_id = ${effectivePartnerId}
      GROUP BY pl.id, pr.id
      ORDER BY pl.created_at DESC
    `;

    let filteredLinks: any[] = Array.isArray(links) ? [...links] : [];
    if (filterStatus) {
      filteredLinks = filteredLinks.filter((l: any) => l.status === filterStatus);
    }
    if (filterExclusive === 'true') {
      filteredLinks = filteredLinks.filter((l: any) => Boolean(l.is_exclusive));
    } else if (filterExclusive === 'false') {
      filteredLinks = filteredLinks.filter((l: any) => !l.is_exclusive);
    }
    if (filterProductId) {
      filteredLinks = filteredLinks.filter((l: any) => l.product_id === filterProductId);
    }

    const baseUrl = appBaseUrl();
    const rows: SaleLinkExportRow[] = filteredLinks.map((l: any) => {
      const viewsCount = Number(l.views_count || 0);
      const uniqueViewsCount = Number(l.unique_views_count || 0);
      const totalCotacoes = Number(l.total_cotacoes || 0);
      const totalVendas = Number(l.total_vendas || 0);
      const metrics = calculateConversionMetrics(viewsCount, uniqueViewsCount, totalCotacoes, totalVendas);

      return {
        id: l.id,
        token: l.token,
        label: l.label,
        flow_type: l.flow_type,
        status: l.status,
        discount_percent: Number(l.discount_percent || 0),
        is_exclusive: Boolean(l.is_exclusive),
        target_document: l.target_document,
        target_name: l.target_name,
        max_uses: l.max_uses ? Number(l.max_uses) : null,
        used_count: Number(l.used_count || 0),
        views_count: viewsCount,
        unique_views_count: uniqueViewsCount,
        total_cotacoes: totalCotacoes,
        total_vendas: totalVendas,
        conversion_rate_cotacao: metrics.conversionRateCotacao,
        conversion_rate_venda: metrics.conversionRateVenda,
        fechamento_rate: metrics.fechamentoRate,
        created_at: l.created_at,
        last_accessed_at: l.last_accessed_at,
        expires_at: l.expires_at,
        product_name: l.product_name,
        product_code: l.product_code,
        url: `${baseUrl}/contratar/${l.token}`,
      };
    });

    const csvContent = gerarLinksCsv(rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `relatorio_links_vendas_${dateStr}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    logger.error({ err: err?.message || err, stack: err?.stack }, 'portal.links.exportar.failed');
    return NextResponse.json({ error: 'Erro ao gerar relatório de links', details: err?.message }, { status: 500 });
  }
}
