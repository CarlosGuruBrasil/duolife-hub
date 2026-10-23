import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { verifyWebhookToken } from '@/lib/webhook-auth';
import { parseJsonbField } from '@/lib/json-safe';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { identificarRequisitosAssinatura } from '@/lib/assinatura-status';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-zapsign-webhook-secret, x-webhook-secret, Authorization',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'DuoLife Hub - ZapSign Webhook Service',
    status: 'active',
    methodAllowed: ['POST'],
    message: 'Endpoint ativo e pronto para receber notificações de webhook da ZapSign.',
    timestamp: new Date().toISOString(),
  });
}

async function isAuthorized(req: NextRequest) {
  const zapConfig = await getZapSignConfig();
  const secret = (zapConfig.webhookSecret || process.env.ZAPSIGN_WEBHOOK_SECRET || '').trim();

  // Se nenhum segredo foi configurado no sistema ou no ambiente, o endpoint opera
  // no modo público padrão do painel da ZapSign
  if (!secret) return true;

  // 1. Cabeçalho HTTP customizado
  const headerSecret =
    req.headers.get('x-zapsign-webhook-secret') ||
    req.headers.get('x-webhook-secret');
  if (headerSecret && verifyWebhookToken(headerSecret, secret)) return true;

  // 2. Cabeçalho de autorização Bearer
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (bearer && verifyWebhookToken(bearer, secret)) return true;

  // 3. Query string (ex: /api/webhook/zapsign?secret=... ou ?token=... ou ?key=...)
  const querySecret =
    req.nextUrl.searchParams.get('secret') ||
    req.nextUrl.searchParams.get('token') ||
    req.nextUrl.searchParams.get('key');
  if (querySecret && verifyWebhookToken(querySecret, secret)) return true;

  return false;
}

function normalizeStatus(payload: any, eventType?: string) {
  const raw =
    payload?.status ||
    payload?.document?.status ||
    payload?.doc?.status ||
    payload?.event?.status ||
    eventType ||
    '';

  const s = String(raw || 'pending').toLowerCase();
  if (['completed', 'signed', 'doc_signed'].includes(s)) return 'signed';
  if (['signer_signed', 'signature_signed'].includes(s)) return 'signer_signed';
  if (['expired', 'deadline_exceeded', 'doc_expired'].includes(s)) return 'expired';
  if (['refused', 'rejected', 'signature_request_refused', 'signature_refused', 'doc_refused'].includes(s)) return 'refused';
  if (['canceled', 'cancelled', 'doc_deleted'].includes(s)) return 'canceled';
  return s;
}

function extractDocumentId(payload: any) {
  return (
    payload?.doc_token ||
    payload?.document?.doc_token ||
    payload?.document?.token ||
    payload?.doc?.token ||
    payload?.token ||
    null
  );
}

function extractExternalId(payload: any) {
  return (
    payload?.external_id ||
    payload?.document?.external_id ||
    payload?.doc?.external_id ||
    null
  );
}

function extractSignedFileUrl(payload: any) {
  return (
    payload?.signed_file ||
    payload?.signed_file_url ||
    payload?.document?.signed_file ||
    payload?.document?.signed_file_url ||
    payload?.doc?.signed_file ||
    payload?.doc?.signed_file_url ||
    null
  );
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    logger.warn({ ip: req.headers.get('x-forwarded-for') }, 'zapsign.webhook.unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  let payload: any;
  try {
    payload = await req.json();
  } catch (parseErr) {
    logger.warn({ parseErr }, 'zapsign.webhook.invalid_json');
    return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const eventType = String(
    payload?.event_type ||
      payload?.event ||
      payload?.type ||
      payload?.name ||
      'unknown'
  );
  const externalDocumentId = extractDocumentId(payload);
  const externalId = extractExternalId(payload);
  const normalizedStatus = normalizeStatus(payload, eventType);
  const signedFileUrl = extractSignedFileUrl(payload);

  const docObj = payload.doc || payload.document || payload;
  const rawSignersList: any[] = Array.isArray(docObj?.signers)
    ? docObj.signers
    : Array.isArray(payload.signers)
    ? payload.signers
    : [];

  // Idempotência / Anti-Replay segura:
  // IMPORTANTE: Nunca usar payload.id isolado porque no ZapSign payload.id é o ID numérico do documento
  // e todas as notificações subsequentes (criação, assinaturas parciais, conclusão) compartilham o mesmo ID!
  const signersSummary = rawSignersList
    .map((s: any) => `${s.token || s.email || s.name || ''}:${s.status || ''}`)
    .sort()
    .join(';');
  const lastUpdate = payload?.last_update_at || payload?.signed_at || docObj?.last_update_at || '';

  const eventUniqueKey = payload?.event_id || payload?.webhook_id
    ? String(payload.event_id || payload.webhook_id)
    : `${eventType}:${externalDocumentId || externalId || ''}:${normalizedStatus}:${signersSummary}:${lastUpdate}`;

  const [existingProcessed] = await sql<{ id: string }[]>`
    SELECT id FROM webhook_events
    WHERE provider = 'zapsign' AND external_id = ${eventUniqueKey} AND processed = true
    LIMIT 1
  `;
  if (existingProcessed) {
    logger.info({ eventUniqueKey }, 'ZapSign Webhook replay descartado (evento já processado)');
    return NextResponse.json({ ok: true, ignored: true, message: 'Evento já processado com sucesso' });
  }

  const requestHeaders: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    if (!['authorization', 'x-zapsign-webhook-secret', 'x-webhook-secret'].includes(key.toLowerCase())) {
      requestHeaders[key] = val;
    }
  });

  const [eventRow] = await sql<{ id: string }[]>`
    INSERT INTO webhook_events (
      provider,
      event_type,
      external_id,
      signature_valid,
      payload,
      request_headers,
      processed
    )
    VALUES (
      'zapsign',
      ${eventType},
      ${eventUniqueKey},
      true,
      ${JSON.stringify(payload)}::jsonb,
      ${JSON.stringify(requestHeaders)}::jsonb,
      false
    )
    RETURNING id
  `;

  try {
    // 1. Localização em cascata do Documento e da Cotação correspondente
    let documentRow: { id: string; cotacao_id: string } | null = null;

    if (externalDocumentId) {
      const docs = await sql<{ id: string; cotacao_id: string }[]>`
        SELECT id, cotacao_id
        FROM signature_documents
        WHERE provider = 'zapsign'
          AND external_document_id = ${externalDocumentId}
        LIMIT 1
      `;
      if (docs.length > 0) documentRow = docs[0];
    }

    if (!documentRow && externalId) {
      const docs = await sql<{ id: string; cotacao_id: string }[]>`
        SELECT id, cotacao_id
        FROM signature_documents
        WHERE provider = 'zapsign'
          AND cotacao_id = ${externalId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (docs.length > 0) documentRow = docs[0];
    }

    let cotacaoId = documentRow?.cotacao_id || null;

    // Fallback: se não localizado na signature_documents, busca diretamente na tabela cotacoes
    if (!cotacaoId) {
      const cotacoesEncontradas = await sql<{ id: string }[]>`
        SELECT id
        FROM cotacoes
        WHERE id = ${externalId || null}
           OR client_data->>'contratoToken' = ${externalDocumentId || null}
           OR client_data->>'tokenZapsign' = ${externalDocumentId || null}
        LIMIT 1
      `;

      if (cotacoesEncontradas.length > 0) {
        cotacaoId = cotacoesEncontradas[0].id;
        const [newDoc] = await sql<{ id: string; cotacao_id: string }[]>`
          INSERT INTO signature_documents (
            cotacao_id,
            provider,
            external_document_id,
            status,
            created_at,
            updated_at
          )
          VALUES (
            ${cotacaoId},
            'zapsign',
            ${externalDocumentId || 'ZAP-' + cotacaoId},
            'pending',
            NOW(),
            NOW()
          )
          ON CONFLICT (provider, external_document_id)
          DO UPDATE SET updated_at = NOW()
          RETURNING id, cotacao_id
        `;
        documentRow = newDoc;
      }
    }

    if (!documentRow || !cotacaoId) {
      await sql`
        UPDATE webhook_events
        SET processed = true,
            error_message = 'Documento ou cotação não encontrados',
            payload = ${JSON.stringify(payload)}::jsonb
        WHERE id = ${eventRow.id}
      `;
      logger.warn({ externalDocumentId, externalId, eventType }, 'zapsign.webhook.document_not_found');
      return NextResponse.json({ ok: true, ignored: true, message: 'Documento não localizado' });
    }

    const [cotacao] = await sql<{ client_data: unknown; status: string; client_name: string; client_email: string; flow_key?: string | null; product_id?: string | null }[]>`
      SELECT client_data, status, client_name, client_email, flow_key, product_id
      FROM cotacoes
      WHERE id = ${cotacaoId}
      LIMIT 1
    `;

    if (!cotacao) {
      await sql`
        UPDATE webhook_events
        SET processed = true,
            error_message = 'Cotação vinculada ao documento não encontrada',
            payload = ${JSON.stringify(payload)}::jsonb
        WHERE id = ${eventRow.id}
      `;
      return NextResponse.json({ ok: true, ignored: true });
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    const clientEmail = (cotacao.client_email || clientData.email || '').toLowerCase().trim();
    const clientName = (cotacao.client_name || clientData.nome || '').toLowerCase().trim();

    // 2. Consulta à API ZapSign para enriquecer o payload caso venha resumido ou sem signatários
    let signersList: any[] = rawSignersList;
    let canonicalStatus = String(docObj?.status || payload?.status || '').toLowerCase();
    let canonicalSignedFile = signedFileUrl;

    const docToken = externalDocumentId || clientData.contratoToken || clientData.tokenZapsign;

    if ((signersList.length === 0 || !canonicalSignedFile) && docToken) {
      try {
        const zapConfig = await getZapSignConfig();
        const apiToken = sanitizeApiToken(zapConfig.apiToken);
        if (apiToken) {
          const apiRes = await fetch(`${zapConfig.baseUrl}/docs/${docToken}/`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiToken}` },
            signal: AbortSignal.timeout(8000),
          });
          if (apiRes.ok) {
            const zapDocFromApi = await apiRes.json();
            if (Array.isArray(zapDocFromApi.signers) && zapDocFromApi.signers.length > 0) {
              signersList = zapDocFromApi.signers;
            }
            if (zapDocFromApi.status) {
              canonicalStatus = String(zapDocFromApi.status).toLowerCase();
            }
            canonicalSignedFile =
              zapDocFromApi.signed_file ||
              zapDocFromApi.signed_file_url ||
              zapDocFromApi.original_file ||
              canonicalSignedFile;
          }
        }
      } catch (apiErr) {
        logger.warn({ apiErr, docToken }, 'zapsign.webhook.api_fallback_warn');
      }
    }

    // 3. Mapeamento preciso dos signatários
    let proponenteSigner = signersList.find((s: any) => {
      const sEmail = (s.email || '').toLowerCase().trim();
      const sName = (s.name || '').toLowerCase().trim();
      return (clientEmail && sEmail === clientEmail) || (clientName && (sName.includes(clientName) || clientName.includes(sName)));
    });

    let corretoraSigner = signersList.find((s: any) => {
      if (s === proponenteSigner) return false;
      const sEmail = (s.email || '').toLowerCase().trim();
      const sName = (s.name || '').toLowerCase().trim();
      return (
        sEmail.includes('net4life.com.br') ||
        sEmail.includes('corretora') ||
        sEmail.includes('duolife') ||
        sName.includes('corretora') ||
        sName.includes('net4life')
      );
    });

    if (signersList.length >= 2) {
      if (!proponenteSigner && corretoraSigner) {
        proponenteSigner = signersList.find((s: any) => s !== corretoraSigner) || signersList[0];
      } else if (proponenteSigner && !corretoraSigner) {
        corretoraSigner = signersList.find((s: any) => s !== proponenteSigner) || signersList[1];
      } else if (!proponenteSigner && !corretoraSigner) {
        proponenteSigner = signersList[0];
        corretoraSigner = signersList[1];
      }
    } else if (signersList.length === 1 && !proponenteSigner) {
      proponenteSigner = signersList[0];
    }

    let proponenteSigned = Boolean(proponenteSigner && proponenteSigner.status === 'signed');
    let corretoraSigned = Boolean(corretoraSigner && corretoraSigner.status === 'signed');
    const signedCount = signersList.filter((s: any) => s.status === 'signed').length;

    // Se o evento trouxe o signatário que acabou de assinar (signer / signatario)
    const signerJustSigned = payload.signer || payload.signatario || null;
    if (signerJustSigned) {
      const sEmail = (signerJustSigned.email || '').toLowerCase().trim();
      const sName = (signerJustSigned.name || '').toLowerCase().trim();
      const isCorretora =
        sEmail.includes('net4life.com.br') ||
        sEmail.includes('corretora') ||
        sEmail.includes('duolife') ||
        sName.includes('corretora') ||
        sName.includes('net4life');

      if (isCorretora) {
        corretoraSigned = true;
      } else {
        proponenteSigned = true;
      }
    }

    // Preserva confirmações prévias já salvas em client_data
    if (clientData.clienteAssinou) proponenteSigned = true;
    if (clientData.corretoraAssinou) corretoraSigned = true;

    const requisitos = identificarRequisitosAssinatura(clientData, cotacao);
    const docStatusFinalizado =
      canonicalStatus === 'signed' ||
      canonicalStatus === 'completed' ||
      normalizedStatus === 'signed';

    let todasAssinadas = false;
    let statusAssinatura: 'todas_assinadas' | 'falta_corretora' | 'falta_cliente' | 'faltam_ambas';

    // 4. Identificação dinâmica do status da assinatura (1 vs 2 assinaturas)
    if (requisitos.total === 1) {
      if (docStatusFinalizado || proponenteSigned || signedCount >= 1) {
        todasAssinadas = true;
        proponenteSigned = true;
        corretoraSigned = true; // Não exigida para 1 assinatura
        statusAssinatura = 'todas_assinadas';
      } else {
        todasAssinadas = false;
        corretoraSigned = true;
        statusAssinatura = 'falta_cliente';
      }
    } else {
      // Contratos com 2 assinaturas obrigatórias (Cliente + Corretora)
      if (docStatusFinalizado || (proponenteSigned && corretoraSigned)) {
        todasAssinadas = true;
        proponenteSigned = true;
        corretoraSigned = true;
        statusAssinatura = 'todas_assinadas';
      } else if (proponenteSigned && !corretoraSigned) {
        statusAssinatura = 'falta_corretora';
      } else if (!proponenteSigned && corretoraSigned) {
        statusAssinatura = 'falta_cliente';
      } else {
        statusAssinatura = 'faltam_ambas';
      }
    }

    // 5. Aplicação das transições no Banco de Dados
    if (todasAssinadas) {
      clientData.statusAssinatura = 'todas_assinadas';
      clientData.clienteAssinou = true;
      clientData.corretoraAssinou = true;
      clientData.totalAssinaturas = requisitos.total;
      clientData.assinaturasNecessarias = requisitos.papeis;
      clientData.contratoModo = requisitos.modo;
      if (canonicalSignedFile) {
        clientData.contratoPdf = canonicalSignedFile;
        clientData.urlAssinado = canonicalSignedFile;
      }
      clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

      await sql`
        UPDATE signature_documents
        SET
          status = 'signed',
          signed_file_url = COALESCE(${canonicalSignedFile}, signed_file_url),
          signed_at = COALESCE(signed_at, NOW()),
          last_event_type = ${eventType},
          raw_payload = ${JSON.stringify(payload)}::jsonb,
          updated_at = NOW()
        WHERE id = ${documentRow.id}
      `;

      // Só avança para 'assinado' se a cotação ainda não progrediu para pagamento_gerado ou estado terminal
      const canAdvanceToAssinado = ['contrato_gerado', 'enviada', 'rascunho'].includes(cotacao.status);

      if (canAdvanceToAssinado) {
        await sql`
          UPDATE cotacoes
          SET
            status = 'assinado',
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacaoId}
        `;
      } else {
        await sql`
          UPDATE cotacoes
          SET
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacaoId}
        `;
      }

      // Dispara gatilho de Contrato Assinado
      try {
        const [cotacaoCompleta] = await sql<{ client_id: string | null; partner_id: string; partner_user_id: string | null; client_name: string; premio_final: number | null; premio_calculado: number | null; importancia_segurada: number }[]>`
          SELECT client_id, partner_id, partner_user_id, client_name, premio_final, premio_calculado, importancia_segurada
          FROM cotacoes
          WHERE id = ${cotacaoId}
          LIMIT 1
        `;

        const [clientRow] = cotacaoCompleta?.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
          SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacaoCompleta.client_id} LIMIT 1
        ` : [];

        const [vendedorRow] = cotacaoCompleta?.partner_user_id ? await sql<{ id: string; nome: string; email: string }[]>`
          SELECT id, name AS nome, email
          FROM partner_users
          WHERE id = ${cotacaoCompleta.partner_user_id}
          LIMIT 1
        ` : [];

        const [partnerRow] = cotacaoCompleta?.partner_id ? await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
          SELECT
            COALESCE(p.nome_fantasia, p.razao_social) AS nome,
            COALESCE(NULLIF(p.email, ''), pu.email) AS email,
            p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
          FROM partners p
          LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
          WHERE p.id = ${cotacaoCompleta.partner_id}
          ORDER BY pu.created_at ASC
          LIMIT 1
        ` : [];

        await dispatchDomainEvent('CONTRATO_ASSINADO', {
          eventType: 'CONTRATO_ASSINADO',
          contextId: cotacaoId,
          cliente: {
            nome: clientRow?.full_name || cotacaoCompleta?.client_name,
            email: clientRow?.email || clientData.email,
            documento: clientRow?.document_number || clientData.cpf || clientData.cnpj,
            telefone: clientRow?.phone || clientData.telefone,
          },
          vendedor: vendedorRow
            ? {
                id: vendedorRow.id,
                nome: vendedorRow.nome,
                email: vendedorRow.email,
              }
            : partnerRow
            ? {
                id: cotacaoCompleta.partner_user_id || cotacaoCompleta.partner_id,
                nome: partnerRow.nome,
                email: partnerRow.email,
              }
            : undefined,
          parceiro: partnerRow ? {
            id: cotacaoCompleta.partner_id,
            nome: partnerRow.nome,
            email: partnerRow.email,
            codigoVenda: partnerRow.codigo_venda,
          } : undefined,
          cotacao: {
            id: cotacaoId,
            status: 'assinado',
            premio_final: Number(cotacaoCompleta?.premio_final || cotacaoCompleta?.premio_calculado) || 0,
            cobertura: Number(cotacaoCompleta?.importancia_segurada) || 0,
          },
          dados: {
            contratoPdf: canonicalSignedFile,
            assinadoEm: clientData.assinadoEm,
          },
        });
      } catch (dispatchErr) {
        logger.error({ dispatchErr, cotacaoId }, 'Falha ao despachar evento CONTRATO_ASSINADO');
      }

      // Regra: Se houver formaPagamentoPreferida pré-registrada, gera a fatura no Asaas automaticamente!
      const [existingOrder] = await sql<{ id: string; status: string }[]>`
        SELECT id, status FROM payment_orders
        WHERE cotacao_id = ${cotacaoId}
          AND status IN ('pending', 'partially_paid', 'paid')
        LIMIT 1
      `;

      if (existingOrder) {
        logger.info(
          { cotacaoId, orderId: existingOrder.id, status: existingOrder.status },
          'zapsign.webhook.asaas_payment_skipped_existing_order'
        );
      } else if (clientData.formaPagamentoPreferida) {
        try {
          const paymentResult = await generateAsaasPaymentForQuote(cotacaoId, { isManualAdmin: false });
          if (paymentResult.ok) {
            logger.info(
              { cotacaoId, checkoutId: paymentResult.checkoutId },
              'zapsign.webhook.asaas_payment_generated'
            );
          } else {
            logger.warn(
              { cotacaoId, reason: paymentResult.error },
              'zapsign.webhook.asaas_payment_retained_or_failed'
            );
          }
        } catch (paymentErr) {
          logger.error(
            { paymentErr, cotacaoId },
            'zapsign.webhook.asaas_payment_exception'
          );
        }
      } else {
        logger.info(
          { cotacaoId },
          'zapsign.webhook.asaas_payment_waiting_preference'
        );
      }
    } else if (statusAssinatura === 'falta_corretora' || statusAssinatura === 'falta_cliente') {
      // Evento de assinatura parcial (1 das partes assinou)
      clientData.statusAssinatura = statusAssinatura;
      clientData.clienteAssinou = proponenteSigned;
      clientData.corretoraAssinou = corretoraSigned;
      clientData.totalAssinaturas = requisitos.total;
      clientData.assinaturasNecessarias = requisitos.papeis;
      clientData.contratoModo = requisitos.modo;

      await sql`
        UPDATE cotacoes
        SET
          client_data = ${JSON.stringify(clientData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${cotacaoId}
      `;

      await sql`
        UPDATE signature_documents
        SET
          last_event_type = ${eventType},
          raw_payload = ${JSON.stringify(payload)}::jsonb,
          updated_at = NOW()
        WHERE id = ${documentRow.id}
      `;

      logger.info(
        { cotacaoId, statusAssinatura, clienteAssinou: proponenteSigned, corretoraAssinou: corretoraSigned },
        'zapsign.webhook.partial_signature_recorded'
      );
    } else if (normalizedStatus === 'expired') {
      await sql`
        UPDATE signature_documents
        SET status = 'expired', updated_at = NOW(), raw_payload = ${JSON.stringify(payload)}::jsonb
        WHERE id = ${documentRow.id}
      `;

      await sql`
        UPDATE cotacoes
        SET status = 'expirada', updated_at = NOW()
        WHERE id = ${cotacaoId}
          AND status IN ('contrato_gerado', 'enviada', 'rascunho')
      `;
      logger.info({ cotacaoId }, 'zapsign.webhook.quote_expired');
    } else if (normalizedStatus === 'refused') {
      await sql`
        UPDATE signature_documents
        SET status = 'refused', updated_at = NOW(), raw_payload = ${JSON.stringify(payload)}::jsonb
        WHERE id = ${documentRow.id}
      `;

      await sql`
        UPDATE cotacoes
        SET status = 'recusada', updated_at = NOW()
        WHERE id = ${cotacaoId}
          AND status IN ('contrato_gerado', 'enviada', 'rascunho')
      `;
      logger.info({ cotacaoId }, 'zapsign.webhook.quote_refused');
    }

    await sql`
      UPDATE webhook_events
      SET processed = true, error_message = NULL
      WHERE id = ${eventRow.id}
    `;

    logger.info(
      { eventType, externalDocumentId, cotacaoId, statusAssinatura, todasAssinadas },
      'zapsign.webhook.processed'
    );
    return NextResponse.json({ ok: true, statusAssinatura, todasAssinadas });
  } catch (err) {
    await sql`
      UPDATE webhook_events
      SET error_message = ${err instanceof Error ? err.message : 'Erro desconhecido'}
      WHERE id = ${eventRow.id}
    `;
    logger.error({ err, eventType, externalDocumentId, externalId }, 'zapsign.webhook.failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
