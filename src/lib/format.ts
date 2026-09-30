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

  // Se NÃO tem vírgula:
  // Caso 1: múltiplos pontos (ex: 1.000.000 ou 10.000.000) -> pontos são separadores de milhar
  if ((clean.match(/\./g) || []).length > 1) {
    const normalized = clean.replace(/\./g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : fallback;
  }

  // Caso 2: ponto único (ex: 100000.00 ou 361.67 vs 100.000)
  if (clean.includes('.')) {
    const parts = clean.split('.');
    // Se a parte decimal tem exatamente 3 dígitos e a parte inteira tem até 3 dígitos (ex: 100.000, 500.000, 1.000)
    // trata como separador de milhar brasileiro sem centavos
    if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
      const normalized = clean.replace(/\./g, '');
      const n = parseFloat(normalized);
      return Number.isFinite(n) ? n : fallback;
    }
    // Caso padrão de float / banco de dados (ex: 100000.00, 361.67, 100.5, 680.00)
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : fallback;
  }

  // Se tem apenas dígitos normais (ex: 720 ou 100000)
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

/**
 * Detecta e corrige automaticamente valores de cobertura e prêmio corrompidos
 * pela multiplicação indevida por 100 (antiga remoção ingênua do separador decimal).
 */
export function sanitizePlanFinancials(options: {
  planoNome?: string | null;
  cobertura?: unknown;
  premio?: unknown;
}): { cobertura: number; premio: number } {
  let cobertura = parseCurrencyToNumber(options.cobertura, 0);
  let premio = parseCurrencyToNumber(options.premio, 0);

  const planoLower = String(options.planoNome || '').toLowerCase().trim();

  // Mapeamento de LMI esperado por nome de plano
  let expectedLmi: number | null = null;
  if (planoLower.includes('100k') || planoLower.includes('100 mil') || planoLower.includes('100.000')) {
    expectedLmi = 100000;
  } else if (planoLower.includes('200k') || planoLower.includes('200 mil') || planoLower.includes('200.000')) {
    expectedLmi = 200000;
  } else if (planoLower.includes('300k') || planoLower.includes('300 mil') || planoLower.includes('300.000')) {
    expectedLmi = 300000;
  } else if (planoLower.includes('500k') || planoLower.includes('500 mil') || planoLower.includes('500.000')) {
    expectedLmi = 500000;
  } else if (planoLower.includes('1m') || planoLower.includes('1 milhão') || planoLower.includes('1.000.000')) {
    expectedLmi = 1000000;
  } else if (planoLower.includes('2m') || planoLower.includes('2 milhões') || planoLower.includes('2.000.000')) {
    expectedLmi = 2000000;
  } else if (planoLower.includes('3m') || planoLower.includes('3 milhões') || planoLower.includes('3.000.000')) {
    expectedLmi = 3000000;
  }

  // Se cobertura for exatamente 100x o LMI esperado ou se for >= 10 milhões para plano <= 500k
  if (expectedLmi !== null) {
    if (Math.round(cobertura) === expectedLmi * 100 || (expectedLmi <= 500000 && cobertura >= 10000000)) {
      cobertura = expectedLmi;
    }
  }

  // Se o prêmio tiver sido multiplicado por 100 (ex: 36167 quando era 361.67)
  if (premio >= 10000 && (expectedLmi === null || expectedLmi <= 500000)) {
    const divided = Math.round(premio) / 100;
    if (divided >= 100 && divided <= 6000) {
      premio = divided;
    }
  }

  return { cobertura, premio };
}

/**
 * Formata o plano de seguro em formato padronizado e compacto (ex: '100k', '300k', '500k', '1mi', '1.5mi', '2mi', '3mi').
 * Extrai a informação a partir da importância segurada (LMI), metadados da cotação/cliente (tipoDePlano, nomePlano, plano)
 * e corrige automaticamente anomalias legadas de pontuação e escala.
 */
export function formatPlanLabel(
  importanciaSegurada?: number | string | null,
  clientData?: any,
  fallback?: string | null
): string {
  // 1. Tenta extrair de clientData se disponível
  let parsedClientData: Record<string, any> | null = null;
  if (clientData) {
    if (typeof clientData === 'string') {
      try {
        parsedClientData = JSON.parse(clientData);
      } catch {
        parsedClientData = null;
      }
    } else if (typeof clientData === 'object') {
      parsedClientData = clientData;
    }
  }

  const rawCandidates = [
    parsedClientData?.tipoDePlano,
    parsedClientData?.plano,
    parsedClientData?.nomePlano,
    parsedClientData?.tipo,
    parsedClientData?.planName,
  ]
    .filter(Boolean)
    .map(String);

  for (const raw of rawCandidates) {
    const clean = raw.trim().toLowerCase();

    // Casos diretos como '100k', '200k', '300k', '400k', '500k', etc.
    const kMatch = clean.match(/^(\d+)\s*k$/i);
    if (kMatch) {
      return `${kMatch[1]}k`;
    }

    // Casos diretos como '1m', '1mi', '1.5m', '1.5mi', '1,5m', '1,5mi', '2m', '2mi', etc.
    const mMatch = clean.match(/^([\d.,]+)\s*m(?:i)?$/i);
    if (mMatch) {
      const numStr = mMatch[1].replace(',', '.');
      const n = parseFloat(numStr);
      if (!isNaN(n)) {
        return n % 1 === 0 ? `${n}mi` : `${n}mi`;
      }
    }

    // Nomes com "mil" (ex: "Plano 100 Mil", "100 mil", "100.000")
    if (clean.includes('100 mil') || clean.includes('100.000') || clean === '100') return '100k';
    if (clean.includes('200 mil') || clean.includes('200.000') || clean === '200') return '200k';
    if (clean.includes('300 mil') || clean.includes('300.000') || clean === '300') return '300k';
    if (clean.includes('400 mil') || clean.includes('400.000') || clean === '400') return '400k';
    if (clean.includes('500 mil') || clean.includes('500.000') || clean === '500') return '500k';

    // Nomes com "milhão" / "milhões"
    if (clean.includes('1,5 milh') || clean.includes('1.5 milh') || clean.includes('1.500.000')) return '1.5mi';
    if (clean.includes('1 milh') || clean.includes('1.000.000')) return '1mi';
    if (clean.includes('2 milh') || clean.includes('2.000.000')) return '2mi';
    if (clean.includes('3 milh') || clean.includes('3.000.000')) return '3mi';
    if (clean.includes('5 milh') || clean.includes('5.000.000')) return '5mi';
  }

  // 2. Tenta extrair a partir de valor monetário / importância segurada
  let rawValor = importanciaSegurada;
  if (!rawValor && parsedClientData) {
    rawValor =
      parsedClientData.valorCobertura ||
      parsedClientData.cobertura ||
      parsedClientData.coverageAmount ||
      parsedClientData.limite;
  }

  let num = parseCurrencyToNumber(rawValor, 0);

  // Tratamento de anomalia histórica de multiplicação por 100
  if (num >= 10000000 && num <= 50000000 && num % 1000000 === 0) {
    num = num / 100;
  }

  if (num > 0) {
    if (num >= 1000000) {
      const inMillions = num / 1000000;
      return inMillions % 1 === 0 ? `${inMillions}mi` : `${inMillions}mi`;
    }
    if (num >= 1000) {
      const inThousands = num / 1000;
      return inThousands % 1 === 0 ? `${inThousands}k` : `${inThousands}k`;
    }
    return `${num}`;
  }

  // 3. Fallback
  if (fallback) {
    return fallback;
  }

  return '-';
}

