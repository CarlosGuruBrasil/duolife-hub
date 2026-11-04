import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';

interface CepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

// In-memory cache de CEPs para mitigar DoS e chamadas externas desnecessárias (TTL de 24h)
const cepCache = new Map<string, { data: CepResponse; expires: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 50_000;

function cacheLookup(digits: string): CepResponse | null {
  const entry = cepCache.get(digits);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cepCache.delete(digits);
    return null;
  }
  return entry.data;
}

function cacheSet(digits: string, data: CepResponse) {
  if (cepCache.size >= MAX_CACHE_SIZE) {
    // Purga os primeiros 1.000 registros para evitar OOM
    let count = 0;
    for (const key of cepCache.keys()) {
      cepCache.delete(key);
      count++;
      if (count >= 1000) break;
    }
  }
  cepCache.set(digits, { data, expires: Date.now() + CACHE_TTL_MS });
}

// Timeout com AbortController
async function fetchWithTimeout(url: string, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DuoLife-Hub/1.0',
      },
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Provedor 1: ViaCEP
async function lookupViaCep(digits: string): Promise<CepResponse | null> {
  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${digits}/json/`, 3500);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro === true || data.erro === 'true') return null;

    return {
      cep: data.cep || `${digits.slice(0, 5)}-${digits.slice(5)}`,
      logradouro: (data.logradouro || '').trim(),
      complemento: (data.complemento || '').trim(),
      bairro: (data.bairro || '').trim(),
      cidade: (data.localidade || '').trim(),
      uf: (data.uf || '').trim().toUpperCase(),
    };
  } catch {
    return null;
  }
}

// Provedor 2: BrasilAPI (Fallback)
async function lookupBrasilApi(digits: string): Promise<CepResponse | null> {
  try {
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v1/${digits}`, 3500);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.city || !data.state) return null;

    return {
      cep: data.cep || `${digits.slice(0, 5)}-${digits.slice(5)}`,
      logradouro: (data.street || '').trim(),
      complemento: '',
      bairro: (data.neighborhood || '').trim(),
      cidade: (data.city || '').trim(),
      uf: (data.state || '').trim().toUpperCase(),
    };
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cep: string }> }
) {
  // Mitigação DoS: Rate limiting por IP (30 consultas por minuto)
  const clientIp = getClientIp(_request);
  const rl = rateLimit(`cep:${clientIp}`, 30, 60_000);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfter);
  }

  const { cep } = await params;
  const digits = (cep || '').replace(/\D/g, '');

  if (digits.length !== 8) {
    return NextResponse.json(
      { ok: false, error: 'CEP inválido. Deve conter 8 dígitos.' },
      { status: 400 }
    );
  }

  // Verifica cache em memória
  const cached = cacheLookup(digits);
  if (cached) {
    return NextResponse.json(
      { ok: true, endereco: cached },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
          'X-Cache': 'HIT',
        },
      }
    );
  }

  // 1. Tenta ViaCEP
  let endereco = await lookupViaCep(digits);

  // 2. Fallback para BrasilAPI caso ViaCEP falhe ou demore
  if (!endereco) {
    endereco = await lookupBrasilApi(digits);
  }

  if (!endereco) {
    return NextResponse.json(
      { ok: false, error: 'CEP não localizado nos serviços integrados.' },
      { status: 404 }
    );
  }

  // Grava no cache
  cacheSet(digits, endereco);

  return NextResponse.json(
    { ok: true, endereco },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
        'X-Cache': 'MISS',
      },
    }
  );
}
