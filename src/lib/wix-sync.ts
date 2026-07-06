import { sql } from './pg';

export interface NormalizedWixRecord {
  raw: Record<string, unknown>;
  externalId: string | null;
  documentNumber: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  origem: string;
  status: string;
  sourceSystem: string;
  partnerWixCode: string | null;
  productCode: string | null;
  productName: string | null;
}

export function normalizeDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function normalizeMaybeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractWixRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const candidate = body as Record<string, unknown>;
    if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) {
      return candidate.data as Record<string, unknown>;
    }
    return candidate;
  }
  return {};
}

export function normalizeWixRecord(body: unknown): NormalizedWixRecord {
  const raw = extractWixRecord(body);
  const externalId = normalizeMaybeString(raw._id) || normalizeMaybeString(raw.externalId) || null;
  const documentNumber = normalizeDigits(raw.cpf) || normalizeDigits(raw.cnpj) || normalizeDigits(raw.documentNumber) || null;
  const nome = normalizeMaybeString(raw.nome) || normalizeMaybeString(raw.name) || null;
  const email = normalizeMaybeString(raw.email)?.toLowerCase() ?? null;
  const telefone = normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || normalizeDigits(raw.phone) || null;
  const origem = normalizeMaybeString(raw.origem) || normalizeMaybeString(raw.source) || 'wix';
  const status = normalizeMaybeString(raw.statusGeral) || normalizeMaybeString(raw.status) || 'novo';
  const sourceSystem = normalizeMaybeString(raw.source_system) || 'wix';
  const partnerWixCode =
    normalizeMaybeString(raw.codigoVenda) ||
    normalizeMaybeString(raw.codigoParceiro) ||
    normalizeMaybeString(raw.codigo) ||
    null;
  const productCode = normalizeMaybeString(raw.tipo) || normalizeMaybeString(raw.nomePlano) || null;
  const productName = normalizeMaybeString(raw.nomePlano) || normalizeMaybeString(raw.tipo) || null;

  return {
    raw,
    externalId,
    documentNumber,
    nome,
    email,
    telefone,
    origem,
    status,
    sourceSystem,
    partnerWixCode,
    productCode,
    productName,
  };
}

export async function findPartnerByWixCode(wixCode: string | null): Promise<{ id: string } | null> {
  if (!wixCode) return null;
  const [partner] = await sql<{ id: string }[]>`
    SELECT id
    FROM partners
    WHERE metadata->'whiteLabel'->>'wixCode' = ${wixCode}
       OR metadata->'wix'->>'partnerCode' = ${wixCode}
       OR metadata->>'wixCode' = ${wixCode}
    LIMIT 1
  `;
  return partner ?? null;
}

export async function logSyncEvent(params: {
  entityType: string;
  entityId: string;
  sourceSystem: string;
  direction: string;
  eventType: string;
  status: string;
  payload: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  await sql`
    INSERT INTO sync_log (
      entity_type, entity_id, source_system, direction, event_type, status, payload, error_message
    )
    VALUES (
      ${params.entityType},
      ${params.entityId},
      ${params.sourceSystem},
      ${params.direction},
      ${params.eventType},
      ${params.status},
      ${JSON.stringify(params.payload)}::jsonb,
      ${params.errorMessage ?? null}
    )
  `;
}
