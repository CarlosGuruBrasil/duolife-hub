const WIX_DATA_BASE = 'https://www.wixapis.com/wix-data/v2';

export interface WixConfig {
  apiKey: string;
  siteId: string;
}

export interface WixCollectionSummary {
  id: string;
  displayName?: string;
  collectionType?: string;
}

export interface WixCollectionSchema extends WixCollectionSummary {
  fields?: Array<Record<string, unknown>>;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WixQueryItem {
  id: string;
  data: Record<string, unknown>;
  _createdDate?: unknown;
  _updatedDate?: unknown;
  [key: string]: unknown;
}

export interface WixQueryResponse {
  dataItems?: WixQueryItem[];
  pagingMetadata?: {
    count?: number;
    hasNext?: boolean;
    cursor?: string;
  };
  [key: string]: unknown;
}

export function getWixConfig(): WixConfig | null {
  const apiKey = process.env.WIX_API_KEY || process.env.WIX_AUTH_TOKEN || '';
  const siteId = process.env.WIX_SITE_ID || process.env.WIX_SITEID || '';
  if (!apiKey || !siteId) return null;
  return { apiKey, siteId };
}

function wixHeaders(config: WixConfig) {
  return {
    Authorization: config.apiKey,
    'wix-site-id': config.siteId,
    'Content-Type': 'application/json',
  };
}

async function wixRequest<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const config = getWixConfig();
  if (!config) {
    return { ok: false, status: 503, data: null, text: 'WIX_API_KEY/WIX_SITE_ID não configurados' };
  }

  const response = await fetch(`${WIX_DATA_BASE}${path}`, {
    ...init,
    headers: {
      ...wixHeaders(config),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

export async function wixListCollections(): Promise<WixCollectionSummary[]> {
  const result = await wixRequest<{ collections?: WixCollectionSummary[]; dataCollections?: WixCollectionSummary[] }>('/collections?fields=displayName');
  if (!result.ok || !result.data) return [];
  return result.data.collections || result.data.dataCollections || [];
}

export async function wixGetCollectionSchema(collectionId: string): Promise<WixCollectionSchema | null> {
  const result = await wixRequest<WixCollectionSchema>(`/collections/${encodeURIComponent(collectionId)}`);
  if (!result.ok || !result.data) return null;
  return result.data;
}

export async function wixQueryItems(collectionId: string, limit = 100, offset = 0): Promise<WixQueryResponse | null> {
  const result = await wixRequest<WixQueryResponse>('/items/query', {
    method: 'POST',
    body: JSON.stringify({
      dataCollectionId: collectionId,
      query: {
        paging: { limit, offset },
      },
      returnTotalCount: false,
    }),
  });

  if (!result.ok || !result.data) return null;
  return result.data;
}

export function hasWixReadAccess(): boolean {
  return !!getWixConfig();
}

