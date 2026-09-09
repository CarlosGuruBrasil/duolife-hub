// Formatadores de exibição. `0` é um valor válido (prêmio zerado, cortesia) e precisa
// aparecer como R$ 0,00 — não como '-'.
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
