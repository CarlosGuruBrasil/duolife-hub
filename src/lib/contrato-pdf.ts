import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { sql } from '@/lib/pg';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { logger } from '@/lib/logger';

/** Tokens sintéticos gerados por importações (CSV/Wix) — não existem na ZapSign. */
function isSyntheticToken(token: string): boolean {
  return /-ZAP-/.test(token);
}

function isUsableUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//.test(url) && !url.includes('/verificar/');
}

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function handleContratoPdfRequest(
  req: NextRequest,
  quoteId: string
): Promise<Response> {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const cotacao = await getAccessibleQuoteById(quoteId, user);
  if (!cotacao) {
    return textResponse('Cotação não encontrada', 404);
  }

  const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

  const [signatureDoc] = await sql<{
    external_document_id: string | null;
    signed_file_url: string | null;
    sign_url: string | null;
    status: string | null;
  }[]>`
    SELECT external_document_id, signed_file_url, sign_url, status
    FROM signature_documents
    WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const docToken = String(
    clientData.contratoToken || clientData.tokenZapsign || signatureDoc?.external_document_id || ''
  ).trim();

  // URL já conhecida localmente (pode estar expirada: links de arquivo da ZapSign duram ~60 min)
  const storedCandidates = [
    signatureDoc?.signed_file_url,
    clientData.contratoPdf,
    clientData.signedFileUrl,
    clientData.urlAssinado,
    clientData.linkContrato,
  ];
  const storedPdfUrl = storedCandidates.find(isUsableUrl) || null;

  let pdfUrl: string | null = null;
  let signUrl: string | null = signatureDoc?.sign_url || clientData.signUrl || null;
  let zapStatus: string | null = null;
  let zapError: string | null = null;

  // Consulta a ZapSign sempre que houver token real: garante link fresco (os links
  // de arquivo expiram) e resolve o caso de a URL nunca ter sido gravada localmente.
  if (docToken && !isSyntheticToken(docToken)) {
    try {
      const zapConfig = await getZapSignConfig();
      const token = sanitizeApiToken(zapConfig.apiToken);
      const baseUrl = zapConfig.baseUrl;

      if (!token) {
        zapError = 'Token da API ZapSign não configurado.';
      } else {
        const zapRes = await fetch(`${baseUrl}/docs/${docToken}/`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12000),
        });

        if (!zapRes.ok) {
          zapError = `ZapSign HTTP ${zapRes.status}`;
          logger.warn(
            { id: cotacao.id, docToken, status: zapRes.status },
            'api.cotacoes.contrato-pdf.zapsign_not_ok'
          );
        } else {
          const zapDoc = await zapRes.json();
          zapStatus = String(zapDoc.status || '').toLowerCase();
          const isSigned =
            zapStatus === 'signed' ||
            zapStatus === 'completed' ||
            (Array.isArray(zapDoc.signers) &&
              zapDoc.signers.length > 0 &&
              zapDoc.signers.every((s: any) => s.status === 'signed'));

          // A API da ZapSign retorna `signed_file` / `original_file` (não `*_url`).
          const freshSigned = zapDoc.signed_file || zapDoc.signed_file_url || null;
          const freshOriginal = zapDoc.original_file || zapDoc.original_file_url || null;
          const freshSignUrl: string | null = zapDoc.signers?.[0]?.sign_url || null;
          if (freshSignUrl) signUrl = freshSignUrl;

          if (isSigned && isUsableUrl(freshSigned)) {
            pdfUrl = freshSigned;
          } else if (isSigned && isUsableUrl(freshOriginal)) {
            // Assinado mas PDF final ainda em processamento na ZapSign
            pdfUrl = freshOriginal;
          }

          // Persiste o que aprendemos (status/URL/link de assinatura) para as telas
          try {
            const signedAt: string | null = isSigned
              ? zapDoc.signed_at || zapDoc.last_update_at || new Date().toISOString()
              : null;

            if (signatureDoc) {
              await sql`
                UPDATE signature_documents
                SET
                  signed_file_url = COALESCE(${pdfUrl}, signed_file_url),
                  sign_url = COALESCE(${freshSignUrl}, sign_url),
                  status = CASE WHEN ${isSigned} THEN 'signed' ELSE status END,
                  signed_at = COALESCE(signed_at, ${signedAt}::timestamptz),
                  raw_payload = ${JSON.stringify(zapDoc)}::jsonb,
                  updated_at = NOW()
                WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
                  AND external_document_id IS NOT DISTINCT FROM ${signatureDoc.external_document_id}
              `;
            } else {
              await sql`
                INSERT INTO signature_documents (
                  cotacao_id, client_id, provider, external_document_id, status,
                  sign_url, signed_file_url, signed_at, raw_payload, created_at, updated_at
                ) VALUES (
                  ${cotacao.id}, ${(cotacao as any).client_id || null}, 'zapsign', ${docToken},
                  ${isSigned ? 'signed' : 'pending'}, ${freshSignUrl}, ${pdfUrl},
                  ${signedAt}::timestamptz, ${JSON.stringify(zapDoc)}::jsonb, NOW(), NOW()
                )
                ON CONFLICT (provider, external_document_id) DO UPDATE SET
                  signed_file_url = COALESCE(EXCLUDED.signed_file_url, signature_documents.signed_file_url),
                  sign_url = COALESCE(EXCLUDED.sign_url, signature_documents.sign_url),
                  status = CASE WHEN EXCLUDED.status = 'signed' THEN 'signed' ELSE signature_documents.status END,
                  signed_at = COALESCE(signature_documents.signed_at, EXCLUDED.signed_at),
                  updated_at = NOW()
              `;
            }

            let changed = false;
            if (pdfUrl && clientData.contratoPdf !== pdfUrl) {
              clientData.contratoPdf = pdfUrl;
              clientData.urlAssinado = pdfUrl;
              changed = true;
            }
            if (freshSignUrl && clientData.signUrl !== freshSignUrl) {
              clientData.signUrl = freshSignUrl;
              changed = true;
            }
            if (isSigned && !clientData.assinadoEm) {
              clientData.assinadoEm = signedAt;
              changed = true;
            }
            if (!clientData.contratoToken) {
              clientData.contratoToken = docToken;
              changed = true;
            }
            if (changed) {
              await sql`
                UPDATE cotacoes
                SET client_data = ${JSON.stringify(clientData)}::jsonb, updated_at = NOW()
                WHERE id = ${cotacao.id}
              `;
            }
          } catch (persistErr) {
            logger.error({ err: persistErr, id: cotacao.id }, 'api.cotacoes.contrato-pdf.persist_failed');
          }
        }
      }
    } catch (err) {
      zapError = 'Falha ao consultar a ZapSign.';
      logger.error({ err, id: cotacao.id, docToken }, 'api.cotacoes.contrato-pdf.fetch_zapsign_failed');
    }
  }

  // Fallback: URL gravada localmente (S3/link ainda válido)
  if (!pdfUrl && storedPdfUrl) {
    pdfUrl = storedPdfUrl;
  }

  if (!pdfUrl) {
    if (!docToken || isSyntheticToken(docToken)) {
      return textResponse(
        'Esta cotação não possui contrato gerado na ZapSign. Gere o contrato para obter o link de assinatura.',
        404
      );
    }
    if (zapStatus && zapStatus !== 'signed' && zapStatus !== 'completed') {
      return textResponse(
        `O contrato ainda não foi assinado na ZapSign (status: ${zapStatus}). ` +
          (signUrl
            ? `Envie o link de assinatura ao cliente: ${signUrl}`
            : 'Gere/copie o link de assinatura.'),
        409
      );
    }
    return textResponse(
      'Arquivo do contrato ainda não disponível para download no ZapSign.' +
        (zapError
          ? ` (${zapError})`
          : ' Se o documento acabou de ser assinado, aguarde alguns instantes e tente novamente.'),
      zapError ? 502 : 404
    );
  }

  // Streaming do arquivo para entrega direta do PDF
  try {
    const fileRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) });

    if (fileRes.ok) {
      const buffer = await fileRes.arrayBuffer();
      const isDownload = req.nextUrl.searchParams.get('download') !== 'false';
      const disposition = isDownload ? 'attachment' : 'inline';
      const cleanClientName = (cotacao.client_name || 'cliente')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 30);
      const filename = `contrato_duolife_${cleanClientName}_${cotacao.id.slice(0, 8)}.pdf`;

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${disposition}; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    logger.warn({ id: cotacao.id, status: fileRes.status }, 'api.cotacoes.contrato-pdf.file_not_ok');
  } catch (err) {
    logger.warn({ err, id: cotacao.id }, 'api.cotacoes.contrato-pdf.streaming_failed');
  }

  // Fallback: redireciona para a URL do arquivo
  return Response.redirect(pdfUrl, 307);
}
