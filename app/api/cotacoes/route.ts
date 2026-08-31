import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPartnerAccessContext, isPlatformAdmin, isInternalUser, verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { calcularPrecoServidor } from '@/lib/pricing';

const cotacaoSchema = z.object({
  clientName: z.string().trim().min(2),
  clientCpfCnpj: z.string().trim().min(11),
  clientEmail: z.string().trim().email().optional().or(z.literal('')),
  clientPhone: z.string().trim().optional(),
  importanciaSegurada: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
  productId: z.string().trim().min(1).optional(),
  clientData: z.record(z.string(), z.unknown()).optional(),
  adminSelectedPartnerId: z.string().trim().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const requestedPartnerId = url.searchParams.get('partnerId');

  // Se for parceiro, força o ID dele. Se for admin, usa o solicitado ou busca todos (se não enviar)
  let targetPartnerId = user.partnerId;
  let access = null;
  if (isInternalUser(user)) {
    targetPartnerId = requestedPartnerId || null;
  } else if (!targetPartnerId) {
    return unauthorized();
  } else {
    access = await getPartnerAccessContext(user);
  }

  try {
    await ensureSchema();
    await seedInitialData();

    // Expira automaticamente cotações que passaram do prazo sem avançar (evita ficarem presas
    // indefinidamente em 'rascunho'/'enviada'/'contrato_gerado' inflando o funil).
    await sql`
      UPDATE cotacoes
      SET status = 'expirada', updated_at = NOW()
      WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE
        AND status IN ('rascunho', 'enviada', 'contrato_gerado')
    `;

    const cotacoes = !targetPartnerId
      ? await sql`
          SELECT
            c.id,
            c.client_name,
            c.client_cpf_cnpj,
            c.client_email,
            c.client_phone,
            c.importancia_segurada,
            c.premio_final,
            c.status,
            c.valid_until,
            c.created_at,
            p.name AS product_name
          FROM cotacoes c
          JOIN products p ON p.id = c.product_id
          ORDER BY c.created_at DESC
          LIMIT 100
        `
      : !access || access.visibleUserIds === null
        ? await sql`
            SELECT
              c.id,
              c.client_name,
              c.client_cpf_cnpj,
              c.client_email,
              c.client_phone,
              c.importancia_segurada,
              c.premio_final,
              c.status,
              c.valid_until,
              c.created_at,
              p.name AS product_name
            FROM cotacoes c
            JOIN products p ON p.id = c.product_id
            WHERE c.partner_id = ${targetPartnerId}
            ORDER BY c.created_at DESC
            LIMIT 100
          `
        : await sql`
            SELECT
              c.id,
              c.client_name,
              c.client_cpf_cnpj,
              c.client_email,
              c.client_phone,
              c.importancia_segurada,
              c.premio_final,
              c.status,
              c.valid_until,
              c.created_at,
              p.name AS product_name
            FROM cotacoes c
            JOIN products p ON p.id = c.product_id
            WHERE c.partner_id = ${targetPartnerId}
              AND c.partner_user_id IN ${sql(access.visibleUserIds)}
            ORDER BY c.created_at DESC
            LIMIT 100
          `;

    return Response.json({ cotacoes });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'cotacoes.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await seedInitialData();

    const publicToken = req.headers.get('x-public-token');
    let targetPartnerId: string | null = null;
    let userId: string | null = null;
    let sourceToken: string | null = null;
    let flowType = 'internal';
    let publicLinkProductId: string | null = null;
    let isInternal = false;
    let canBypassProductAvailability = false;

    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id, id, flow_type, product_id
        FROM public_sale_links
        WHERE token = ${publicToken}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
      
      targetPartnerId = link.partner_id;
      publicLinkProductId = link.product_id;
      sourceToken = publicToken;
      flowType = link.flow_type || 'external';
    }

    const payloadBody = await req.json();
    const parsed = cotacaoSchema.safeParse(payloadBody);
    if (!parsed.success) {
      return Response.json({ error: 'Dados da cotação inválidos' }, { status: 400 });
    }
    const data = parsed.data as any;

    if (!publicToken) {
      const user = await verifyAuth();
      if (!user) return unauthorized();

      userId = user.userId;
      targetPartnerId = user.partnerId;
      isInternal = isInternalUser(user);
      canBypassProductAvailability = isPlatformAdmin(user);

      if (isInternal) {
        if (!data.adminSelectedPartnerId) {
          return Response.json({ error: 'Administradores precisam informar o Parceiro dono da cotação' }, { status: 400 });
        }
        targetPartnerId = data.adminSelectedPartnerId;
        userId = null;
      } else if (!targetPartnerId) {
        return unauthorized();
      }
    }

    // O produto do link público é imutável. No portal, o produto será escolhido no catálogo;
    // enquanto a tela legada não envia productId, preservamos RC-001 como compatibilidade.
    const requestedProductId = publicToken ? publicLinkProductId : (data.productId || 'prod-rc-001');
    if (!requestedProductId) {
      return Response.json({ error: 'Este link não está vinculado a um produto disponível' }, { status: 422 });
    }

    const [product] = publicToken
      ? await sql`
          SELECT id, flow_key, pricing_strategy
          FROM products
          WHERE id = ${requestedProductId} AND is_active = true AND is_quoteable = true
        `
      : await sql`
          SELECT p.id, p.flow_key, p.pricing_strategy
          FROM products p
          WHERE p.id = ${requestedProductId}
            AND p.is_active = true
            AND p.is_quoteable = true
            AND (
              ${canBypassProductAvailability}
              OR EXISTS (
                SELECT 1 FROM partner_product_availability ppa
                WHERE ppa.partner_id = ${targetPartnerId}
                  AND ppa.product_id = p.id
                  AND ppa.is_active = true
              )
            )
        `;

    if (!product) {
      return Response.json({ error: 'Produto indisponível para esta operação' }, { status: 403 });
    }
    if (product.flow_key !== 'rc_professional_v1' || product.pricing_strategy !== 'rc_wix_planos_v1') {
      return Response.json({ error: 'O fluxo deste produto ainda não está disponível' }, { status: 422 });
    }

    const client = await upsertInsuranceClient({
      documentNumber: data.clientCpfCnpj,
      fullName: data.clientName,
      email: data.clientEmail || null,
      phone: data.clientPhone || null,
      birthDate: typeof data.clientData?.dataNascto === 'string' ? data.clientData.dataNascto : null,
      metadata: {
        source: publicToken ? 'public_link' : 'portal',
        partnerId: targetPartnerId,
      },
    });

    // O preço nunca é aceito do cliente — recalculado aqui a partir da tabela real de planos
    // e do cupom validado no servidor, pra fechar a brecha de manipulação de valor.
    const clientDataInput = (data.clientData || {}) as Record<string, unknown>;
    const preco = await calcularPrecoServidor({
      tipoDePlano: (clientDataInput.tipo as string) || (clientDataInput.tipoDePlano as string) || null,
      qtdParcelasSolicitada: Number(clientDataInput.parcela) || 1,
      cupomCodigo: clientDataInput.cupomCodigo as string | null | undefined,
    });

    if (!preco) {
      return Response.json({ error: 'Não foi possível calcular o preço do plano selecionado' }, { status: 422 });
    }

    const clientDataFinal = {
      ...clientDataInput,
      valor: preco.valorTotal,
      valorParcela: preco.valorParcela,
      parcela: preco.qtdParcelas,
    };
    const premioCalculado = preco.valorTotal;

    // Renovação como conceito de primeira classe (não só uma flag solta em client_data.renovacao).
    // Tenta linkar com a cotação aprovada mais recente do mesmo cliente, quando existir.
    const isRenewal = data.clientData?.renovacao === true || data.clientData?.renovacao === 'true';
    let renewedFromCotacaoId: string | null = null;
    if (isRenewal) {
      const [previous] = await sql`
        SELECT id FROM cotacoes
        WHERE client_id = ${client.id} AND status = 'aprovada'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      renewedFromCotacaoId = previous?.id || null;
    }

    const [cotacao] = await sql`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        partner_user_id,
        product_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        client_data,
        importancia_segurada,
        premio_calculado,
        status,
        notes,
        flow_type,
        source_token,
        is_renewal,
        renewed_from_cotacao_id
      )
      VALUES (
        ${client.id},
        ${targetPartnerId},
        ${userId},
        ${product.id},
        ${data.clientName},
        ${data.clientCpfCnpj},
        ${data.clientEmail || null},
        ${data.clientPhone || null},
        ${JSON.stringify(clientDataFinal)}::jsonb,
        ${data.importanciaSegurada || null},
        ${premioCalculado},
        'rascunho',
        ${data.notes || null},
        ${flowType},
        ${sourceToken},
        ${isRenewal},
        ${renewedFromCotacaoId}
      )
      RETURNING id, status, created_at
    `;

    if (publicToken) {
      await sql`
        UPDATE public_sale_links
        SET used_at = COALESCE(used_at, NOW()),
            updated_at = NOW()
        WHERE token = ${publicToken}
      `;
    }

    return Response.json({ ok: true, cotacao }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'cotacoes.create.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
