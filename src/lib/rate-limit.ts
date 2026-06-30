// ponytail: in-memory store, reinicia com o processo. Troque por Redis se rodar múltiplas instâncias.
const store = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
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
