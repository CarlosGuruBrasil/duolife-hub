// ponytail: defesa contra client_data vir como string em vez de objeto (double-encoding
// na escrita, driver do Postgres, ou coluna legada) — nunca confiar que JSONB já vem parseado.
export function parseJsonbField<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object') return value as T;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return (parsed && typeof parsed === 'object' ? parsed : {}) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}
