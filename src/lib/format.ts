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

/**
 * Dicionário universal de tradução e localização de status de todo o ecossistema DuoLife Hub.
 * Cobre cotações, assinaturas (ZapSign), cobranças/parcelas (Asaas), vendas/apólices e comissões.
 */
export const GLOBAL_STATUS_LABELS: Record<string, string> = {
  // Cotações / Propostas
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguardando assinatura',
  assinado: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  emitida: 'Apólice emitida',
  draft: 'Rascunho',
  approved: 'Aprovada',
  rejected: 'Recusada',
  expired: 'Expirada',

  // ZapSign / Documentos de Assinatura
  signed: 'Assinado',
  pending: 'Pendente',
  waiting_signatures: 'Aguardando assinatura',
  refused: 'Recusado',
  cancelled: 'Cancelado',

  // Asaas / Financeiro / Ordens / Parcelas
  paid: 'Pago',
  paga: 'Paga',
  confirmed: 'Confirmado',
  received: 'Recebido',
  received_in_cash: 'Recebido em dinheiro',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  refunded: 'Estornado',
  estornada: 'Estornada',
  refund_requested: 'Estorno solicitado',
  refund_in_progress: 'Estorno em andamento',
  chargeback_requested: 'Chargeback solicitado',
  chargeback_dispute: 'Chargeback em disputa',
  awaiting_risk_analysis: 'Em análise de risco',
  dunning_requested: 'Em negativação',
  dunning_received: 'Negativação recebida',
  payment_deleted: 'Removida',

  // Vendas / Apólices
  ativa: 'Ativa',
  active: 'Ativa',
  cancelada: 'Cancelada',
  suspensa: 'Suspensa',
  suspended: 'Suspensa',
  inativo: 'Inativo',
  inactive: 'Inativo',

  // Comissões
  pendente: 'Pendente',
};

/**
 * Formata qualquer status em código/inglês para o rótulo amigável em pt-BR de forma insensível a maiúsculas/minúsculas.
 */
export function formatStatusLabel(status: string | null | undefined, fallback = '-'): string {
  if (!status) return fallback;
  const clean = String(status).trim();
  if (!clean) return fallback;
  const lower = clean.toLowerCase();
  return GLOBAL_STATUS_LABELS[lower] || GLOBAL_STATUS_LABELS[clean] || clean;
}

export { formatAtuacao, parseAtuacaoList, AREAS_ATUACAO_MAP } from './atuacao';

