import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { sql } from '@/lib/pg';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { logger } from '@/lib/logger';

export async function handleContratoPdfRequest(
  req: NextRequest,
  quoteId: string
): Promise<Response> {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const cotacao = await getAccessibleQuoteById(quoteId, user);
  if (!cotacao) {
    return new Response('Cotação não encontrada', { status: 404 });
  }

  const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
  let docToken = String(clientData.contratoToken || clientData.tokenZapsign || '').trim();

  // Busca se já tem registro em signature_documents
  const [signatureDoc] = await sql<{
    external_document_id: string | null;
    signed_file_url: string | null;
    status: string | null;
  }[]>`
    SELECT external_document_id, signed_file_url, status
    FROM signature_documents
    WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!docToken && signatureDoc?.external_document_id) {
    docToken = signatureDoc.external_document_id;
  }

  let pdfUrl: string | null = null;
  const rawCandidate =
    signatureDoc?.signed_file_url ||
    (clientData.contratoPdf as string | undefined) ||
    (clientData.signedFileUrl as string | undefined) ||
    (clientData.linkContrato as string | undefined);

  if (rawCandidate && !rawCandidate.includes('/verificar/')) {
    pdfUrl = rawCandidate;
  }

  // Se não temos a URL ainda mas temos o docToken, consulta a ZapSign em tempo real
  if (!pdfUrl && docToken) {
    try {
      const zapConfig = await getZapSignConfig();
      const token = sanitizeApiToken(zapConfig.apiToken);
      const baseUrl = zapConfig.baseUrl;

      if (token) {
        const zapRes = await fetch(`${baseUrl}/docs/${docToken}/`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12000),
        });

        if (zapRes.ok) {
          const zapDoc = await zapRes.json();
          const isSigned =
            zapDoc.status === 'completed' ||
            zapDoc.status === 'signed' ||
            zapDoc.signers?.every((s: any) => s.status === 'signed');

          const resolvedPdf = zapDoc.signed_file_url || zapDoc.original_file_url;
          if (resolvedPdf && !resolvedPdf.includes('/verificar/')) {
            pdfUrl = resolvedPdf;

            // Atualiza de forma atômica no banco de dados local
            await sql`
              INSERT INTO signature_documents (
                cotacao_id, provider, external_document_id, status, signed_file_url,
                sign_url, signed_at, created_at, updated_at
              ) VALUES (
                ${cotacao.id}, 'zapsign', ${docToken}, ${isSigned ? 'signed' : 'pending'},
                ${pdfUrl}, ${zapDoc.signers?.[0]?.sign_url || null},
                ${isSigned ? (zapDoc.signed_at || new Date().toISOString()) : null},
                NOW(), NOW()
              )
              ON CONFLICT (cotacao_id) DO UPDATE SET
                signed_file_url = EXCLUDED.signed_file_url,
                sign_url = COALESCE(EXCLUDED.sign_url, signature_documents.sign_url),
                status = CASE WHEN EXCLUDED.status = 'signed' THEN 'signed' ELSE signature_documents.status END,
                signed_at = COALESCE(EXCLUDED.signed_at, signature_documents.signed_at),
                updated_at = NOW()
            `;

            clientData.contratoPdf = pdfUrl;
            if (zapDoc.signers?.[0]?.sign_url) {
              clientData.signUrl = zapDoc.signers[0].sign_url;
            }
            if (isSigned && !clientData.assinadoEm) {
              clientData.assinadoEm = zapDoc.signed_at || new Date().toISOString();
            }

            await sql`
              UPDATE cotacoes
              SET client_data = ${JSON.stringify(clientData)}::jsonb,
                  updated_at = NOW()
              WHERE id = ${cotacao.id}
            `;
          }
        }
      }
    } catch (err) {
      logger.error({ err, id: cotacao.id }, 'api.cotacoes.contrato-pdf.fetch_zapsign_failed');
    }
  }

  if (!pdfUrl) {
    return new Response(
      'Arquivo do contrato ainda não disponível para download no ZapSign. Se o documento acabou de ser assinado, aguarde alguns instantes e tente novamente.',
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  // Tenta streaming do arquivo para entrega direta e imediata do PDF
  try {
    const fileRes = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(20000),
    });

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
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  } catch (err) {
    logger.warn({ err, pdfUrl }, 'api.cotacoes.contrato-pdf.streaming_failed, fallback to redirect');
  }

  // Fallback seguro: redireciona para a URL do arquivo
  return Response.redirect(pdfUrl, 307);
}
