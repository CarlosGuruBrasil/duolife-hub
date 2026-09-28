import { sql } from '@/lib/pg';
import { safeExternalUrl } from '@/lib/safe-url';
import { parseJsonbField } from '@/lib/json-safe';
import { logger } from '@/lib/logger';

/**
 * Resolve a URL de assinatura ativa do ZapSign a partir de um identificador legado ou token.
 * 
 * Suporta:
 * 1. ID direto da cotação (cotacoes.id)
 * 2. Token de documento ZapSign (signature_documents.external_document_id)
 * 3. Token de origem da cotação (cotacoes.source_token) quando já houver contrato gerado
 * 
 * Retorna a URL segura de assinatura (ex: https://app.zapsign.com.br/verificar/...) ou null se não aplicável.
 */
export async function resolveContratoSignUrl(token: string): Promise<string | null> {
  if (!token || typeof token !== 'string') return null;
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  try {
    // 1. Busca por cotacoes.id
    const [byQuoteId] = await sql<{
      sign_url: string | null;
      external_document_id: string | null;
      client_data: any;
    }[]>`
      SELECT
        sd.sign_url,
        sd.external_document_id,
        c.client_data
      FROM cotacoes c
      LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
      WHERE c.id = ${cleanToken}
      ORDER BY sd.created_at DESC
      LIMIT 1
    `;

    let matchedRow = byQuoteId;

    // 2. Se não achou por cotacoes.id, busca por external_document_id na signature_documents
    if (!matchedRow) {
      const [byDocId] = await sql<{
        sign_url: string | null;
        external_document_id: string | null;
        client_data: any;
      }[]>`
        SELECT
          sd.sign_url,
          sd.external_document_id,
          c.client_data
        FROM signature_documents sd
        JOIN cotacoes c ON c.id = sd.cotacao_id
        WHERE sd.external_document_id = ${cleanToken}
        ORDER BY sd.created_at DESC
        LIMIT 1
      `;
      if (byDocId) matchedRow = byDocId;
    }

    // 3. Se não achou, busca por cotacoes.source_token com status de contrato gerado ou posterior
    if (!matchedRow) {
      const [bySourceToken] = await sql<{
        sign_url: string | null;
        external_document_id: string | null;
        client_data: any;
      }[]>`
        SELECT
          sd.sign_url,
          sd.external_document_id,
          c.client_data
        FROM cotacoes c
        LEFT JOIN signature_documents sd ON sd.cotacao_id = c.id
        WHERE c.source_token = ${cleanToken}
          AND c.status IN ('contrato_gerado', 'assinado', 'signed', 'pagamento_gerado', 'emitida', 'aprovada', 'ativa', 'active')
        ORDER BY c.created_at DESC
        LIMIT 1
      `;
      if (bySourceToken) matchedRow = bySourceToken;
    }

    if (!matchedRow) return null;

    const clientData = parseJsonbField<Record<string, any>>(matchedRow.client_data);

    // Prioridade 1: sign_url explícito em signature_documents ou client_data
    const rawSignUrl = matchedRow.sign_url || (clientData?.signUrl as string | undefined);
    if (rawSignUrl) {
      const safe = safeExternalUrl(rawSignUrl);
      if (safe) return safe;
    }

    // Prioridade 2: token do documento ZapSign
    const docToken =
      matchedRow.external_document_id ||
      clientData?.contratoToken ||
      clientData?.tokenZapsign;

    if (
      docToken &&
      typeof docToken === 'string' &&
      !docToken.includes('/') &&
      !docToken.includes(' ') &&
      docToken.length > 5
    ) {
      return `https://app.zapsign.com.br/verificar/${docToken}`;
    }

    return null;
  } catch (err) {
    logger.warn({ err, token: cleanToken }, 'contrato_link_resolver.error');
    return null;
  }
}
