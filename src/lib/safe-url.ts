// linkBoleto/signUrl vêm de `cotacoes.client_data` (JSONB gravado por webhook do Asaas/ZapSign).
// Renderizar isso direto num href aceita `javascript:` — XSS de um clique. Só http(s) passa.
export function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}
