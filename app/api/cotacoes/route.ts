import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPartnerAccessContext, isPlatformAdmin, isInternalUser, isDevUser, roleIsCorretora, verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';
import { upsertInsuranceClient, handleClientRegistrationIntegrity } from '@/lib/insurance-ops';
import { calcularPrecoServidor } from '@/lib/pricing';
import { getRamoConfig, buildRamoZodSchema } from '@/lib/product-schemas';
import { somenteDigitos } from '@/lib/documento';

const cotacaoSchema = z.object({
  id: z.string().trim().optional().nullable(),
  cotacaoId: z.string().trim().optional().nullable(),
  clientSessionToken: z.string().trim().optional().nullable(),
  clientName: z.string().trim().min(2, 'Nome do proponente deve ter ao menos 2 caracteres'),
  clientCpfCnpj: z
    .string()
    .trim()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length === 11 || val.length === 14, {
      message: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos',
    }),
  clientEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val ? val.trim().toLowerCase() : null))
    .refine(
      (val) => {
        if (!val || val === '') return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      },
      { message: 'Endereço de e-mail informado é inválido' }
    ),
  clientPhone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val ? val.replace(/\D/g, '') : null)),
  importanciaSegurada: z
    .preprocess((val) => {
      if (val === null || val === undefined || val === '' || val === 0 || val === '0') return null;
      if (typeof val === 'string') {
        const parsed = Number(val.replace(/[^\d.,]/g, '').replace(',', '.'));
        return isNaN(parsed) || parsed <= 0 ? null : parsed;
      }
      if (typeof val === 'number') {
        return val <= 0 || isNaN(val) ? null : val;
      }
      return null;
    }, z.number().positive().optional().nullable()),
  notes: z.string().trim().optional().nullable(),
  productId: z.string().trim().min(1).optional().nullable(),
  clientData: z.record(z.string(), z.unknown()).optional().nullable(),
  adminSelectedPartnerId: z.string().trim().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const requestedPartnerId = url.searchParams.get('partnerId');

  // Se for parceiro ou corretora, resolve o contexto de acesso
  let targetPartnerId = user.partnerId;
  let access = null;
  if (isInternalUser(user)) {
    targetPartnerId = requestedPartnerId || null;
  } else {
    access = await getPartnerAccessContext(user);
    if (!access) return unauthorized();
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

    const cotacoes = isInternalUser(user) && !targetPartnerId
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
      : access?.isCorretoraUser
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
            WHERE (c.corretora_id = ${access.corretoraId} OR c.partner_id IN (SELECT id FROM partners WHERE corretora_id = ${access.corretoraId}))
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
        : access.visibleUserIds.length === 0
          ? []
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
              AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL)
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
    let publicLinkId: string | null = null;
    let sourceToken: string | null = null;
    let flowType = 'internal';
    let publicLinkProductId: string | null = null;
    let publicLinkDiscountPercent = 0;
    let isInternal = false;
    let canBypassProductAvailability = false;
    let user: any = null;
    let access: Awaited<ReturnType<typeof getPartnerAccessContext>> = null;

    let publicLinkData: any = null;

    if (publicToken) {
      const [link] = await sql`
        SELECT
          id, partner_id, flow_type, product_id, status, expires_at, created_by_user_id,
          COALESCE(discount_percent, 0) AS discount_percent,
          COALESCE(is_exclusive, false) AS is_exclusive,
          target_document, target_name, max_uses, COALESCE(used_count, 0) AS used_count
        FROM public_sale_links
        WHERE token = ${publicToken}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });

      if (link.max_uses && Number(link.used_count || 0) >= Number(link.max_uses)) {
        return Response.json({ error: 'Este link de contratação já atingiu o limite de utilizações permitidas' }, { status: 404 });
      }

      publicLinkData = link;
      publicLinkId = link.id;
      targetPartnerId = link.partner_id;
      userId = link.created_by_user_id || null;
      publicLinkProductId = link.product_id;
      publicLinkDiscountPercent = Number(link.discount_percent || 0);
      sourceToken = publicToken;
      flowType = link.flow_type || 'external';
    }

    const payloadBody = await req.json();
    const parsed = cotacaoSchema.safeParse(payloadBody);
    if (!parsed.success) {
      const issuesSummary = parsed.error.issues
        .map((issue) => {
          const path = issue.path.join('.') || 'campo';
          return `${path}: ${issue.message}`;
        })
        .join('; ');
      logger.warn(
        { issues: parsed.error.issues, payload: payloadBody },
        'cotacoes.create.validation_failed'
      );
      return Response.json(
        {
          error: `Dados da cotação inválidos (${issuesSummary})`,
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }
    const data = parsed.data as any;

    if (publicLinkData?.is_exclusive && publicLinkData?.target_document) {
      if (somenteDigitos(data.clientCpfCnpj) !== somenteDigitos(publicLinkData.target_document)) {
        return Response.json(
          { error: 'Este link de contratação exclusivo foi emitido para outro titular/documento.' },
          { status: 422 }
        );
      }
    }

    if (!publicToken) {
      user = await verifyAuth();
      if (!user) return unauthorized();

      userId = user.userId;
      targetPartnerId = user.partnerId;
      isInternal = isInternalUser(user);
      canBypassProductAvailability = isPlatformAdmin(user) || isDevUser(user);

      if (! isInternal) {
        access = await getPartnerAccessContext(user);
      }

      if (isInternal) {
        if (!data.adminSelectedPartnerId) {
          // Fallback resiliente: busca parceiro DuoLife (Venda Direta) ou o primeiro ativo
          const [duolifePartner] = await sql`
            SELECT id FROM partners
            WHERE status = 'active'
              AND (nome_fantasia ILIKE '%duolife%' OR razao_social ILIKE '%duolife%')
            ORDER BY created_at ASC
            LIMIT 1
          `;
          if (duolifePartner?.id) {
            targetPartnerId = duolifePartner.id;
          } else {
            const [firstActive] = await sql`
              SELECT id FROM partners WHERE status = 'active' ORDER BY created_at ASC LIMIT 1
            `;
            targetPartnerId = firstActive?.id || null;
          }

          if (!targetPartnerId) {
            return Response.json(
              { error: 'Administradores precisam informar o Parceiro dono da cotação' },
              { status: 400 }
            );
          }
        } else {
          targetPartnerId = data.adminSelectedPartnerId;
        }

        const [pu] = await sql`
          SELECT id FROM partner_users
          WHERE partner_id = ${targetPartnerId}
          ORDER BY created_at ASC
          LIMIT 1
        `;
        userId = pu?.id || user.userId;
      } else if (roleIsCorretora(user.role)) {
        canBypassProductAvailability = true;
        if (data.adminSelectedPartnerId) {
          const [partnerCheck] = await sql`
            SELECT id FROM partners WHERE id = ${data.adminSelectedPartnerId} AND corretora_id = ${user.corretoraId || null} LIMIT 1
          `;
          if (partnerCheck) {
            targetPartnerId = partnerCheck.id;
          }
        }
        if (!targetPartnerId && user.corretoraId) {
          const [defaultPartner] = await sql`
            SELECT id FROM partners WHERE corretora_id = ${user.corretoraId || null} ORDER BY created_at ASC LIMIT 1
          `;
          targetPartnerId = defaultPartner?.id || null;
        }
        if (targetPartnerId) {
          const [pu] = await sql`
            SELECT id FROM partner_users WHERE partner_id = ${targetPartnerId} ORDER BY created_at ASC LIMIT 1
          `;
          userId = pu?.id || user.userId;
        }
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
          SELECT id, flow_key, pricing_strategy, code, category
          FROM products
          WHERE id = ${requestedProductId} AND is_active = true AND is_quoteable = true
        `
      : await sql`
          SELECT p.id, p.flow_key, p.pricing_strategy, p.code, p.category
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

    const isMedProduct =
      product.id === 'prod-rc-med-001' ||
      product.code === 'RC-MED-001' ||
      product.flow_key === 'rc_medicos_v1' ||
      product.flow_key === 'rc-medicos';

    if (isMedProduct) {
      const allowed = (user && (isDevUser(user) || isPlatformAdmin(user))) || Boolean(publicLinkId);
      if (!allowed) {
        return Response.json(
          { error: 'O seguro RC Médico encontra-se em desenvolvimento e ainda não está liberado para venda por parceiros.' },
          { status: 403 }
        );
      }
    }

    const ramoConfig = getRamoConfig({
      flowKey: product.flow_key,
      code: product.code,
      category: product.category,
    });

    if (!ramoConfig) {
      return Response.json({ error: 'O fluxo deste produto ainda não está disponível' }, { status: 422 });
    }

    const clientDataInput = (data.clientData || {}) as Record<string, any>;

    const addressFromInput = (clientDataInput.cep || clientDataInput.logradouro) ? {
      cep: clientDataInput.cep || '',
      logradouro: clientDataInput.logradouro || '',
      numero: clientDataInput.numero || '',
      complemento: clientDataInput.complemento || '',
      bairro: clientDataInput.bairro || '',
      cidade: clientDataInput.cidade || '',
      uf: String(clientDataInput.uf || '').toUpperCase(),
    } : undefined;

    // Constrói metadata com o conselho profissional adequado ao ramo (ex: crm, oab, cro, etc.)
    const clientMetadata: Record<string, any> = {
      source: publicToken ? 'public_link' : 'portal',
      partnerId: targetPartnerId,
      ramoId: ramoConfig.ramoId,
      ...(clientDataInput.dataAtividade ? { dataAtividade: clientDataInput.dataAtividade } : {}),
      ...(addressFromInput ? { address: addressFromInput } : {}),
    };

    if (ramoConfig.registroProfissional) {
      const regKey = ramoConfig.registroProfissional.key;
      const regUfKey = ramoConfig.registroProfissional.ufKey;
      const regVal = clientDataInput[regKey] || clientDataInput.registroProfissionalNumero;
      const regUfVal = (regUfKey ? clientDataInput[regUfKey] : null) || clientDataInput.registroProfissionalUf;

      if (regVal) clientMetadata[regKey] = regVal;
      if (regUfKey && regUfVal) clientMetadata[regUfKey] = regUfVal;
    }

    // Preserva OAB retrocompatível caso preenchido
    if (clientDataInput.oab && !clientMetadata.oab) {
      clientMetadata.oab = clientDataInput.oab;
    }

    const clientSessionToken = data.clientSessionToken || req.headers.get('x-client-session-token') || null;

    const integrityResult = await handleClientRegistrationIntegrity({
      documentNumber: data.clientCpfCnpj,
      fullName: data.clientName,
      email: data.clientEmail || null,
      phone: data.clientPhone || null,
      birthDate: typeof clientDataInput.dataNascto === 'string' ? clientDataInput.dataNascto : null,
      metadata: clientMetadata,
      clientSessionToken,
      isPublicRegistration: Boolean(publicToken),
    });

    const client = integrityResult.client;
    const initialStatus = integrityResult.hasDuplicateConflict ? 'pendente_duplicidade' : 'rascunho';

    // Inicializa validador de integridade do ramo (buildRamoZodSchema)
    const ramoSchema = buildRamoZodSchema(ramoConfig);
    if (clientDataInput.logradouro && clientDataInput.tipoDePlano) {
      const validationData = {
        ...clientDataInput,
        nome: data.clientName || clientDataInput.nome,
        cpfCnpj: data.clientCpfCnpj || clientDataInput.cpfCnpj,
        email: data.clientEmail || clientDataInput.email,
        celular: data.clientPhone || clientDataInput.celular,
        tipoDePlano: clientDataInput.tipoDePlano || clientDataInput.tipo,
        qtdParcelas: Number(clientDataInput.parcela) || 1,
      };
      const parseResult = ramoSchema.safeParse(validationData);
      if (!parseResult.success) {
        logger.warn({ issues: parseResult.error.issues, ramoId: ramoConfig.ramoId }, 'cotacoes.ramo_schema.validation_warning');
      }
    }

    // Se a cotação veio por link público de autocadastro do cliente (publicToken),
    // o desconto é estritamente o determinado pelo vendedor na criação do link exclusivo.
    // Cupons e descontos manuais enviados no corpo da requisição são ignorados para prevenir fraudes.
    const effectiveDescontoPercent = publicToken
      ? publicLinkDiscountPercent
      : (Number(clientDataInput.descontoManualPercent) || 0);
    const effectiveCupomCodigo = publicToken ? null : (clientDataInput.cupomCodigo as string | null | undefined);

    const preco = await calcularPrecoServidor({
      tipoDePlano: (clientDataInput.tipo as string) || (clientDataInput.tipoDePlano as string) || null,
      qtdParcelasSolicitada: Number(clientDataInput.parcela) || 1,
      cupomCodigo: effectiveCupomCodigo,
      descontoManualPercent: effectiveDescontoPercent,
      flowKey: product.flow_key || (clientDataInput.flowKey as string) || null,
      productId: product.id,
      grupoTarifario: (clientDataInput.grupoTarifario as string) || (clientDataInput.grupo as string) || null,
    });

    if (!preco) {
      return Response.json({ error: 'Não foi possível calcular o preço do plano selecionado' }, { status: 422 });
    }

    const normalizeSimNao = (val: unknown): 'Sim' | 'Não' => {
      if (val === true || val === 1) return 'Sim';
      if (typeof val === 'string') {
        const norm = val.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (norm === 'sim' || norm === 's' || norm === 'true' || norm === '1' || norm === 'yes') return 'Sim';
      }
      return 'Não';
    };

    const clientDataFinal = {
      ...clientDataInput,
      propostaRecusada: normalizeSimNao(clientDataInput.propostaRecusada),
      reclamacaoProfissional: normalizeSimNao(clientDataInput.reclamacaoProfissional),
      investigacaoAutoridade: normalizeSimNao(clientDataInput.investigacaoAutoridade),
      fatoTerceiros: normalizeSimNao(clientDataInput.fatoTerceiros),
      pagouReclamacao: normalizeSimNao(clientDataInput.pagouReclamacao),
      valor: preco.valorTotal,
      valorOriginal: preco.valorOriginal,
      valorDesconto: preco.valorDesconto,
      descontoPercentual: preco.descontoPercentual,
      descontoManualPercent: effectiveDescontoPercent,
      valorParcela: preco.valorParcela,
      parcela: preco.qtdParcelas,
      linkToken: publicToken || null,
      linkDescontoPreAplicado: publicToken ? publicLinkDiscountPercent : undefined,
    };
    const premioCalculado = preco.valorTotal;

    const [partnerCorretora] = targetPartnerId ? await sql<{ corretora_id: string | null }[]>`
      SELECT corretora_id FROM partners WHERE id = ${targetPartnerId} LIMIT 1
    ` : [];
    const targetCorretoraId = user?.corretoraId || access?.corretoraId || partnerCorretora?.corretora_id || null;

    // Renovação como conceito de primeira classe (não só uma flag solta em client_data.renovacao).
    // Tenta linkar com a cotação aprovada/emitida mais recente do mesmo cliente, quando existir.
    const isRenewal = data.clientData?.renovacao === true || data.clientData?.renovacao === 'true' || data.clientData?.isRenovacao === 'Sim';
    let renewedFromCotacaoId: string | null = null;
    if (isRenewal) {
      const [previous] = await sql`
        SELECT c.id FROM cotacoes c
        JOIN products p ON p.id = c.product_id
        WHERE c.client_id = ${client.id}
          AND c.status IN ('aprovada', 'emitida', 'assinado', 'pagamento_gerado')
          AND (c.product_id = ${product.id} OR p.flow_key = ${product.flow_key})
          AND (${isInternal ? sql`TRUE` : access?.isCorretoraUser ? sql`c.corretora_id = ${targetCorretoraId}` : sql`c.partner_id = ${targetPartnerId}`})
        ORDER BY c.created_at DESC
        LIMIT 1
      `;
      renewedFromCotacaoId = previous?.id || null;
    }
    
    // Se for continuidade de uma cotação existente, atualiza os dados em vez de criar duplicada
    const existingId = data.cotacaoId || data.id;
    if (existingId) {
      // Valida posse e permissão da cotação (blindagem contra IDOR)
      const [existingQuote] = publicToken
        ? await sql`
            SELECT id, status FROM cotacoes
            WHERE id = ${existingId}
              AND source_token = ${publicToken}
              AND partner_id = ${targetPartnerId}
            LIMIT 1
          `
        : isInternal
          ? await sql`
              SELECT id, status FROM cotacoes
              WHERE id = ${existingId}
              LIMIT 1
            `
          : access?.isCorretoraUser
            ? await sql`
                SELECT id, status FROM cotacoes
                WHERE id = ${existingId}
                  AND (partner_id = ${targetPartnerId} OR corretora_id = ${targetCorretoraId})
                LIMIT 1
              `
            : access?.visibleUserIds?.length
              ? await sql`
                  SELECT id, status FROM cotacoes
                  WHERE id = ${existingId}
                    AND partner_id = ${targetPartnerId}
                    AND (partner_user_id IN ${sql(access.visibleUserIds)} OR partner_user_id IS NULL)
                  LIMIT 1
                `
              : await sql`
                  SELECT id, status FROM cotacoes
                  WHERE id = ${existingId}
                    AND partner_id = ${targetPartnerId}
                  LIMIT 1
                `;

      if (!existingQuote) {
        return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
      }

      if (!['rascunho', 'enviada'].includes(existingQuote.status)) {
        return Response.json(
          { error: `Esta cotação já está no estado '${existingQuote.status}' e não pode mais ser alterada` },
          { status: 422 }
        );
      }

      const [updatedCotacao] = await sql`
        UPDATE cotacoes
        SET
          client_id = ${client.id},
          client_name = ${data.clientName},
          client_cpf_cnpj = ${data.clientCpfCnpj},
          client_email = ${data.clientEmail || null},
          client_phone = ${data.clientPhone || null},
          client_data = ${JSON.stringify(clientDataFinal)}::jsonb,
          importancia_segurada = ${data.importanciaSegurada || null},
          premio_calculado = ${premioCalculado},
          notes = ${data.notes || null},
          is_renewal = ${isRenewal},
          renewed_from_cotacao_id = ${renewedFromCotacaoId},
          updated_at = NOW()
        WHERE id = ${existingId}
        RETURNING id, status, created_at
      `;

      if (updatedCotacao) {
        return Response.json({ ok: true, cotacao: updatedCotacao }, { status: 200 });
      }
    }

    const [cotacao] = await sql`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        corretora_id,
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
        cadastral_conflict,
        notes,
        flow_type,
        source_token,
        is_renewal,
        renewed_from_cotacao_id
      )
      VALUES (
        ${client.id},
        ${targetPartnerId},
        ${targetCorretoraId},
        ${userId},
        ${product.id},
        ${data.clientName},
        ${data.clientCpfCnpj},
        ${data.clientEmail || null},
        ${data.clientPhone || null},
        ${JSON.stringify(clientDataFinal)}::jsonb,
        ${data.importanciaSegurada || null},
        ${premioCalculado},
        ${initialStatus},
        ${integrityResult.cadastralConflict ? JSON.stringify(integrityResult.cadastralConflict) : null}::jsonb,
        ${data.notes || null},
        ${flowType},
        ${sourceToken},
        ${isRenewal},
        ${renewedFromCotacaoId}
      )
      RETURNING id, status, created_at, cadastral_conflict
    `;

    if (publicToken) {
      await sql`
        UPDATE public_sale_links
        SET used_at = COALESCE(used_at, NOW()),
            used_count = COALESCE(used_count, 0) + 1,
            status = CASE
              WHEN max_uses IS NOT NULL AND (COALESCE(used_count, 0) + 1) >= max_uses THEN 'used'
              ELSE status
            END,
            updated_at = NOW()
        WHERE token = ${publicToken}
      `;
    }

    return Response.json(
      {
        ok: true,
        cotacao,
        duplicateConflict: integrityResult.hasDuplicateConflict,
        clientSessionToken: integrityResult.clientSessionToken,
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err }, 'cotacoes.create.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
