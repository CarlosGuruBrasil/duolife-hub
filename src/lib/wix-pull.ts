import crypto from 'crypto';
import { ensureSchema } from './schema';
import { sql } from './pg';
import { logger } from './logger';
import {
  hasWixReadAccess,
  wixGetCollectionSchema,
  wixListCollections,
  wixQueryItems,
  type WixCollectionSchema,
  type WixQueryItem,
} from './wix-client';
import { findPartnerByWixCode, logSyncEvent, normalizeDigits, normalizeMaybeString } from './wix-sync';

const PAGE_SIZE = 100;

function stableHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { $date?: string; date?: string };
    if (typeof candidate.$date === 'string') return candidate.$date;
    if (typeof candidate.date === 'string') return candidate.date;
  }
  return null;
}

function extractItemData(item: WixQueryItem): Record<string, unknown> {
  return item.data && typeof item.data === 'object' ? item.data : {};
}

async function upsertCollection(summary: { id: string; displayName?: string; collectionType?: string }, schema: WixCollectionSchema | null) {
  const displayName = schema?.displayName || summary.displayName || summary.id;
  const metadata = {
    schema,
    summary,
  };

  const [row] = await sql`
    INSERT INTO wix_collections (collection_id, collection_name, source_system, metadata, last_synced_at, updated_at)
    VALUES (
      ${summary.id},
      ${displayName},
      'wix',
      ${JSON.stringify(metadata)}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (collection_id)
    DO UPDATE SET
      collection_name = EXCLUDED.collection_name,
      metadata = EXCLUDED.metadata,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING id
  `;

  return row as { id: string };
}

async function upsertItem(params: {
  wixCollectionId: string;
  item: WixQueryItem;
  collectionId: string;
}) {
  const data = extractItemData(params.item);
  const externalId = normalizeMaybeString(params.item.id);
  const documentNumber = normalizeDigits(data.cpf) || normalizeDigits(data.cnpj) || normalizeDigits(data.documentNumber);
  const name = normalizeMaybeString(data.nome) || normalizeMaybeString(data.name) || normalizeMaybeString(data.nomeExibido) || null;
  const email = normalizeMaybeString(data.email)?.toLowerCase() || null;
  const phone = normalizeDigits(data.celular) || normalizeDigits(data.telefone) || normalizeDigits(data.phone) || null;
  const status = normalizeMaybeString(data.statusGeral) || normalizeMaybeString(data.status) || normalizeMaybeString(data.cargo) || null;
  const partnerCode =
    normalizeMaybeString(data.codigoVenda) ||
    normalizeMaybeString(data.codigoParceiro) ||
    normalizeMaybeString(data.codigo) ||
    null;
  const wixCreatedAt = toIsoDate((params.item as { _createdDate?: unknown })._createdDate);
  const wixUpdatedAt = toIsoDate((params.item as { _updatedDate?: unknown })._updatedDate);
  const payload = {
    collectionId: params.collectionId,
    item: params.item,
  };
  const payloadHash = stableHash(payload);

  await sql`
    INSERT INTO wix_items (
      wix_collection_id,
      wix_item_id,
      external_id,
      document_number,
      name,
      email,
      phone,
      status,
      partner_code,
      payload,
      payload_hash,
      wix_created_at,
      wix_updated_at,
      synced_at,
      updated_at
    )
    VALUES (
      ${params.wixCollectionId},
      ${params.item.id},
      ${externalId},
      ${documentNumber},
      ${name},
      ${email},
      ${phone},
      ${status},
      ${partnerCode},
      ${JSON.stringify(payload)}::jsonb,
      ${payloadHash},
      ${wixCreatedAt},
      ${wixUpdatedAt},
      NOW(),
      NOW()
    )
    ON CONFLICT (wix_collection_id, wix_item_id)
    DO UPDATE SET
      external_id = EXCLUDED.external_id,
      document_number = EXCLUDED.document_number,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      status = EXCLUDED.status,
      partner_code = EXCLUDED.partner_code,
      payload = EXCLUDED.payload,
      payload_hash = EXCLUDED.payload_hash,
      wix_created_at = COALESCE(EXCLUDED.wix_created_at, wix_items.wix_created_at),
      wix_updated_at = COALESCE(EXCLUDED.wix_updated_at, wix_items.wix_updated_at),
      synced_at = NOW(),
      updated_at = NOW(),
      is_active = true
  `;

  return { externalId, documentNumber, name, email, phone, status, partnerCode, data };
}

async function upsertLeadFromWix(params: {
  collectionId: string;
  mirror: Awaited<ReturnType<typeof upsertItem>>;
}) {
  const { externalId, documentNumber, name, email, phone, status, partnerCode, data } = params.mirror;
  if (!externalId && !documentNumber) return null;

  const partner = await findPartnerByWixCode(partnerCode);
  const raw = {
    sourceCollection: params.collectionId,
    wix: data,
  };

  const [existingLead] = externalId
    ? await sql`
        SELECT id
        FROM leads
        WHERE external_id = ${externalId}
        LIMIT 1
      `
    : await sql`
        SELECT id
        FROM leads
        WHERE document_number = ${documentNumber}
        ORDER BY data_atualizacao DESC NULLS LAST, synced_at DESC
        LIMIT 1
      `;

  if (existingLead) {
    const [updated] = await sql`
      UPDATE leads
      SET
        partner_id = COALESCE(${partner?.id || null}, partner_id),
        external_id = COALESCE(${externalId}, external_id),
        document_number = COALESCE(${documentNumber}, document_number),
        nome = COALESCE(${name}, nome),
        email = COALESCE(${email}, email),
        telefone = COALESCE(${phone}, telefone),
        origem = 'wix',
        status = COALESCE(${status || 'novo'}, status),
        raw = ${JSON.stringify(raw)}::jsonb,
        synced_at = NOW(),
        source_system = 'wix',
        data_atualizacao = NOW()
      WHERE id = ${existingLead.id}
      RETURNING id
    `;
    return (updated as { id: string }).id;
  }

  const [lead] = await sql`
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
      source_system,
      data_cadastro,
      data_atualizacao
    )
    VALUES (
      ${partner?.id || null},
      ${externalId},
      ${documentNumber},
      ${name},
      ${email},
      ${phone},
      'wix',
      ${status || 'novo'},
      ${JSON.stringify(raw)}::jsonb,
      NOW(),
      'wix',
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  return (lead as { id: string }).id;
}

async function upsertPartnerFromWix(params: {
  collectionId: string;
  mirror: Awaited<ReturnType<typeof upsertItem>>;
}) {
  const { externalId, name, email, phone, partnerCode, data } = params.mirror;
  if (!email) return null;

  const metadata = {
    wix: {
      collectionId: params.collectionId,
      externalId,
      partnerCode,
      raw: data,
    },
  };

  const [partner] = await sql`
    INSERT INTO partners (
      razao_social,
      nome_fantasia,
      email,
      phone,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      ${name || email},
      ${name},
      ${email},
      ${phone},
      'active',
      ${JSON.stringify(metadata)}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (email)
    DO UPDATE SET
      razao_social = COALESCE(EXCLUDED.razao_social, partners.razao_social),
      nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, partners.nome_fantasia),
      phone = COALESCE(EXCLUDED.phone, partners.phone),
      metadata = COALESCE(partners.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;

  return (partner as { id: string }).id;
}

export interface WixPullResult {
  collectionsSynced: number;
  itemsSynced: number;
  leadsUpserted: number;
  partnersUpserted: number;
  durationMs: number;
}

export async function pullWixIntoLocalMirror(): Promise<WixPullResult> {
  await ensureSchema();

  if (!hasWixReadAccess()) {
    throw new Error('WIX_API_KEY/WIX_SITE_ID não configurados');
  }

  const startedAt = Date.now();
  const collections = await wixListCollections();
  let collectionsSynced = 0;
  let itemsSynced = 0;
  let leadsUpserted = 0;
  let partnersUpserted = 0;

  const allowedCollections = collections.filter((collection) => collection.collectionType === 'NATIVE' || collection.collectionType === 'EXTERNAL' || !collection.collectionType);

  for (const collection of allowedCollections) {
    const schema = (await wixGetCollectionSchema(collection.id)) || {
      id: collection.id,
      displayName: collection.displayName,
      collectionType: collection.collectionType,
    };

    const collectionRow = await upsertCollection(collection, schema);
    collectionsSynced += 1;

    let offset = 0;
    let pageCount = 0;
    let syncedItemsForCollection = 0;

    while (true) {
      const result = await wixQueryItems(collection.id, PAGE_SIZE, offset);
      const items = result?.dataItems || [];
      if (!items.length) break;

      for (const item of items) {
        const mirror = await upsertItem({
          wixCollectionId: collectionRow.id,
          item,
          collectionId: collection.id,
        });
        itemsSynced += 1;
        syncedItemsForCollection += 1;

        if (collection.id === 'Import1') {
          const leadId = await upsertLeadFromWix({ collectionId: collection.id, mirror });
          if (leadId) leadsUpserted += 1;
        }

        if (collection.id === 'Usuarios') {
          const partnerId = await upsertPartnerFromWix({ collectionId: collection.id, mirror });
          if (partnerId) partnersUpserted += 1;
        }
      }

      pageCount += 1;
      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    await sql`
      UPDATE wix_collections
      SET last_synced_at = NOW(),
          sync_cursor = ${String(offset)},
          updated_at = NOW()
      WHERE id = ${collectionRow.id}
    `;

    await logSyncEvent({
      entityType: 'wix_collection',
      entityId: collection.id,
      sourceSystem: 'wix',
      direction: 'inbound',
      eventType: 'wix_pull',
      status: 'success',
      payload: {
        collectionId: collection.id,
        displayName: collection.displayName || schema.displayName || collection.id,
        itemsSynced: syncedItemsForCollection,
        pages: pageCount,
      },
    });
  }

  const durationMs = Date.now() - startedAt;

  logger.info({
    collectionsSynced,
    itemsSynced,
    leadsUpserted,
    partnersUpserted,
    durationMs,
  }, 'wix.pull.completed');

  return {
    collectionsSynced,
    itemsSynced,
    leadsUpserted,
    partnersUpserted,
    durationMs,
  };
}
