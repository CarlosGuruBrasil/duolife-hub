import { sql } from './pg';
import { logger } from './logger';
import { getZapSignConfig, sanitizeApiToken } from './system-settings';
import { parseJsonbField } from './json-safe';

export interface ZapSignReconcileOptions {
  onlyPending?: boolean;
  limit?: number;
  concurrency?: number;
  docTokens?: string[];
}

export interface ZapSignReconcileResult {
  totalTokensFound: number;
  totalProcessed: number;
  updatedToSigned: number;
  alreadySigned: number;
  stillPending: number;
  notFoundOrError: number;
  durationMs: number;
  details: Array<{
    docToken: string;
    cotacaoId?: string;
    clientName?: string;
    statusBefore?: string;
    statusZapSign?: string;
    signedFileUrl?: string | null;
    action: 'updated_to_signed' | 'already_signed' | 'still_pending' | 'error' | 'skipped';
    error?: string;
  }>;
}

export interface ZapSignSyncSummary {
  totalTokens: number;
  signedTokens: number;
  pendingTokens: number;
}

/**
 * Consulta contadores agregados de tokens da ZapSign no sistema.
 */
export async function getZapSignSyncStatus(): Promise<ZapSignSyncSummary> {
  const [counts] = await sql<Array<{ total_tokens: number; signed_tokens: number; pending_tokens: number }>>`
    WITH tokens_union AS (
      SELECT 
        sd.id AS sig_id,
        sd.cotacao_id,
        sd.external_document_id AS token,
        sd.status AS sig_status
      FROM signature_documents sd
      WHERE sd.provider = 'zapsign'
        AND sd.external_document_id IS NOT NULL
        AND sd.external_document_id != ''
        AND sd.external_document_id NOT LIKE 'CSV-ZAP-%'
        AND sd.external_document_id NOT LIKE 'WIX-ZAP-%'

      UNION

      SELECT
        NULL AS sig_id,
        c.id AS cotacao_id,
        COALESCE(c.client_data->>'contratoToken', c.client_data->>'tokenZapsign') AS token,
        c.status AS sig_status
      FROM cotacoes c
      WHERE (c.client_data->>'contratoToken' IS NOT NULL OR c.client_data->>'tokenZapsign' IS NOT NULL)
        AND COALESCE(c.client_data->>'contratoToken', c.client_data->>'tokenZapsign') NOT LIKE 'CSV-ZAP-%'
        AND COALESCE(c.client_data->>'contratoToken', c.client_data->>'tokenZapsign') NOT LIKE 'WIX-ZAP-%'
    )
    SELECT
      COUNT(DISTINCT token)::int AS total_tokens,
      COUNT(DISTINCT CASE WHEN sig_status = 'signed' THEN token END)::int AS signed_tokens,
      COUNT(DISTINCT CASE WHEN sig_status != 'signed' OR sig_status IS NULL THEN token END)::int AS pending_tokens
    FROM tokens_union
  `;

  return {
    totalTokens: counts?.total_tokens || 0,
    signedTokens: counts?.signed_tokens || 0,
    pendingTokens: counts?.pending_tokens || 0,
  };
}

/**
 * Executa reconciliação em lote dos contratos cadastrados consultando a API da ZapSign.
 */
export async function reconcileZapSignDocuments(
  options?: ZapSignReconcileOptions
): Promise<ZapSignReconcileResult> {
  const startTime = Date.now();
  const onlyPending = options?.onlyPending ?? true;
  const limit = Math.max(1, Math.min(options?.limit ?? 500, 2000));
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 10));

  // 1. Obtém credenciais da ZapSign
  const zapConfig = await getZapSignConfig();
  const token = sanitizeApiToken(zapConfig.apiToken);
  const baseUrl = zapConfig.baseUrl;

  if (!token) {
    throw new Error(
      'Token da API da ZapSign não está configurado. Cadastre o token em Configurações > Chaves de API (/admin/chaves-api).'
    );
  }

  // 2. Busca contratos no banco com token ZapSign
  interface CandidateDoc {
    sig_doc_id: string | null;
    cotacao_id: string;
    client_id: string | null;
    external_document_id: string;
    sig_status: string | null;
    signed_file_url: string | null;
    quote_status: string;
    client_name: string | null;
    client_data: unknown;
    has_orders: boolean;
  }

  const rawCandidates = await sql<CandidateDoc[]>`
    SELECT 
      sd.id AS sig_doc_id,
      c.id AS cotacao_id,
      c.client_id,
      COALESCE(sd.external_document_id, c.client_data->>'contratoToken', c.client_data->>'tokenZapsign') AS external_document_id,
      sd.status AS sig_status,
      sd.signed_file_url,
      c.status AS quote_status,
      c.client_name,
      c.client_data,
      EXISTS (SELECT 1 FROM payment_orders po WHERE po.cotacao_id = c.id) AS has_orders
    FROM cotacoes c
    LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id AND sd.provider = 'zapsign'
    WHERE (
      (sd.external_document_id IS NOT NULL AND sd.external_document_id != '' AND sd.external_document_id NOT LIKE '%-ZAP-%')
      OR (c.client_data->>'contratoToken' IS NOT NULL AND c.client_data->>'contratoToken' != '' AND c.client_data->>'contratoToken' NOT LIKE '%-ZAP-%')
      OR (c.client_data->>'tokenZapsign' IS NOT NULL AND c.client_data->>'tokenZapsign' != '' AND c.client_data->>'tokenZapsign' NOT LIKE '%-ZAP-%')
    )
    ${options?.docTokens && options.docTokens.length > 0 ? sql`AND COALESCE(sd.external_document_id, c.client_data->>'contratoToken', c.client_data->>'tokenZapsign') IN ${sql(options.docTokens)}` : sql``}
    ${onlyPending ? sql`AND (sd.status IS NULL OR sd.status != 'signed' OR sd.signed_file_url IS NULL OR c.status IN ('rascunho', 'enviada', 'contrato_gerado'))` : sql``}
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;

  // Remove duplicidades de token mantendo o registro mais relevante
  const tokenMap = new Map<string, CandidateDoc>();
  for (const item of rawCandidates) {
    const t = String(item.external_document_id).trim();
    if (t && !tokenMap.has(t)) {
      tokenMap.set(t, item);
    }
  }

  const candidates = Array.from(tokenMap.values());

  const result: ZapSignReconcileResult = {
    totalTokensFound: candidates.length,
    totalProcessed: 0,
    updatedToSigned: 0,
    alreadySigned: 0,
    stillPending: 0,
    notFoundOrError: 0,
    durationMs: 0,
    details: [],
  };

  if (candidates.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // 3. Processamento concorrente controlado
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < candidates.length) {
      const doc = candidates[currentIndex++];
      const docToken = doc.external_document_id;

      try {
        // Pausa sutil de 60ms para rate limit amigável
        await new Promise((resolve) => setTimeout(resolve, 60));

        const response = await fetch(`${baseUrl}/docs/${docToken}/`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) {
          const errText = await response.text();
          result.notFoundOrError++;
          result.details.push({
            docToken,
            cotacaoId: doc.cotacao_id,
            clientName: doc.client_name || undefined,
            statusBefore: doc.sig_status || 'pendente',
            action: 'error',
            error: `ZapSign HTTP ${response.status}: ${errText.slice(0, 140)}`,
          });
          continue;
        }

        const zapDoc = await response.json();
        const zapStatus = String(zapDoc.status || '').toLowerCase();
        const isSigned =
          zapStatus === 'completed' ||
          zapStatus === 'signed' ||
          (Array.isArray(zapDoc.signers) &&
            zapDoc.signers.length > 0 &&
            zapDoc.signers.every((s: { status?: string }) => s.status === 'signed'));

        // A API da ZapSign retorna `signed_file` / `original_file` (não `*_url`).
        const signedUrl: string | null =
          zapDoc.signed_file ||
          zapDoc.signed_file_url ||
          zapDoc.original_file ||
          zapDoc.original_file_url ||
          null;

        const signedAtStr =
          zapDoc.signed_at ||
          zapDoc.last_update_at ||
          zapDoc.created_at ||
          new Date().toISOString();

        if (isSigned) {
          // Atualiza ou insere em SIGNATURE_DOCUMENTS
          if (doc.sig_doc_id) {
            await sql`
              UPDATE signature_documents
              SET
                status = 'signed',
                signed_file_url = COALESCE(${signedUrl}, signed_file_url),
                signed_at = COALESCE(signed_at, ${signedAtStr}::timestamptz),
                last_event_type = 'doc_signed',
                raw_payload = ${JSON.stringify(zapDoc)}::jsonb,
                updated_at = NOW()
              WHERE id = ${doc.sig_doc_id}
            `;
          } else {
            await sql`
              INSERT INTO signature_documents (
                cotacao_id,
                client_id,
                provider,
                external_document_id,
                sign_url,
                signed_file_url,
                status,
                signed_at,
                last_event_type,
                raw_payload,
                created_at,
                updated_at
              )
              VALUES (
                ${doc.cotacao_id},
                ${doc.client_id},
                'zapsign',
                ${docToken},
                ${zapDoc.signers?.[0]?.sign_url || null},
                ${signedUrl},
                'signed',
                ${signedAtStr}::timestamptz,
                'doc_signed',
                ${JSON.stringify(zapDoc)}::jsonb,
                NOW(),
                NOW()
              )
              ON CONFLICT (provider, external_document_id)
              DO UPDATE SET
                signed_file_url = COALESCE(EXCLUDED.signed_file_url, signature_documents.signed_file_url),
                status = 'signed',
                signed_at = COALESCE(signature_documents.signed_at, EXCLUDED.signed_at),
                last_event_type = 'doc_signed',
                raw_payload = EXCLUDED.raw_payload,
                updated_at = NOW()
            `;
          }

          // Atualiza cotação
          const clientData = parseJsonbField<Record<string, unknown>>(doc.client_data);
          clientData.contratoToken = docToken;
          if (signedUrl) {
            clientData.contratoPdf = signedUrl;
            clientData.urlAssinado = signedUrl;
          }
          clientData.assinadoEm = clientData.assinadoEm || signedAtStr;

          // Se a cotação estava antes de assinado, avança
          let nextQuoteStatus = doc.quote_status;
          if (['rascunho', 'enviada', 'contrato_gerado'].includes(doc.quote_status)) {
            nextQuoteStatus = doc.has_orders ? 'pagamento_gerado' : 'assinado';
          }

          await sql`
            UPDATE cotacoes
            SET
              client_data = ${JSON.stringify(clientData)}::jsonb,
              status = ${nextQuoteStatus},
              updated_at = NOW()
            WHERE id = ${doc.cotacao_id}
          `;

          // Atualiza cliente
          if (doc.client_id) {
            await sql`
              UPDATE insurance_clients
              SET updated_at = NOW()
              WHERE id = ${doc.client_id}
            `;
          }

          result.updatedToSigned++;
          result.details.push({
            docToken,
            cotacaoId: doc.cotacao_id,
            clientName: doc.client_name || undefined,
            statusBefore: doc.sig_status || 'pendente',
            statusZapSign: zapStatus,
            signedFileUrl: signedUrl,
            action: 'updated_to_signed',
          });
        } else {
          // Documento ainda pendente na ZapSign
          result.stillPending++;
          result.details.push({
            docToken,
            cotacaoId: doc.cotacao_id,
            clientName: doc.client_name || undefined,
            statusBefore: doc.sig_status || 'pendente',
            statusZapSign: zapStatus || 'pending',
            action: 'still_pending',
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result.notFoundOrError++;
        result.details.push({
          docToken,
          cotacaoId: doc.cotacao_id,
          clientName: doc.client_name || undefined,
          statusBefore: doc.sig_status || 'pendente',
          action: 'error',
          error: errMsg,
        });
        logger.warn({ docToken, err }, 'zapsign.reconcile.doc.failed');
      } finally {
        result.totalProcessed++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  result.durationMs = Date.now() - startTime;
  logger.info(
    {
      total: result.totalProcessed,
      updatedToSigned: result.updatedToSigned,
      stillPending: result.stillPending,
      errors: result.notFoundOrError,
      durationMs: result.durationMs,
    },
    'zapsign.reconcile.batch.completed'
  );

  return result;
}
