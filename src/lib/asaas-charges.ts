import { getAsaasConfig } from './system-settings';
import { logger } from './logger';

/**
 * Consulta de cobranças direto na API do Asaas.
 *
 * Os links de boleto gravados no banco (importados do Wix/CSV ou de webhooks
 * antigos) apontam para PDFs assinados que expiram — abrir depois disso dá
 * página de erro. Aqui buscamos a cobrança em tempo real, o que devolve
 * `invoiceUrl`/`bankSlipUrl` válidos no momento do clique.
 */

export interface AsaasCharge {
  id: string;
  customer: string;
  installment: string | null;
  installmentNumber: number | null;
  description: string | null;
  billingType: string;
  status: string;
  value: number;
  netValue: number | null;
  dueDate: string | null;
  originalDueDate: string | null;
  paymentDate: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
  invoiceNumber: string | null;
  externalReference: string | null;
  deleted: boolean;
}

export interface AsaasChargesLookup {
  ok: boolean;
  error?: string;
  /** IDs de cliente no Asaas efetivamente consultados. */
  customerIds: string[];
  charges: AsaasCharge[];
  /** true quando a API cortou a listagem no teto de páginas. */
  truncated: boolean;
}

const MAX_PAGES = 10;
const PAGE_SIZE = 100;

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return isNaN(n) ? 0 : n;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function normalizeCharge(raw: Record<string, unknown>): AsaasCharge {
  return {
    id: String(raw.id ?? ''),
    customer: String(raw.customer ?? ''),
    installment: toStringOrNull(raw.installment),
    installmentNumber:
      typeof raw.installmentNumber === 'number' ? raw.installmentNumber : null,
    description: toStringOrNull(raw.description),
    billingType: String(raw.billingType ?? 'UNDEFINED'),
    status: String(raw.status ?? 'UNKNOWN'),
    value: toNumber(raw.value),
    netValue: raw.netValue == null ? null : toNumber(raw.netValue),
    dueDate: toStringOrNull(raw.dueDate),
    originalDueDate: toStringOrNull(raw.originalDueDate),
    paymentDate: toStringOrNull(raw.paymentDate) ?? toStringOrNull(raw.clientPaymentDate),
    invoiceUrl: toStringOrNull(raw.invoiceUrl),
    bankSlipUrl: toStringOrNull(raw.bankSlipUrl),
    transactionReceiptUrl: toStringOrNull(raw.transactionReceiptUrl),
    invoiceNumber: toStringOrNull(raw.invoiceNumber),
    externalReference: toStringOrNull(raw.externalReference),
    deleted: raw.deleted === true,
  };
}

async function asaasGet(
  baseUrl: string,
  apiKey: string,
  path: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { access_token: apiKey, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** Resolve os IDs de cliente no Asaas a partir do CPF/CNPJ. */
export async function findAsaasCustomerIdsByDocument(
  cpfCnpj: string
): Promise<string[]> {
  const doc = cpfCnpj.replace(/\D/g, '');
  if (!doc) return [];

  const { apiKey, baseUrl } = await getAsaasConfig();
  if (!apiKey) return [];

  const { ok, body } = await asaasGet(baseUrl, apiKey, `/customers?cpfCnpj=${doc}&limit=${PAGE_SIZE}`);
  if (!ok || !Array.isArray(body.data)) return [];

  return (body.data as Array<Record<string, unknown>>)
    .map((c) => toStringOrNull(c.id))
    .filter((id): id is string => !!id);
}

/** Lista todas as cobranças de um cliente do Asaas (paginado). */
async function listChargesForCustomer(
  baseUrl: string,
  apiKey: string,
  customerId: string
): Promise<{ charges: AsaasCharge[]; truncated: boolean }> {
  const charges: AsaasCharge[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { ok, body } = await asaasGet(
      baseUrl,
      apiKey,
      `/payments?customer=${encodeURIComponent(customerId)}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    if (!ok || !Array.isArray(body.data)) break;

    for (const item of body.data as Array<Record<string, unknown>>) {
      charges.push(normalizeCharge(item));
    }

    if (body.hasMore !== true) return { charges, truncated: false };
    offset += PAGE_SIZE;
  }

  return { charges, truncated: true };
}

/**
 * Busca em tempo real todas as cobranças do cliente no Asaas, identificando-o
 * pelo `customerId` (cus_xxx) e/ou pelo CPF/CNPJ.
 */
export async function listAsaasChargesForClient(params: {
  customerIds?: Array<string | null | undefined>;
  cpfCnpj?: string | null;
}): Promise<AsaasChargesLookup> {
  const { apiKey, baseUrl } = await getAsaasConfig();

  if (!apiKey) {
    return {
      ok: false,
      error: 'Chave da API do Asaas não configurada no sistema.',
      customerIds: [],
      charges: [],
      truncated: false,
    };
  }

  const ids = new Set<string>();
  for (const id of params.customerIds ?? []) {
    if (typeof id === 'string' && id.trim()) ids.add(id.trim());
  }

  // Sem customerId conhecido (ou para pegar cadastros duplicados), resolve pelo documento.
  if (params.cpfCnpj) {
    try {
      for (const id of await findAsaasCustomerIdsByDocument(params.cpfCnpj)) {
        ids.add(id);
      }
    } catch (err) {
      logger.warn({ err }, 'asaas.charges.customer_lookup_failed');
    }
  }

  if (ids.size === 0) {
    return {
      ok: true,
      customerIds: [],
      charges: [],
      truncated: false,
      error: 'Cliente não localizado no Asaas pelo CPF/CNPJ nem pelo ID de cliente.',
    };
  }

  const byId = new Map<string, AsaasCharge>();
  let truncated = false;

  for (const customerId of ids) {
    try {
      const result = await listChargesForCustomer(baseUrl, apiKey, customerId);
      truncated = truncated || result.truncated;
      for (const charge of result.charges) {
        if (charge.id) byId.set(charge.id, charge);
      }
    } catch (err) {
      logger.error({ err, customerId }, 'asaas.charges.list_failed');
    }
  }

  const charges = [...byId.values()].sort((a, b) => {
    const da = a.dueDate ?? '';
    const db = b.dueDate ?? '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0);
  });

  return { ok: true, customerIds: [...ids], charges, truncated };
}
