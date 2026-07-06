import { NextRequest } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { findPartnerByWixCode, logSyncEvent, normalizeWixRecord } from '@/lib/wix-sync';

function getWebhookSecret() {
  return process.env.WEBHOOK_SECRET || '';
}

function isAuthorized(req: NextRequest) {
  const secret = getWebhookSecret();
  if (!secret) return true;

  const headerSecret =
    req.headers.get('x-duolife-webhook-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-wix-webhook-secret');
  if (headerSecret === secret) return true;

  const auth = req.headers.get('authorization') || '';
  if (auth === secret || auth === `Bearer ${secret}`) return true;

  return false;
}

async function resolveLead(partnerId: string | null, externalId: string | null, documentNumber: string | null) {
  if (externalId) {
    const [lead] = await sql`
      SELECT id
      FROM leads
      WHERE external_id = ${externalId}
      LIMIT 1
    `;
    if (lead) return lead;
  }

  if (partnerId && documentNumber) {
    const [lead] = await sql`
      SELECT id
      FROM leads
      WHERE partner_id = ${partnerId}
        AND document_number = ${documentNumber}
      ORDER BY data_atualizacao DESC NULLS LAST, synced_at DESC
      LIMIT 1
    `;
    if (lead) return lead;
  }

  return null;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await ensureSchema();

  const body = await req.json();
  const normalized = normalizeWixRecord(body);
  const partner = await findPartnerByWixCode(normalized.partnerWixCode);
  const partnerId = partner?.id ?? null;

  try {
    const existingLead = await resolveLead(partnerId, normalized.externalId, normalized.documentNumber);

    const leadId = existingLead
      ? (await sql`
          UPDATE leads
          SET
            partner_id = COALESCE(${partnerId}, partner_id),
            external_id = COALESCE(${normalized.externalId}, external_id),
            document_number = COALESCE(${normalized.documentNumber}, document_number),
            nome = COALESCE(${normalized.nome}, nome),
            email = COALESCE(${normalized.email}, email),
            telefone = COALESCE(${normalized.telefone}, telefone),
            origem = COALESCE(${normalized.origem}, origem),
            status = COALESCE(${normalized.status}, status),
            raw = ${JSON.stringify(normalized.raw)}::jsonb,
            synced_at = NOW(),
            source_system = ${normalized.sourceSystem}
          WHERE id = ${existingLead.id}
          RETURNING id
        `)[0]
      : (await sql`
          INSERT INTO leads (
            partner_id,
            external_id,
            document_number,
            nome,
            email,
            telefone,
            origem,
            status,
            raw,
            synced_at,
            source_system
          )
          VALUES (
            ${partnerId},
            ${normalized.externalId},
            ${normalized.documentNumber},
            ${normalized.nome},
            ${normalized.email},
            ${normalized.telefone},
            ${normalized.origem},
            ${normalized.status},
            ${JSON.stringify(normalized.raw)}::jsonb,
            NOW(),
            ${normalized.sourceSystem}
          )
          RETURNING id
        `)[0];

    await logSyncEvent({
      entityType: 'lead',
      entityId: leadId.id,
      sourceSystem: normalized.sourceSystem,
      direction: 'inbound',
      eventType: 'wix_webhook',
      status: 'success',
      payload: {
        externalId: normalized.externalId,
        partnerWixCode: normalized.partnerWixCode,
        documentNumber: normalized.documentNumber,
        productCode: normalized.productCode,
      },
    });

    logger.info({
      leadId: leadId.id,
      partnerId,
      externalId: normalized.externalId,
      documentNumber: normalized.documentNumber,
    }, 'wix.webhook.synced');

    return Response.json({
      ok: true,
      leadId: leadId.id,
      partnerId,
    });
  } catch (err) {
    await logSyncEvent({
      entityType: 'lead',
      entityId: normalized.externalId || normalized.documentNumber || 'unknown',
      sourceSystem: normalized.sourceSystem,
      direction: 'inbound',
      eventType: 'wix_webhook',
      status: 'error',
      payload: normalized.raw,
      errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
    }).catch(() => null);

    logger.error({ err, partnerWixCode: normalized.partnerWixCode }, 'wix.webhook.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
