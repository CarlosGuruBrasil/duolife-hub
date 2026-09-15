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
import { upsertInsuranceClient } from './insurance-ops';
import { isWixIntegrationEnabled } from './system-settings';
import { findPartnerByWixCode, logSyncEvent, normalizeDigits, normalizeMaybeString } from './wix-sync';
import { parseFlexibleDate, extractWixCreationDate } from './wix-compare';
import { syncWixSalesToLocalDb } from './wix-sales-sync';

const PAGE_SIZE = 100;

function stableHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { $date?: string; date?: string };
    if (typeof candidate.$date === 'string') return toIsoDate(candidate.$date);
    if (typeof candidate.date === 'string') return toIsoDate(candidate.date);
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
  skipDbInsert?: boolean;
}) {
  const data = extractItemData(params.item);
  const externalId = normalizeMaybeString(params.item.id);
  const documentNumber = normalizeDigits(data.cpf) || normalizeDigits(data.cnpj) || normalizeDigits(data.documentNumber);
  const name = normalizeMaybeString(data.nome) || normalizeMaybeString(data.name) || normalizeMaybeString(data.nomeExibido) || null;
  const email = normalizeMaybeString(data.email)?.toLowerCase() || null;
  const phone = normalizeDigits(data.celular) || normalizeDigits(data.telefone) || normalizeDigits(data.phone) || null;
  // statusCliente é o campo mais granular/atual mantido pela operação (Vigente/Em atraso/Cancelado/Em negociação);
  // statusGeral é mais genérico (Negócio Fechado/Pendente/Inativo). data.status e data.cargo NÃO são status de lead
  // (são texto de parcela/cargo profissional) e não devem entrar no fallback.
  const statusCliente = normalizeMaybeString(data.statusCliente) || normalizeMaybeString(data.StatusCliente) || null;
  const status = statusCliente || normalizeMaybeString(data.statusGeral) || null;
  const partnerCode =
    normalizeMaybeString(data.codigoVenda) ||
    normalizeMaybeString(data.codigoParceiro) ||
    normalizeMaybeString(data.codigo) ||
    null;
  const wixCreatedAt =
    parseFlexibleDate(data._createdDate) ||
    parseFlexibleDate((params.item as Record<string, unknown>)._createdDate) ||
    extractWixCreationDate(data, params.item as Record<string, unknown>);
  const wixUpdatedAt =
    parseFlexibleDate(data._updatedDate) ||
    parseFlexibleDate((params.item as Record<string, unknown>)._updatedDate) ||
    extractWixCreationDate(data, { _updatedDate: (params.item as Record<string, unknown>)._updatedDate }) ||
    wixCreatedAt;

  if (!params.skipDbInsert) {
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
  }

  return {
    externalId,
    documentNumber,
    name,
    email,
    phone,
    status,
    statusCliente,
    partnerCode,
    data,
    wixCreatedAt,
    wixUpdatedAt,
  };
}

async function upsertLeadFromWix(params: {
  collectionId: string;
  mirror: Awaited<ReturnType<typeof upsertItem>>;
  onlyNew?: boolean;
}) {
  const { externalId, documentNumber, name, email, phone, status, statusCliente, partnerCode, data } = params.mirror;
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

  const wixCreatedAtStr =
    parseFlexibleDate(data._createdDate) ||
    extractWixCreationDate(data);
  const leadDataCadastro = wixCreatedAtStr ? new Date(wixCreatedAtStr) : null;

  if (existingLead) {
    if (params.onlyNew) {
      return null;
    }
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
        status_cliente = COALESCE(${statusCliente}, status_cliente),
        raw = ${JSON.stringify(raw)}::jsonb,
        ${leadDataCadastro ? sql`data_cadastro = ${leadDataCadastro},` : sql``}
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
      status_cliente,
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
      ${statusCliente},
      ${JSON.stringify(raw)}::jsonb,
      NOW(),
      'wix',
      ${leadDataCadastro ? leadDataCadastro : sql`NOW()`},
      NOW()
    )
    RETURNING id
  `;

  return (lead as { id: string }).id;
}

function shouldImportAsClient(collectionId: string) {
  return !['Usuarios', 'Planos', 'Seguros', 'CUPOMPROMOCIONAL', 'PPECARGOS'].includes(collectionId);
}

async function upsertInsuranceClientFromWix(params: {
  collectionId: string;
  mirror: Awaited<ReturnType<typeof upsertItem>>;
  onlyNew?: boolean;
}) {
  if (!shouldImportAsClient(params.collectionId)) return null;

  const { externalId, documentNumber, name, email, phone, status, statusCliente, data } = params.mirror;
  if (!documentNumber || !name) return null;

  if (params.onlyNew) {
    const [existing] = await sql`
      SELECT id
      FROM insurance_clients
      WHERE document_number = ${documentNumber}
         OR (metadata->>'externalId' = ${externalId} AND ${externalId} IS NOT NULL)
      LIMIT 1
    `;
    if (existing) return null;
  }

  const birthDate =
    normalizeMaybeString(data.dataNascimento) ||
    normalizeMaybeString(data.dataNascto) ||
    normalizeMaybeString(data.nascimento) ||
    normalizeMaybeString(data.birthDate) ||
    null;

  const client = await upsertInsuranceClient({
    documentNumber,
    fullName: name,
    email,
    phone,
    birthDate,
    metadata: {
      source: 'wix',
      collectionId: params.collectionId,
      externalId,
      status,
      statusCliente,
      raw: data,
    },
  });

  return (client as { id?: string } | null)?.id || null;
}

async function upsertPartnerFromWix(params: {
  collectionId: string;
  mirror: Awaited<ReturnType<typeof upsertItem>>;
  onlyNew?: boolean;
}) {
  const { externalId, name, email, phone, partnerCode, data } = params.mirror;
  if (!email) return null;

  if (params.onlyNew) {
    const [existing] = await sql`
      SELECT id FROM partners WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    if (existing) return null;
  }

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

function parseCurrencyValue(val: unknown): number | null {
  if (!val) return null;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9,-]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function upsertProductFromWixPlano(mirror: Awaited<ReturnType<typeof upsertItem>>) {
  // A coleção 'Planos' no Wix representa os valores/opções de apólice do produto único RC Advogados (RC-ADV-001).
  // Mantemos a coleção espelhada em wix_items para uso na cotação.
  const [product] = await sql`
    INSERT INTO products (
      name, code, category, product_type, integration_type, insurer_name, insurer_cnpj,
      description, public_title, target_audience, base_commission_rate, min_premium,
      flow_key, pricing_strategy, policy_prefix, is_active, is_quoteable, is_contractable,
      is_payable, validity_days, sale_recognition, renewal_enabled, requires_underwriting,
      required_documents
    ) VALUES (
      'RC Profissional — Advogados & Escritórios',
      'RC-ADV-001',
      'Responsabilidade Civil',
      'insurance',
      'full_journey',
      'KEV Seguros',
      '14.862.008/0001-23',
      'Seguro de Responsabilidade Civil Profissional para Advogados. Proteção contra falhas de prazos judiciais, erros em peças processuais e custos de defesa na OAB. Coberturas de R$ 100k até R$ 3 Milhões.',
      'Seguro RC Profissional Advogados',
      'Advogados autônomos e escritórios de advocacia',
      15.00,
      516.67,
      'rc_professional_v1',
      'rc_wix_planos_v1',
      'DL-RC-ADV',
      true, true, true, true, 365, 'on_payment', true, false,
      '["Comprovante de Inscrição na OAB", "Documento de Identidade com CPF"]'::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      integration_type = 'full_journey',
      is_active = true,
      is_quoteable = true
    RETURNING id
  `;

  if (product?.id) {
    await sql`
      INSERT INTO partner_product_availability (partner_id, product_id, is_active)
      SELECT pa.id, ${product.id}, true
      FROM partners pa
      WHERE pa.status = 'active'
      ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true
    `;
  }

  return product?.id || null;
}

async function upsertProductFromWixSeguro(mirror: Awaited<ReturnType<typeof upsertItem>>) {
  const { data } = mirror;
  const nome = normalizeMaybeString(data.nome) || normalizeMaybeString(data.titulo) || null;
  if (!nome) return null;

  const code = `WIX-SRV-${nome.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 30)}`;
  const empresa = normalizeMaybeString(data.empresa) || 'NET4LIFE';
  const category = empresa === 'Workgroup' ? 'Ferramentas & App' : 'Serviços (Seguros e Planos)';
  const productType = nome.toLowerCase().includes('seguro') || nome.toLowerCase().includes('plano') ? 'insurance' : 'service';
  const description = normalizeMaybeString(data.descrio) || normalizeMaybeString(data.titulo) || nome;

  const [product] = await sql`
    INSERT INTO products (
      name, code, category, product_type, insurer_name, description,
      public_title, target_audience, base_commission_rate, is_active, is_quoteable,
      is_contractable, is_payable, validity_days, sale_recognition, renewal_enabled
    ) VALUES (
      ${nome}, ${code}, ${category}, ${productType}, ${empresa}, ${description},
      ${nome}, 'Clientes e Parceiros DuoLife / NET4LIFE', 15.00, true, true,
      true, true, 365, 'on_payment', true
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_active = true,
      is_quoteable = true
    RETURNING id
  `;

  if (product?.id) {
    await sql`
      INSERT INTO partner_product_availability (partner_id, product_id, is_active)
      SELECT pa.id, ${product.id}, true
      FROM partners pa
      WHERE pa.status = 'active'
      ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true
    `;
  }

  return product?.id || null;
}

export interface WixPullEntitiesSelection {
  mirror?: boolean;     // Gravar em wix_items e wix_collections (default: true)
  clients?: boolean;    // Upsert em insurance_clients (default: true)
  leads?: boolean;      // Upsert em leads (Import1) (default: true)
  partners?: boolean;   // Upsert em partners (Usuarios) (default: true)
  products?: boolean;   // Upsert em products (Planos / Seguros) (default: true)
  sales?: boolean;      // Sincronizar vendas, cotações e comissões do Wix Import1 (default: false)
}

export interface WixPullOptions {
  collections?: string[];           // IDs das coleções a baixar (ex: ['Import1', 'Usuarios']). Se vazio/omitido, todas.
  entities?: WixPullEntitiesSelection;
  createdAfter?: string | null;     // Data de corte ISO string (apenas itens criados após essa data)
  onlyNew?: boolean;                // Se true, não atualiza registros existentes, apenas insere novos
  maxItemsPerCollection?: number;   // Limite opcional por coleção
}

export interface WixPullResult {
  collectionsSynced: number;
  itemsSynced: number;
  leadsUpserted: number;
  clientsUpserted: number;
  partnersUpserted: number;
  productsUpserted?: number;
  salesCreated?: number;
  salesUpdated?: number;
  quotesCreated?: number;
  quotesUpdated?: number;
  totalRevenue?: number;
  durationMs: number;
  executedCollections?: string[];
  executedEntities?: string[];
}

export interface WixCollectionStatusInfo {
  id: string;
  displayName: string;
  collectionType?: string;
  itemsCount: number;
  lastSyncedAt: string | null;
}

export async function listWixCollectionsStatus(): Promise<WixCollectionStatusInfo[]> {
  await ensureSchema();

  const localRows = await sql<Array<{
    collection_id: string;
    collection_name: string;
    last_synced_at: string | null;
    items_count: string | number;
  }>>`
    SELECT
      wc.collection_id,
      wc.collection_name,
      wc.last_synced_at,
      COALESCE(COUNT(wi.id), 0) AS items_count
    FROM wix_collections wc
    LEFT JOIN wix_items wi ON wi.wix_collection_id = wc.id
    GROUP BY wc.id, wc.collection_id, wc.collection_name, wc.last_synced_at
    ORDER BY wc.collection_name ASC
  `;

  const map = new Map<string, WixCollectionStatusInfo>();
  for (const row of localRows) {
    map.set(row.collection_id, {
      id: row.collection_id,
      displayName: row.collection_name || row.collection_id,
      itemsCount: Number(row.items_count) || 0,
      lastSyncedAt: row.last_synced_at,
    });
  }

  try {
    if ((await isWixIntegrationEnabled()) && (await hasWixReadAccess())) {
      const remote = await wixListCollections();
      for (const r of remote) {
        if (!map.has(r.id)) {
          map.set(r.id, {
            id: r.id,
            displayName: r.displayName || r.id,
            collectionType: r.collectionType,
            itemsCount: 0,
            lastSyncedAt: null,
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'wix.list_collections_status.remote_failed');
  }

  const canonical = [
    { id: 'Import1', name: 'Import1 (Propostas & Vendas)' },
    { id: 'Usuarios', name: 'Usuarios (Parceiros & Vendedores)' },
    { id: 'Planos', name: 'Planos (Coberturas RC)' },
    { id: 'Seguros', name: 'Seguros (Serviços e Planos)' },
    { id: 'FORMULARIOHOMESITE', name: 'FORMULARIOHOMESITE (Leads Landing Page)' },
  ];

  for (const c of canonical) {
    if (!map.has(c.id)) {
      map.set(c.id, {
        id: c.id,
        displayName: c.name,
        itemsCount: 0,
        lastSyncedAt: null,
      });
    }
  }

  const priority: Record<string, number> = {
    Import1: 1,
    Usuarios: 2,
    Planos: 3,
    Seguros: 4,
    FORMULARIOHOMESITE: 5,
  };

  return Array.from(map.values()).sort((a, b) => {
    const prioA = priority[a.id] || 99;
    const prioB = priority[b.id] || 99;
    if (prioA !== prioB) return prioA - prioB;
    return a.displayName.localeCompare(b.displayName);
  });
}

export async function pullWixIntoLocalMirror(options?: WixPullOptions): Promise<WixPullResult> {
  await ensureSchema();

  if (!(await isWixIntegrationEnabled())) {
    throw new Error('Integração Wix desligada nas configurações');
  }

  if (!(await hasWixReadAccess())) {
    throw new Error('WIX_API_KEY/WIX_SITE_ID não configurados');
  }

  const startedAt = Date.now();
  const remoteCollections = await wixListCollections();

  // Opções e defaults (mantém compatibilidade total caso options seja omitido)
  const syncMirror = options?.entities?.mirror ?? true;
  const syncClients = options?.entities?.clients ?? true;
  const syncLeads = options?.entities?.leads ?? true;
  const syncPartners = options?.entities?.partners ?? true;
  const syncProducts = options?.entities?.products ?? true;
  const syncSales = options?.entities?.sales ?? false;
  const onlyNew = options?.onlyNew ?? false;
  const createdAfterTime = options?.createdAfter ? new Date(options.createdAfter).getTime() : null;

  // Seleção de coleções
  let targetCollections: Array<{ id: string; displayName?: string; collectionType?: string }> = [];
  if (options?.collections && options.collections.length > 0) {
    const remoteMap = new Map(remoteCollections.map((c) => [c.id, c]));
    targetCollections = options.collections.map((id) => remoteMap.get(id) || { id, displayName: id });
  } else {
    targetCollections = remoteCollections;
  }

  let collectionsSynced = 0;
  let itemsSynced = 0;
  let leadsUpserted = 0;
  let clientsUpserted = 0;
  let partnersUpserted = 0;
  let productsUpserted = 0;
  const executedCollections: string[] = [];

  for (const collection of targetCollections) {
    const schema = (await wixGetCollectionSchema(collection.id)) || {
      id: collection.id,
      displayName: collection.displayName,
      collectionType: collection.collectionType,
    };

    let collectionRowId = collection.id;
    if (syncMirror) {
      const row = await upsertCollection(collection, schema);
      collectionRowId = row.id;
    }

    collectionsSynced += 1;
    executedCollections.push(collection.id);

    let offset = 0;
    let pageCount = 0;
    let syncedItemsForCollection = 0;

    while (true) {
      const result = await wixQueryItems(collection.id, PAGE_SIZE, offset);
      if (!result) {
        throw new Error(`Falha ao consultar itens da coleção '${collection.id}' no offset ${offset} (API Wix indisponível ou erro de resposta)`);
      }
      const items = result.dataItems || [];
      if (!items.length) break;

      for (const item of items) {
        try {
          const mirror = await upsertItem({
            wixCollectionId: collectionRowId,
            item,
            collectionId: collection.id,
            skipDbInsert: !syncMirror,
          });

          // Filtro por data de criação do Wix (se especificado)
          if (createdAfterTime && mirror.wixCreatedAt) {
            const itemTime = new Date(mirror.wixCreatedAt).getTime();
            if (!Number.isNaN(itemTime) && itemTime < createdAfterTime) {
              continue;
            }
          }

          itemsSynced += 1;
          syncedItemsForCollection += 1;

          if (syncClients) {
            const clientId = await upsertInsuranceClientFromWix({
              collectionId: collection.id,
              mirror,
              onlyNew,
            });
            if (clientId) clientsUpserted += 1;
          }

          if (syncLeads && collection.id === 'Import1') {
            const leadId = await upsertLeadFromWix({
              collectionId: collection.id,
              mirror,
              onlyNew,
            });
            if (leadId) leadsUpserted += 1;
          }

          if (syncPartners && collection.id === 'Usuarios') {
            const partnerId = await upsertPartnerFromWix({
              collectionId: collection.id,
              mirror,
              onlyNew,
            });
            if (partnerId) partnersUpserted += 1;
          }

          if (syncProducts) {
            if (collection.id === 'Planos') {
              const pId = await upsertProductFromWixPlano(mirror);
              if (pId) productsUpserted += 1;
            } else if (collection.id === 'Seguros') {
              const pId = await upsertProductFromWixSeguro(mirror);
              if (pId) productsUpserted += 1;
            }
          }
        } catch (err) {
          logger.warn({
            err,
            collectionId: collection.id,
            itemId: item.id,
          }, 'wix.pull.item.skipped');
        }

        if (options?.maxItemsPerCollection && syncedItemsForCollection >= options.maxItemsPerCollection) {
          break;
        }
      }

      pageCount += 1;
      if (items.length < PAGE_SIZE) break;
      if (options?.maxItemsPerCollection && syncedItemsForCollection >= options.maxItemsPerCollection) {
        break;
      }
      offset += PAGE_SIZE;
    }

    if (syncMirror) {
      await sql`
        UPDATE wix_collections
        SET last_synced_at = NOW(),
            sync_cursor = ${String(offset)},
            updated_at = NOW()
        WHERE id = ${collectionRowId}
      `;
    }

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
        options: {
          onlyNew,
          createdAfter: options?.createdAfter || null,
        },
      },
    });
  }

  // Sincronização integrada de Vendas & Apólices caso solicitado
  let salesCreated = 0;
  let salesUpdated = 0;
  let quotesCreated = 0;
  let quotesUpdated = 0;
  let totalRevenue = 0;

  if (syncSales) {
    try {
      const salesResult = await syncWixSalesToLocalDb({ onlyNew });
      salesCreated = salesResult.salesCreated;
      salesUpdated = salesResult.salesUpdated;
      quotesCreated = salesResult.quotesCreated;
      quotesUpdated = salesResult.quotesUpdated;
      totalRevenue = salesResult.totalRevenue;
    } catch (err) {
      logger.error({ err }, 'wix.pull.sales_sync_failed');
    }
  }

  const durationMs = Date.now() - startedAt;
  const executedEntities: string[] = [];
  if (syncMirror) executedEntities.push('mirror');
  if (syncClients) executedEntities.push('clients');
  if (syncLeads) executedEntities.push('leads');
  if (syncPartners) executedEntities.push('partners');
  if (syncProducts) executedEntities.push('products');
  if (syncSales) executedEntities.push('sales');

  logger.info({
    collectionsSynced,
    itemsSynced,
    leadsUpserted,
    clientsUpserted,
    partnersUpserted,
    productsUpserted,
    salesCreated,
    salesUpdated,
    durationMs,
    executedCollections,
    executedEntities,
  }, 'wix.pull.completed');

  return {
    collectionsSynced,
    itemsSynced,
    leadsUpserted,
    clientsUpserted,
    partnersUpserted,
    productsUpserted,
    salesCreated,
    salesUpdated,
    quotesCreated,
    quotesUpdated,
    totalRevenue,
    durationMs,
    executedCollections,
    executedEntities,
  };
}
