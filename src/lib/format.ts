// Formatadores de exibição. `0` é um valor válido (prêmio zerado, cortesia) e precisa
// aparecer como R$ 0,00 — não como '-'.
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Converte com segurança strings monetárias ou numéricas em número real.
 * Suporta formatos brasileiros (ex: "1.250,50", "180,00", "R$ 516,67")
 * e floats em string internacionais (ex: "516.67", "1250.50").
 */
export function parseCurrencyToNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const clean = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!clean) return fallback;

  // Se tem vírgula como decimal (ex: 1.250,50 ou 180,00)
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : fallback;
  }

  // Se tem apenas pontos ou dígitos normais (ex: 103.33 ou 720)
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  // 'YYYY-MM-DD' é parseado como UTC pelo JS; no fuso -03 isso exibe o dia
  // anterior. Datas sem hora (vencimento, vigência) viram meio-dia local.
  const normalized =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export { formatAtuacao, parseAtuacaoList, AREAS_ATUACAO_MAP } from './atuacao';
