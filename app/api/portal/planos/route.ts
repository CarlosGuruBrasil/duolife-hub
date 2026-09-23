import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getRamoConfig, rcAdvogadosConfig } from '@/lib/product-schemas';

export async function GET(req: Request) {
  const publicToken = req.headers.get('x-public-token');
  const url = new URL(req.url);
  const requestedPartnerId = url.searchParams.get('partnerId');
  const requestedProductId = url.searchParams.get('productId');
  const requestedFlowKey = url.searchParams.get('flowKey');

  let targetPartnerId: string | null = null;
  let linkedProductId: string | null = null;
  let publicDiscountPercent = 0;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id, product_id, COALESCE(discount_percent, 0) AS discount_percent
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
    linkedProductId = link.product_id;
    publicDiscountPercent = Number(link.discount_percent || 0);
  } else {
    const user = await verifyAuth();
    if (!user) return unauthorized();

    if (isInternalUser(user)) {
      targetPartnerId = requestedPartnerId || user.partnerId || null;
    } else {
      targetPartnerId = user.partnerId;
    }
  }

  try {
    const effectiveProductId = requestedProductId || linkedProductId || 'prod-rc-001';
    let resolvedFlowKey = requestedFlowKey;
    let productCode: string | null = null;
    let productCategory: string | null = null;
    let baseCommission = 20;

    if (effectiveProductId) {
      try {
        const [prod] = await sql`
          SELECT id, flow_key, code, category, base_commission_rate
          FROM products
          WHERE id = ${effectiveProductId}
          LIMIT 1
        `;
        if (prod) {
          if (!resolvedFlowKey) resolvedFlowKey = prod.flow_key;
          productCode = prod.code;
          productCategory = prod.category;
          if (prod.base_commission_rate != null) {
            baseCommission = Number(prod.base_commission_rate);
          }
        }
      } catch {
        // segue com valores padrão
      }
    }

    const isRcAdvogados =
      !resolvedFlowKey ||
      resolvedFlowKey === 'rc_advogados_v1' ||
      resolvedFlowKey === 'rc_professional_v1' ||
      resolvedFlowKey === 'rc-advogados';

    let planos: any[] = [];

    if (isRcAdvogados) {
      // Se for RC Advogados ou não informado, mantém a consulta da coleção Wix 'Planos'
      try {
        const items = await sql`
          SELECT payload
          FROM wix_items
          WHERE wix_collection_id IN (
            SELECT id FROM wix_collections WHERE collection_id = 'Planos'
          )
          AND is_active = true
        `;

        planos = items
          .map((row) => {
            try {
              const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
              return parsed?.item?.data || null;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
      } catch {
        planos = [];
      }

      // Fallback em caso de Wix vazio ou erro de banco
      if (planos.length === 0) {
        planos = [...rcAdvogadosConfig.planos].sort(
          (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)
        );
      }
    } else {
      // Se especificado productId ou flowKey de outro ramo, retorna os planos do RamoConfig ordenados por ordem
      const ramoConfig = getRamoConfig({
        flowKey: resolvedFlowKey || undefined,
        code: productCode || undefined,
        category: productCategory || undefined,
      });

      if (ramoConfig && Array.isArray(ramoConfig.planos)) {
        planos = [...ramoConfig.planos].sort(
          (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)
        );
      } else {
        planos = [...rcAdvogadosConfig.planos].sort(
          (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)
        );
      }
    }

    // Obtém taxa de comissão do parceiro (ou base do produto)
    let commissionRate = baseCommission;
    try {
      const [rateRow] = await sql`
        SELECT
          COALESCE(
            (
              SELECT rate
              FROM partner_commission_rates
              WHERE (partner_id = ${targetPartnerId} OR ${targetPartnerId} IS NULL)
                AND (product_id = ${effectiveProductId} OR product_id IS NOT NULL)
                AND valid_from <= CURRENT_DATE
                AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
              ORDER BY valid_from DESC
              LIMIT 1
            ),
            (
              SELECT base_commission_rate
              FROM products
              WHERE id = ${effectiveProductId}
              LIMIT 1
            ),
            ${baseCommission}
          ) AS rate
      `;
      if (rateRow?.rate != null) {
        commissionRate = Number(rateRow.rate);
      }
    } catch {
      // Fallback seguro de comissão base
    }

    return Response.json({
      ok: true,
      planos,
      commissionRate,
      flowKey: resolvedFlowKey,
      code: productCode,
      category: productCategory,
      productId: effectiveProductId,
      discountPercent: publicDiscountPercent,
      isPublicClient: Boolean(publicToken),
    });
  } catch (err) {
    logger.error({ err, partnerId: targetPartnerId }, 'api.portal.planos.failed');
    return Response.json({ error: 'Erro interno ao buscar planos' }, { status: 500 });
  }
}
