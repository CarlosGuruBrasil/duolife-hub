// In-memory store com limpeza automática periódica e proteção contra estouro de memória (OOM).
// Em cluster/múltiplas instâncias, troque por Redis (ioredis / upstash).
const store = new Map<string, { count: number; reset: number }>();
const MAX_STORE_SIZE = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function purgeExpired(now: number) {
  for (const [k, v] of store.entries()) {
    if (now > v.reset) {
      store.delete(k);
    }
  }
  // Se ainda estiver no limite ou acima após expiração (ataque DoS maciço), abre espaço para nova entrada
  if (store.size >= MAX_STORE_SIZE) {
    const toDelete = store.size - MAX_STORE_SIZE + 1;
    let deleted = 0;
    for (const key of store.keys()) {
      store.delete(key);
      deleted++;
      if (deleted >= toDelete) break;
    }
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();

  // Executa expurgo se o intervalo decorreu ou o tamanho atingiu o teto
  if (now - lastCleanup > CLEANUP_INTERVAL_MS || store.size >= MAX_STORE_SIZE) {
    purgeExpired(now);
    lastCleanup = now;
  }

  const entry = store.get(key);

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
