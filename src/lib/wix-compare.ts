import { sql } from './pg';
import { ensureSchema } from './schema';
import { wixQueryItems, hasWixReadAccess, type WixQueryItem } from './wix-client';
import { normalizeDigits, normalizeMaybeString } from './wix-sync';
import { isWixIntegrationEnabled } from './system-settings';

export interface DbClientItem {
  id: string;
  fullName: string;
  documentNumber: string;
  documentType: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  createdAt: string;
  updatedAt: string;
  source: string;
  status: string | null;
  statusCliente: string | null;
  partnerNames: string | null;
  quotesCount: number;
  metadata: Record<string, unknown>;
}

export interface WixClientItem {
  id: string;
  name: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  statusCliente: string | null;
  partnerCode: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  rawData: Record<string, unknown>;
}

export interface FieldDiff {
  field: string;
  label: string;
  dbValue: string | null;
  wixValue: string | null;
}

export type MatchStatus = 'synced' | 'divergent' | 'only_db' | 'only_wix';

export interface ComparedClientRow {
  key: string;
  matchStatus: MatchStatus;
  hasDivergence: boolean;
  divergences: FieldDiff[];
  dbRecord: DbClientItem | null;
  wixRecord: WixClientItem | null;
  allWixRecords?: WixClientItem[];
  wixSubmissionsCount?: number;
  primaryName: string;
  primaryDocument: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  latestDate: string;
}

export interface WixComparisonResult {
  summary: {
    totalDb: number;
    totalWix: number;
    totalMatched: number;
    syncedExact: number;
    divergent: number;
    onlyDb: number;
    onlyWix: number;
    wixUniqueClientsCount?: number;
    wixDuplicateSubmissionsCount?: number;
    wixSource: 'live_api' | 'mirror_db' | 'unavailable';
    wixErrorMessage?: string;
  };
  rows: ComparedClientRow[];
  generatedAt: string;
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

function parseWixItem(item: WixQueryItem): WixClientItem {
  const data = extractItemData(item);
  const externalId = normalizeMaybeString(item.id) || '';
  const documentNumber =
    normalizeDigits(data.cpf) ||
    normalizeDigits(data.cnpj) ||
    normalizeDigits(data.documentNumber) ||
    null;
  const name =
    normalizeMaybeString(data.nome) ||
    normalizeMaybeString(data.name) ||
    normalizeMaybeString(data.nomeExibido) ||
    null;
  const email = normalizeMaybeString(data.email)?.toLowerCase() || null;
  const phone =
    normalizeDigits(data.celular) ||
    normalizeDigits(data.telefone) ||
    normalizeDigits(data.phone) ||
    null;
  const statusCliente =
    normalizeMaybeString(data.statusCliente) ||
    normalizeMaybeString(data.StatusCliente) ||
    null;
  const status = statusCliente || normalizeMaybeString(data.statusGeral) || null;
  const partnerCode =
    normalizeMaybeString(data.codigoVenda) ||
    normalizeMaybeString(data.codigoParceiro) ||
    normalizeMaybeString(data.codigo) ||
    null;
  const createdDate = toIsoDate((item as { _createdDate?: unknown })._createdDate);
  const updatedDate = toIsoDate((item as { _updatedDate?: unknown })._updatedDate);

  return {
    id: externalId,
    name,
    documentNumber,
    email,
    phone,
    status,
    statusCliente,
    partnerCode,
    createdDate,
    updatedDate,
    rawData: data,
  };
}

export async function fetchAllDbClients(): Promise<DbClientItem[]> {
  await ensureSchema();

  const rows = await sql<
    Array<{
      id: string;
      full_name: string;
      document_number: string;
      document_type: string;
      email: string | null;
      phone: string | null;
      birth_date: string | null;
      created_at: string;
      updated_at: string;
      metadata: Record<string, unknown> | null;
      partner_names: string | null;
      quotes_count: number;
    }>
  >`
    SELECT
      ic.id,
      ic.full_name,
      ic.document_number,
      ic.document_type,
      ic.email,
      ic.phone,
      ic.birth_date::text AS birth_date,
      ic.created_at::text AS created_at,
      ic.updated_at::text AS updated_at,
      ic.metadata,
      string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razao_social), ', ') AS partner_names,
      COUNT(DISTINCT c.id)::int AS quotes_count
    FROM insurance_clients ic
    LEFT JOIN cotacoes c ON c.client_id = ic.id
    LEFT JOIN partners p ON p.id = c.partner_id
    GROUP BY ic.id, ic.full_name, ic.document_number, ic.document_type, ic.email, ic.phone, ic.birth_date, ic.created_at, ic.updated_at, ic.metadata
    ORDER BY ic.created_at DESC
  `;

  return rows.map((r) => {
    const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const status = (meta.status as string) || null;
    const statusCliente = (meta.statusCliente as string) || null;
    const source = (meta.source as string) || 'local';

    return {
      id: r.id,
      fullName: r.full_name,
      documentNumber: normalizeDigits(r.document_number) || r.document_number,
      documentType: r.document_type || 'cpf',
      email: r.email ? r.email.trim().toLowerCase() : null,
      phone: r.phone ? normalizeDigits(r.phone) : null,
      birthDate: r.birth_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      source,
      status,
      statusCliente,
      partnerNames: r.partner_names,
      quotesCount: r.quotes_count,
      metadata: meta,
    };
  });
}

export async function fetchAllWixImport1Items(): Promise<{
  items: WixClientItem[];
  source: 'live_api' | 'mirror_db' | 'unavailable';
  errorMessage?: string;
}> {
  await ensureSchema();

  const wixEnabled = await isWixIntegrationEnabled();
  const hasAccess = await hasWixReadAccess();

  // 1. Tenta buscar da Live API do Wix se habilitado
  if (wixEnabled && hasAccess) {
    try {
      const allItems: WixClientItem[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await wixQueryItems('Import1', limit, offset);
        if (!response || !response.dataItems || response.dataItems.length === 0) {
          break;
        }

        for (const item of response.dataItems) {
          allItems.push(parseWixItem(item));
        }

        if (response.dataItems.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
          // Trava de segurança para evitar loops infinitos (ex: max 20.000 itens)
          if (offset > 20000) break;
        }
      }

      if (allItems.length > 0) {
        // Ordena Wix items do mais novo para o mais antigo (_createdDate DESC)
        allItems.sort((a, b) => {
          const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
          const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
          return dateB - dateA;
        });

        return { items: allItems, source: 'live_api' };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar API Wix';
      console.warn('Wix Live API query failed, falling back to mirror:', msg);
    }
  }

  // 2. Fallback para o espelho local da tabela wix_items
  try {
    const mirrorRows = await sql<
      Array<{
        id: string;
        wix_item_id: string;
        external_id: string | null;
        document_number: string | null;
        name: string | null;
        email: string | null;
        phone: string | null;
        status: string | null;
        partner_code: string | null;
        payload: Record<string, unknown> | null;
        wix_created_at: string | null;
        wix_updated_at: string | null;
      }>
    >`
      SELECT
        wi.id,
        wi.wix_item_id,
        wi.external_id,
        wi.document_number,
        wi.name,
        wi.email,
        wi.phone,
        wi.status,
        wi.partner_code,
        wi.payload,
        wi.wix_created_at::text AS wix_created_at,
        wi.wix_updated_at::text AS wix_updated_at
      FROM wix_items wi
      INNER JOIN wix_collections wc ON wc.id = wi.wix_collection_id
      WHERE wc.collection_id = 'Import1'
      ORDER BY COALESCE(wi.wix_created_at, wi.created_at) DESC
    `;

    if (mirrorRows.length > 0) {
      const items: WixClientItem[] = mirrorRows.map((m) => {
        const itemPayload = (m.payload as { item?: WixQueryItem })?.item;
        const rawData = itemPayload ? extractItemData(itemPayload) : (m.payload || {});

        return {
          id: m.wix_item_id,
          name: m.name,
          documentNumber: normalizeDigits(m.document_number) || m.document_number,
          email: m.email ? m.email.trim().toLowerCase() : null,
          phone: m.phone ? normalizeDigits(m.phone) : null,
          status: m.status,
          statusCliente: (rawData.statusCliente as string) || m.status,
          partnerCode: m.partner_code,
          createdDate: m.wix_created_at,
          updatedDate: m.wix_updated_at,
          rawData,
        };
      });

      return { items, source: 'mirror_db' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar espelho local do Wix';
    return { items: [], source: 'unavailable', errorMessage: msg };
  }

  return {
    items: [],
    source: wixEnabled && hasAccess ? 'live_api' : 'unavailable',
    errorMessage: !hasAccess ? 'Chaves WIX_API_KEY / WIX_SITE_ID não configuradas' : undefined,
  };
}

function calculateDivergences(db: DbClientItem, wix: WixClientItem): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Nome (compara ignorando maiúsculas e espaços extras)
  const normDbName = db.fullName.trim().toLowerCase();
  const normWixName = (wix.name || '').trim().toLowerCase();
  if (normWixName && normDbName !== normWixName) {
    diffs.push({
      field: 'name',
      label: 'Nome',
      dbValue: db.fullName,
      wixValue: wix.name,
    });
  }

  // E-mail
  const normDbEmail = db.email ? db.email.trim().toLowerCase() : '';
  const normWixEmail = wix.email ? wix.email.trim().toLowerCase() : '';
  if (normDbEmail && normWixEmail && normDbEmail !== normWixEmail) {
    diffs.push({
      field: 'email',
      label: 'E-mail',
      dbValue: db.email,
      wixValue: wix.email,
    });
  } else if ((!normDbEmail && normWixEmail) || (normDbEmail && !normWixEmail)) {
    diffs.push({
      field: 'email',
      label: 'E-mail (preenchimento)',
      dbValue: db.email || '(vazio no banco)',
      wixValue: wix.email || '(vazio no Wix)',
    });
  }

  // Telefone
  const normDbPhone = db.phone ? normalizeDigits(db.phone) : '';
  const normWixPhone = wix.phone ? normalizeDigits(wix.phone) : '';
  if (normDbPhone && normWixPhone && normDbPhone !== normWixPhone) {
    diffs.push({
      field: 'phone',
      label: 'Telefone',
      dbValue: db.phone,
      wixValue: wix.phone,
    });
  }

  // Status
  const normDbStatus = (db.statusCliente || db.status || '').trim().toLowerCase();
  const normWixStatus = (wix.statusCliente || wix.status || '').trim().toLowerCase();
  if (normDbStatus && normWixStatus && normDbStatus !== normWixStatus) {
    diffs.push({
      field: 'status',
      label: 'Status',
      dbValue: db.statusCliente || db.status,
      wixValue: wix.statusCliente || wix.status,
    });
  }

  return diffs;
}

export async function compareClientsWithWix(): Promise<WixComparisonResult> {
  const [dbClients, wixData] = await Promise.all([
    fetchAllDbClients(),
    fetchAllWixImport1Items(),
  ]);

  const wixItems = wixData.items;

  // Índices para busca rápida no Wix (suportando múltiplos envios/históricos por CPF e e-mail)
  const wixByDoc = new Map<string, WixClientItem[]>();
  const wixByEmail = new Map<string, WixClientItem[]>();
  const wixById = new Map<string, WixClientItem>();

  for (const item of wixItems) {
    if (item.documentNumber) {
      if (!wixByDoc.has(item.documentNumber)) {
        wixByDoc.set(item.documentNumber, []);
      }
      wixByDoc.get(item.documentNumber)!.push(item);
    }
    if (item.email) {
      const em = item.email.toLowerCase();
      if (!wixByEmail.has(em)) {
        wixByEmail.set(em, []);
      }
      wixByEmail.get(em)!.push(item);
    }
    if (item.id) {
      wixById.set(item.id, item);
    }
  }

  const matchedWixIds = new Set<string>();
  const rows: ComparedClientRow[] = [];

  let syncedExact = 0;
  let divergent = 0;
  let onlyDb = 0;

  // 1. Itera por todos os clientes do Banco de Dados (já ordenados do mais novo para o mais antigo)
  for (const db of dbClients) {
    const extId = (db.metadata?.externalId as string) || '';
    const allWixMatches: WixClientItem[] = [];

    if (db.documentNumber && wixByDoc.has(db.documentNumber)) {
      allWixMatches.push(...wixByDoc.get(db.documentNumber)!);
    }
    if (extId && wixById.has(extId) && !allWixMatches.some(m => m.id === extId)) {
      allWixMatches.push(wixById.get(extId)!);
    }
    if (db.email && wixByEmail.has(db.email)) {
      for (const it of wixByEmail.get(db.email)!) {
        if (!allWixMatches.some(m => m.id === it.id)) {
          allWixMatches.push(it);
        }
      }
    }

    if (allWixMatches.length > 0) {
      // Marca todos os IDs encontrados como associados a este cliente
      for (const matchIt of allWixMatches) {
        matchedWixIds.add(matchIt.id);
      }

      // Ordena os matches do Wix pelo mais recente
      allWixMatches.sort((a, b) => {
        const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return dateB - dateA;
      });

      const primaryMatch = allWixMatches[0];
      const diffs = calculateDivergences(db, primaryMatch);
      const isDivergent = diffs.length > 0;

      if (isDivergent) {
        divergent += 1;
      } else {
        syncedExact += 1;
      }

      rows.push({
        key: `db-${db.id}`,
        matchStatus: isDivergent ? 'divergent' : 'synced',
        hasDivergence: isDivergent,
        divergences: diffs,
        dbRecord: db,
        wixRecord: primaryMatch,
        allWixRecords: allWixMatches,
        wixSubmissionsCount: allWixMatches.length,
        primaryName: db.fullName || primaryMatch.name || 'Sem nome',
        primaryDocument: db.documentNumber || primaryMatch.documentNumber || 'Sem documento',
        primaryEmail: db.email || primaryMatch.email,
        primaryPhone: db.phone || primaryMatch.phone,
        latestDate: db.createdAt,
      });
    } else {
      onlyDb += 1;
      rows.push({
        key: `db-${db.id}`,
        matchStatus: 'only_db',
        hasDivergence: false,
        divergences: [],
        dbRecord: db,
        wixRecord: null,
        allWixRecords: [],
        wixSubmissionsCount: 0,
        primaryName: db.fullName,
        primaryDocument: db.documentNumber,
        primaryEmail: db.email,
        primaryPhone: db.phone,
        latestDate: db.createdAt,
      });
    }
  }

  // 2. Adiciona os itens do Wix Import1 que não foram encontrados no Banco de Dados local
  let onlyWix = 0;
  for (const wix of wixItems) {
    if (!matchedWixIds.has(wix.id)) {
      onlyWix += 1;
      rows.push({
        key: `wix-${wix.id}`,
        matchStatus: 'only_wix',
        hasDivergence: false,
        divergences: [],
        dbRecord: null,
        wixRecord: wix,
        allWixRecords: [wix],
        wixSubmissionsCount: 1,
        primaryName: wix.name || 'Sem nome (Wix)',
        primaryDocument: wix.documentNumber || 'Sem documento (Wix)',
        primaryEmail: wix.email,
        primaryPhone: wix.phone,
        latestDate: wix.createdDate || wix.updatedDate || new Date(0).toISOString(),
      });
    }
  }

  // 3. Ordenação global padrão: registros mais novos primeiro
  rows.sort((a, b) => {
    const dateA = a.latestDate ? new Date(a.latestDate).getTime() : 0;
    const dateB = b.latestDate ? new Date(b.latestDate).getTime() : 0;
    return dateB - dateA;
  });

  return {
    summary: {
      totalDb: dbClients.length,
      totalWix: wixItems.length,
      totalMatched: matchedWixIds.size,
      syncedExact,
      divergent,
      onlyDb,
      onlyWix,
      wixUniqueClientsCount: wixByDoc.size,
      wixDuplicateSubmissionsCount: Math.max(0, wixItems.length - wixByDoc.size),
      wixSource: wixData.source,
      wixErrorMessage: wixData.errorMessage,
    },
    rows,
    generatedAt: new Date().toISOString(),
  };
}

export interface WixSyncResult {
  totalWixProcessed: number;
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorsCount: number;
  details: Array<{
    wixId: string;
    documentNumber: string | null;
    name: string | null;
    action: 'imported' | 'updated' | 'unchanged' | 'skipped_no_doc' | 'error';
    changes?: string[];
    error?: string;
  }>;
  durationMs: number;
}

function parseBirthDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const match = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {}
  return null;
}

export async function syncWixClientsToLocalDb(): Promise<WixSyncResult> {
  await ensureSchema();
  const startTime = Date.now();

  const wixData = await fetchAllWixImport1Items();
  const wixItems = wixData.items;

  if (wixItems.length === 0) {
    if (wixData.source === 'unavailable') {
      throw new Error(wixData.errorMessage || 'Fonte de dados do Wix indisponível. Verifique as chaves WIX_API_KEY / WIX_SITE_ID.');
    }
    return {
      totalWixProcessed: 0,
      importedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorsCount: 0,
      details: [],
      durationMs: Date.now() - startTime,
    };
  }

  let importedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let errorsCount = 0;
  const details: WixSyncResult['details'] = [];

  for (const wix of wixItems) {
    try {
      const raw = wix.rawData || {};
      const documentNumber =
        wix.documentNumber ||
        normalizeDigits(raw.cpf) ||
        normalizeDigits(raw.cnpj) ||
        normalizeDigits(raw.documentNumber) ||
        normalizeDigits(raw.documento) ||
        normalizeDigits(raw.cpfCnpj) ||
        null;

      const name =
        wix.name ||
        normalizeMaybeString(raw.nome) ||
        normalizeMaybeString(raw.name) ||
        normalizeMaybeString(raw.nomeExibido) ||
        normalizeMaybeString(raw.razaoSocial) ||
        null;

      const email = wix.email ? wix.email.toLowerCase().trim() : (normalizeMaybeString(raw.email)?.toLowerCase().trim() || null);
      const phone = wix.phone ? normalizeDigits(wix.phone) : (normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || null);
      const birthDate = parseBirthDate(raw.dataNascimento || raw.dataNascto || raw.nascimento || raw.birthDate);
      const statusCliente = wix.statusCliente || normalizeMaybeString(raw.statusCliente) || normalizeMaybeString(raw.StatusCliente) || null;
      const status = wix.status || statusCliente || normalizeMaybeString(raw.statusGeral) || null;
      const partnerCode = wix.partnerCode || normalizeMaybeString(raw.codigoVenda) || normalizeMaybeString(raw.codigoParceiro) || null;
      const wixCreatedAt = wix.createdDate ? new Date(wix.createdDate) : new Date();

      if (!documentNumber) {
        // Se não possui CPF/CNPJ, tentamos localizar por external_id no metadata ou email
        const [existingByExtOrEmail] = await sql<Array<{ id: string; full_name: string; document_number: string }>>`
          SELECT id, full_name, document_number
          FROM insurance_clients
          WHERE metadata->>'externalId' = ${wix.id}
             OR (${email ? email : ''} != '' AND LOWER(email) = ${email || ''})
          LIMIT 1
        `;

        if (!existingByExtOrEmail) {
          details.push({
            wixId: wix.id,
            documentNumber: null,
            name,
            action: 'skipped_no_doc',
            error: 'Registro do Wix sem CPF/CNPJ válido para criação no banco local',
          });
          continue;
        }
      }

      // 1. Busca se cliente já existe no banco de dados local
      let existingClient: {
        id: string;
        full_name: string;
        document_number: string;
        email: string | null;
        phone: string | null;
        birth_date: string | null;
        metadata: Record<string, unknown> | null;
      } | null = null;

      if (documentNumber) {
        const [byDoc] = await sql<Array<{
          id: string;
          full_name: string;
          document_number: string;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          metadata: Record<string, unknown> | null;
        }>>`
          SELECT id, full_name, document_number, email, phone, birth_date::text, metadata
          FROM insurance_clients
          WHERE document_number = ${documentNumber}
          LIMIT 1
        `;
        if (byDoc) existingClient = byDoc;
      }

      if (!existingClient && wix.id) {
        const [byExt] = await sql<Array<{
          id: string;
          full_name: string;
          document_number: string;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          metadata: Record<string, unknown> | null;
        }>>`
          SELECT id, full_name, document_number, email, phone, birth_date::text, metadata
          FROM insurance_clients
          WHERE metadata->>'externalId' = ${wix.id}
          LIMIT 1
        `;
        if (byExt) existingClient = byExt;
      }

      if (!existingClient && email) {
        const [byEmail] = await sql<Array<{
          id: string;
          full_name: string;
          document_number: string;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          metadata: Record<string, unknown> | null;
        }>>`
          SELECT id, full_name, document_number, email, phone, birth_date::text, metadata
          FROM insurance_clients
          WHERE LOWER(email) = ${email}
          LIMIT 1
        `;
        if (byEmail) existingClient = byEmail;
      }

      const metadataPayload = {
        source: 'wix',
        collectionId: 'Import1',
        externalId: wix.id,
        status,
        statusCliente,
        partnerCode,
        lastSyncedAt: new Date().toISOString(),
        wix: raw,
      };

      if (existingClient) {
        // 2. ATUALIZAR CLIENTE EXISTENTE (Wix considerado mais atualizado)
        const changes: string[] = [];

        if (name && existingClient.full_name !== name) {
          changes.push(`Nome: '${existingClient.full_name}' -> '${name}'`);
        }
        if (email && existingClient.email?.toLowerCase() !== email) {
          changes.push(`E-mail: '${existingClient.email || ''}' -> '${email}'`);
        }
        if (phone && existingClient.phone !== phone) {
          changes.push(`Telefone: '${existingClient.phone || ''}' -> '${phone}'`);
        }
        if (birthDate && existingClient.birth_date !== birthDate) {
          changes.push(`Nascimento: '${existingClient.birth_date || ''}' -> '${birthDate}'`);
        }
        const existingStatus = (existingClient.metadata?.statusCliente as string) || (existingClient.metadata?.status as string) || '';
        if (statusCliente && existingStatus !== statusCliente) {
          changes.push(`Status: '${existingStatus}' -> '${statusCliente}'`);
        }

        await sql`
          UPDATE insurance_clients
          SET
            full_name = COALESCE(${name || null}::text, full_name),
            email = COALESCE(${email || null}::text, email),
            phone = COALESCE(${phone || null}::text, phone),
            birth_date = COALESCE(${birthDate || null}::date, birth_date),
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadataPayload)}::jsonb,
            updated_at = NOW()
          WHERE id = ${existingClient.id}
        `;

        if (changes.length > 0) {
          updatedCount += 1;
          details.push({
            wixId: wix.id,
            documentNumber: existingClient.document_number,
            name: name || existingClient.full_name,
            action: 'updated',
            changes,
          });
        } else {
          unchangedCount += 1;
          details.push({
            wixId: wix.id,
            documentNumber: existingClient.document_number,
            name: name || existingClient.full_name,
            action: 'unchanged',
          });
        }
      } else {
        // 3. INSERIR NOVO CLIENTE (vindo exclusivamente do Wix)
        const docNum = documentNumber || `WIX-${wix.id}`;
        const docType = docNum.length > 11 ? 'cnpj' : 'cpf';

        await sql`
          INSERT INTO insurance_clients (
            document_number,
            document_type,
            full_name,
            email,
            phone,
            birth_date,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            ${docNum},
            ${docType},
            ${name || 'Cliente Wix ' + wix.id},
            ${email || null}::text,
            ${phone || null}::text,
            ${birthDate || null}::date,
            ${JSON.stringify(metadataPayload)}::jsonb,
            ${wixCreatedAt},
            NOW()
          )
          ON CONFLICT (document_number)
          DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = COALESCE(EXCLUDED.email, insurance_clients.email),
            phone = COALESCE(EXCLUDED.phone, insurance_clients.phone),
            birth_date = COALESCE(EXCLUDED.birth_date, insurance_clients.birth_date),
            metadata = insurance_clients.metadata || EXCLUDED.metadata,
            updated_at = NOW()
        `;

        importedCount += 1;
        details.push({
          wixId: wix.id,
          documentNumber: docNum,
          name: name || 'Cliente Wix ' + wix.id,
          action: 'imported',
          changes: ['Novo cliente importado do Wix Import1'],
        });
      }

      // 4. Também sincroniza com a tabela de LEADS
      let existingLead: { id: string } | null = null;
      if (wix.id) {
        const [byExt] = await sql<Array<{ id: string }>>`
          SELECT id FROM leads WHERE external_id = ${wix.id} LIMIT 1
        `;
        if (byExt) existingLead = byExt;
      }
      if (!existingLead && documentNumber) {
        const [byDoc] = await sql<Array<{ id: string }>>`
          SELECT id FROM leads WHERE document_number = ${documentNumber} LIMIT 1
        `;
        if (byDoc) existingLead = byDoc;
      }

      if (existingLead) {
        await sql`
          UPDATE leads
          SET
            nome = COALESCE(${name || null}::text, nome),
            email = COALESCE(${email || null}::text, email),
            telefone = COALESCE(${phone || null}::text, telefone),
            status = COALESCE(${status || null}::text, status),
            status_cliente = COALESCE(${statusCliente || null}::text, status_cliente),
            raw = ${JSON.stringify({ sourceCollection: 'Import1', wix: raw })}::jsonb,
            synced_at = NOW(),
            data_atualizacao = NOW()
          WHERE id = ${existingLead.id}
        `;
      } else {
        await sql`
          INSERT INTO leads (
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
            ${wix.id},
            ${documentNumber || null}::text,
            ${name || null}::text,
            ${email || null}::text,
            ${phone || null}::text,
            'wix',
            ${status || 'novo'},
            ${statusCliente || null}::text,
            ${JSON.stringify({ sourceCollection: 'Import1', wix: raw })}::jsonb,
            NOW(),
            'wix',
            ${wixCreatedAt},
            NOW()
          )
        `;
      }
    } catch (itemErr) {
      errorsCount += 1;
      const errMsg = itemErr instanceof Error ? itemErr.message : String(itemErr);
      details.push({
        wixId: wix.id,
        documentNumber: wix.documentNumber,
        name: wix.name,
        action: 'error',
        error: errMsg,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    totalWixProcessed: wixItems.length,
    importedCount,
    updatedCount,
    unchangedCount,
    errorsCount,
    details,
    durationMs,
  };
}

