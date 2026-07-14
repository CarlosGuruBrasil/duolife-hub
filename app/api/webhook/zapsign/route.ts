import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

function isAuthorized(req: NextRequest) {
  const secret = process.env.ZAPSIGN_WEBHOOK_SECRET;
  if (!secret) return true;

  const headerSecret =
    req.headers.get('x-zapsign-webhook-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization');

  return headerSecret === secret || headerSecret === `Bearer ${secret}`;
}

function normalizeStatus(payload: any) {
  const status =
    payload?.status ||
    payload?.document?.status ||
    payload?.doc?.status ||
    payload?.event?.status ||
    '';

  if (status === 'completed') return 'signed';
  return String(status || 'pending').toLowerCase();
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
    payload?.signed_file_url ||
    payload?.document?.signed_file_url ||
    payload?.doc?.signed_file_url ||
    null
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const payload = await req.json();
  const eventType = String(
    payload?.event_type ||
      payload?.event ||
      payload?.type ||
      payload?.name ||
      'unknown'
  );
  const externalDocumentId = extractDocumentId(payload);
  const externalId = extractExternalId(payload);
  const normalizedStatus = normalizeStatus(payload);
  const signedFileUrl = extractSignedFileUrl(payload);

  const [eventRow] = await sql<{ id: string }[]>`
    INSERT INTO webhook_events (
      provider,
      event_type,
      external_id,
      signature_valid,
      payload,
      processed
    )
    VALUES (
      'zapsign',
      ${eventType},
      ${externalDocumentId || externalId},
      true,
      ${JSON.stringify(payload)}::jsonb,
      false
    )
    RETURNING id
  `;

  try {
    const documents = externalDocumentId
      ? await sql`
          SELECT id, cotacao_id
          FROM signature_documents
          WHERE provider = 'zapsign'
            AND external_document_id = ${externalDocumentId}
          LIMIT 1
        `
      : externalId
        ? await sql`
            SELECT id, cotacao_id
            FROM signature_documents
            WHERE provider = 'zapsign'
              AND cotacao_id = ${externalId}
            LIMIT 1
          `
        : [];

    const document = documents[0];
    if (!document) {
      await sql`
        UPDATE webhook_events
        SET processed = true,
            error_message = 'Documento não encontrado',
            payload = ${JSON.stringify(payload)}::jsonb
        WHERE id = ${eventRow.id}
      `;
      return NextResponse.json({ ok: true, ignored: true });
    }

    await sql`
      UPDATE signature_documents
      SET
        status = ${normalizedStatus},
        signed_file_url = COALESCE(${signedFileUrl}, signed_file_url),
        signed_at = CASE
          WHEN ${normalizedStatus} = 'signed' THEN COALESCE(signed_at, NOW())
          ELSE signed_at
        END,
        last_event_type = ${eventType},
        raw_payload = ${JSON.stringify(payload)}::jsonb,
        updated_at = NOW()
      WHERE id = ${document.id}
    `;

    if (normalizedStatus === 'signed') {
      const [cotacao] = await sql`
        SELECT client_data
        FROM cotacoes
        WHERE id = ${document.cotacao_id}
        LIMIT 1
      `;

      const clientData = cotacao?.client_data || {};
      if (signedFileUrl) clientData.contratoPdf = signedFileUrl;
      clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

      await sql`
        UPDATE cotacoes
        SET
          status = 'assinado',
          client_data = ${JSON.stringify(clientData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${document.cotacao_id}
      `;
    }

    await sql`
      UPDATE webhook_events
      SET processed = true
      WHERE id = ${eventRow.id}
    `;

    logger.info({ eventType, externalDocumentId, externalId, status: normalizedStatus }, 'zapsign.webhook.processed');
    return NextResponse.json({ ok: true });
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
