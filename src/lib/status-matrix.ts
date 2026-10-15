/**
 * Matriz de Status Unificada da DuoLife
 *
 * Implementa a matriz exata de 3 eixos de status do ecossistema:
 * 1. Status do Cliente: 'Vigente / Renovado' | 'Em negociação' | 'Cadastrado' | 'Expirado' | 'Cancelado'
 * 2. Status Geral: 'Negócio Fechado' | 'Pendente de Assinatura' | 'Pendente de Pagamento' | 'Inativo'
 * 3. Status de Pagamento: 'Em dia' | 'Em atraso <= 50 dias' | 'Falta Assinatura' | 'Falta Pagamento' | 'Inativo' | 'Quitado' | 'Cancelado' | 'Falta Pagamento > 50 dias'
 *
 * Regras da matriz (9 combinações canônicas):
 * 1. Vigente / Renovado + Negócio Fechado + Em dia
 * 2. Vigente / Renovado + Negócio Fechado + Em atraso <= 50 dias
 * 3. Em negociação + Pendente de Assinatura + Falta Assinatura
 * 4. Em negociação + Pendente de Pagamento + Falta Pagamento
 * 5. Cadastrado + Inativo + Inativo
 * 6. Expirado + Negócio Fechado + Quitado
 * 7. Cancelado + Pendente de Assinatura + Cancelado
 * 8. Cancelado + Pendente de Pagamento + Cancelado
 * 9. Cancelado + Negócio Fechado + Falta Pagamento > 50 dias
 *
 * Design System:
 * - Tema Claro: bg-[cor]-50 border-[cor]-200 text-[cor]-800
 * - Apple HIG / DuoLife Design System: cantos rounded-full (status-pill)
 */

// ============================================================================
// 1. TIPOS TYPESCRIPT ESTRITOS
// ============================================================================

export type StatusCliente =
  | 'Vigente / Renovado'
  | 'Em negociação'
  | 'Cadastrado'
  | 'Expirado'
  | 'Cancelado';

export type StatusGeral =
  | 'Negócio Fechado'
  | 'Pendente de Assinatura'
  | 'Pendente de Pagamento'
  | 'Inativo';

export type StatusPagamento =
  | 'Em dia'
  | 'Em atraso <= 50 dias'
  | 'Falta Assinatura'
  | 'Falta Pagamento'
  | 'Inativo'
  | 'Quitado'
  | 'Cancelado'
  | 'Falta Pagamento > 50 dias';

export type MatrixRuleId =
  | 'VIGENTE_EM_DIA'
  | 'VIGENTE_ATRASO_LE_50'
  | 'NEGOCIACAO_PENDENTE_ASSINATURA'
  | 'NEGOCIACAO_PENDENTE_PAGAMENTO'
  | 'CADASTRADO_INATIVO'
  | 'EXPIRADO_QUITADO'
  | 'CANCELADO_PENDENTE_ASSINATURA'
  | 'CANCELADO_PENDENTE_PAGAMENTO'
  | 'CANCELADO_INADIMPLENCIA_GT_50';

export interface MatrixRule {
  readonly id: MatrixRuleId;
  readonly statusCliente: StatusCliente;
  readonly statusGeral: StatusGeral;
  readonly statusPagamento: StatusPagamento;
  readonly descricao: string;
}

export type MatrixBadgeTone =
  | 'emerald'
  | 'amber'
  | 'sky'
  | 'indigo'
  | 'rose'
  | 'slate'
  | 'zinc'
  | 'gray';

export interface StatusBadgeConfig {
  readonly label: string;
  readonly tone: MatrixBadgeTone;
  readonly bgClass: string;
  readonly borderClass: string;
  readonly textClass: string;
  readonly dotClass: string;
  readonly badgeClass: string;
}

export interface MatrixStatusInput {
  // Dados de cotação / proposta
  hasCotacao?: boolean | null;
  cotacaoStatus?: string | null; // 'rascunho' | 'enviada' | 'contrato_gerado' | 'assinado' | 'pagamento_gerado' | 'aprovada' | 'emitida' | 'recusada' | 'cancelada'
  isContractSigned?: boolean | null;
  signatureStatus?: string | null; // 'signed' | 'pending' | 'canceled'

  // Dados de venda / apólice
  hasSale?: boolean | null;
  saleStatus?: string | null; // 'ativa' | 'cancelada' | 'expirada'
  issueDate?: string | Date | null;
  expiryDate?: string | Date | null;
  isExpired?: boolean | null;

  // Dados de pagamento / cobrança
  daysOverdue?: number | null; // Maior atraso em dias entre as parcelas vencidas
  maxDaysOverdue?: number | null;
  overdueCount?: number | null;
  paidInstallments?: number | null;
  totalInstallments?: number | null;
  isFullyPaid?: boolean | null;
  paymentStatus?: string | null; // 'paid' | 'overdue' | 'pending' | 'confirmed'

  // Flag de cancelamento e motivo
  isCanceled?: boolean | null;
  cancelReason?:
    | 'delinquency'
    | 'overdue_gt_50'
    | 'signature_refused'
    | 'payment_timeout'
    | 'manual'
    | string
    | null;

  // Data de referência (padrão: hoje)
  referenceDate?: string | Date | null;

  // Strings brutas legadas (caso já venham do Wix/CSV ou de colunas existentes)
  rawStatusCliente?: string | null;
  rawStatusGeral?: string | null;
  rawStatusPagamento?: string | null;
  rawStatus?: string | null;
}

export interface MatrixStatusResult {
  statusCliente: StatusCliente;
  statusGeral: StatusGeral;
  statusPagamento: StatusPagamento;
  ruleId: MatrixRuleId;
  descricao: string;
  badge: {
    cliente: StatusBadgeConfig;
    geral: StatusBadgeConfig;
    pagamento: StatusBadgeConfig;
  };
}

// ============================================================================
// 2. REGRAS DA MATRIZ (AS 9 COMBINAÇÕES CANÔNICAS)
// ============================================================================

export const MATRIX_RULES: readonly MatrixRule[] = [
  {
    id: 'VIGENTE_EM_DIA',
    statusCliente: 'Vigente / Renovado',
    statusGeral: 'Negócio Fechado',
    statusPagamento: 'Em dia',
    descricao: 'Apólice emitida e vigente com pagamentos rigorosamente em dia.',
  },
  {
    id: 'VIGENTE_ATRASO_LE_50',
    statusCliente: 'Vigente / Renovado',
    statusGeral: 'Negócio Fechado',
    statusPagamento: 'Em atraso <= 50 dias',
    descricao: 'Apólice emitida e vigente com parcelas em atraso de até 50 dias (em janela de tolerância e cobrança).',
  },
  {
    id: 'NEGOCIACAO_PENDENTE_ASSINATURA',
    statusCliente: 'Em negociação',
    statusGeral: 'Pendente de Assinatura',
    statusPagamento: 'Falta Assinatura',
    descricao: 'Proposta/cotação em andamento aguardando a assinatura eletrônica do contrato pelo cliente.',
  },
  {
    id: 'NEGOCIACAO_PENDENTE_PAGAMENTO',
    statusCliente: 'Em negociação',
    statusGeral: 'Pendente de Pagamento',
    statusPagamento: 'Falta Pagamento',
    descricao: 'Contrato assinado pelo cliente, aguardando o primeiro pagamento/compensação bancária.',
  },
  {
    id: 'CADASTRADO_INATIVO',
    statusCliente: 'Cadastrado',
    statusGeral: 'Inativo',
    statusPagamento: 'Inativo',
    descricao: 'Cliente registrado no sistema sem cotações ativas ou apólices vigentes.',
  },
  {
    id: 'EXPIRADO_QUITADO',
    statusCliente: 'Expirado',
    statusGeral: 'Negócio Fechado',
    statusPagamento: 'Quitado',
    descricao: 'Vigência anual da apólice finalizada com todas as parcelas integralmente quitadas.',
  },
  {
    id: 'CANCELADO_PENDENTE_ASSINATURA',
    statusCliente: 'Cancelado',
    statusGeral: 'Pendente de Assinatura',
    statusPagamento: 'Cancelado',
    descricao: 'Negociação cancelada ou recusada durante a etapa de assinatura.',
  },
  {
    id: 'CANCELADO_PENDENTE_PAGAMENTO',
    statusCliente: 'Cancelado',
    statusGeral: 'Pendente de Pagamento',
    statusPagamento: 'Cancelado',
    descricao: 'Negociação com contrato assinado cancelada por falta de liquidação da fatura ou desistência.',
  },
  {
    id: 'CANCELADO_INADIMPLENCIA_GT_50',
    statusCliente: 'Cancelado',
    statusGeral: 'Negócio Fechado',
    statusPagamento: 'Falta Pagamento > 50 dias',
    descricao: 'Apólice cancelada devido a inadimplência superior a 50 dias conforme regulamento contratual.',
  },
] as const;

// ============================================================================
// 3. DESIGN SYSTEM & BADGES (bg-[cor]-50 border-[cor]-200 text-[cor]-800)
// ============================================================================

const BASE_BADGE_CLASS =
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors';

function createBadgeConfig(
  label: string,
  tone: MatrixBadgeTone,
  cor: string
): StatusBadgeConfig {
  return {
    label,
    tone,
    bgClass: `bg-${cor}-50`,
    borderClass: `border-${cor}-200`,
    textClass: `text-${cor}-800`,
    dotClass: `bg-${cor}-500`,
    badgeClass: `${BASE_BADGE_CLASS} bg-${cor}-50 border-${cor}-200 text-${cor}-800`,
  };
}

export const STATUS_CLIENTE_BADGES: Record<StatusCliente, StatusBadgeConfig> = {
  'Vigente / Renovado': createBadgeConfig('Vigente / Renovado', 'emerald', 'emerald'),
  'Em negociação': createBadgeConfig('Em negociação', 'sky', 'sky'),
  'Cadastrado': createBadgeConfig('Cadastrado', 'slate', 'slate'),
  'Expirado': createBadgeConfig('Expirado', 'zinc', 'zinc'),
  'Cancelado': createBadgeConfig('Cancelado', 'rose', 'rose'),
};

export const STATUS_GERAL_BADGES: Record<StatusGeral, StatusBadgeConfig> = {
  'Negócio Fechado': createBadgeConfig('Negócio Fechado', 'emerald', 'emerald'),
  'Pendente de Assinatura': createBadgeConfig('Pendente de Assinatura', 'indigo', 'indigo'),
  'Pendente de Pagamento': createBadgeConfig('Pendente de Pagamento', 'amber', 'amber'),
  'Inativo': createBadgeConfig('Inativo', 'gray', 'gray'),
};

export const STATUS_PAGAMENTO_BADGES: Record<StatusPagamento, StatusBadgeConfig> = {
  'Em dia': createBadgeConfig('Em dia', 'emerald', 'emerald'),
  'Em atraso <= 50 dias': createBadgeConfig('Em atraso <= 50 dias', 'amber', 'amber'),
  'Falta Assinatura': createBadgeConfig('Falta Assinatura', 'indigo', 'indigo'),
  'Falta Pagamento': createBadgeConfig('Falta Pagamento', 'amber', 'amber'),
  'Inativo': createBadgeConfig('Inativo', 'gray', 'gray'),
  'Quitado': createBadgeConfig('Quitado', 'emerald', 'emerald'),
  'Cancelado': createBadgeConfig('Cancelado', 'rose', 'rose'),
  'Falta Pagamento > 50 dias': createBadgeConfig('Falta Pagamento > 50 dias', 'rose', 'rose'),
};

export function getStatusClienteBadge(status: StatusCliente): StatusBadgeConfig {
  return STATUS_CLIENTE_BADGES[status] ?? STATUS_CLIENTE_BADGES['Cadastrado'];
}

export function getStatusGeralBadge(status: StatusGeral): StatusBadgeConfig {
  return STATUS_GERAL_BADGES[status] ?? STATUS_GERAL_BADGES['Inativo'];
}

export function getStatusPagamentoBadge(status: StatusPagamento): StatusBadgeConfig {
  return STATUS_PAGAMENTO_BADGES[status] ?? STATUS_PAGAMENTO_BADGES['Inativo'];
}

// ============================================================================
// 3.1 OPÇÕES E DICIONÁRIOS PARA FILTROS (ADMIN E PORTAL)
// ============================================================================

export const STATUS_CLIENTE_OPTIONS: readonly { value: string; label: StatusCliente }[] = [
  { value: 'vigente', label: 'Vigente / Renovado' },
  { value: 'negociacao', label: 'Em negociação' },
  { value: 'cadastrado', label: 'Cadastrado' },
  { value: 'expirado', label: 'Expirado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const;

export const STATUS_GERAL_OPTIONS: readonly { value: string; label: StatusGeral }[] = [
  { value: 'negocio_fechado', label: 'Negócio Fechado' },
  { value: 'pendente_assinatura', label: 'Pendente de Assinatura' },
  { value: 'pendente_pagamento', label: 'Pendente de Pagamento' },
  { value: 'inativo', label: 'Inativo' },
] as const;

export const STATUS_PAGAMENTO_OPTIONS: readonly { value: string; label: StatusPagamento }[] = [
  { value: 'em_dia', label: 'Em dia' },
  { value: 'atraso_le_50', label: 'Em atraso <= 50 dias' },
  { value: 'falta_pagamento_gt_50', label: 'Falta Pagamento > 50 dias' },
  { value: 'quitado', label: 'Quitado' },
  { value: 'falta_assinatura', label: 'Falta Assinatura' },
  { value: 'falta_pagamento', label: 'Falta Pagamento' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'inativo', label: 'Inativo' },
] as const;

export const STATUS_GERAL_LABEL_MAP: Record<string, StatusGeral> = {
  negocio_fechado: 'Negócio Fechado',
  'negócio fechado': 'Negócio Fechado',
  pendente_assinatura: 'Pendente de Assinatura',
  'pendente de assinatura': 'Pendente de Assinatura',
  pendente_pagamento: 'Pendente de Pagamento',
  'pendente de pagamento': 'Pendente de Pagamento',
  inativo: 'Inativo',
};

export const STATUS_PAGAMENTO_LABEL_MAP: Record<string, StatusPagamento> = {
  em_dia: 'Em dia',
  'em dia': 'Em dia',
  atraso_le_50: 'Em atraso <= 50 dias',
  'em atraso <= 50 dias': 'Em atraso <= 50 dias',
  falta_pagamento_gt_50: 'Falta Pagamento > 50 dias',
  'falta pagamento > 50 dias': 'Falta Pagamento > 50 dias',
  quitado: 'Quitado',
  falta_assinatura: 'Falta Assinatura',
  'falta assinatura': 'Falta Assinatura',
  falta_pagamento: 'Falta Pagamento',
  'falta pagamento': 'Falta Pagamento',
  cancelado: 'Cancelado',
  inativo: 'Inativo',
};

export function formatStatusGeralLabel(value?: string | null): string {
  if (!value) return '';
  const key = String(value).trim().toLowerCase();
  return STATUS_GERAL_LABEL_MAP[key] || value;
}

export function formatStatusPagamentoLabel(value?: string | null): string {
  if (!value) return '';
  const key = String(value).trim().toLowerCase();
  return STATUS_PAGAMENTO_LABEL_MAP[key] || value;
}


// ============================================================================
// 4. FUNÇÕES DE NORMALIZAÇÃO E VALIDAÇÃO
// ============================================================================

export function isValidMatrixCombination(
  statusCliente: string,
  statusGeral: string,
  statusPagamento: string
): boolean {
  return MATRIX_RULES.some(
    (r) =>
      r.statusCliente === statusCliente &&
      r.statusGeral === statusGeral &&
      r.statusPagamento === statusPagamento
  );
}

export function findMatrixRule(
  statusCliente: StatusCliente,
  statusGeral: StatusGeral,
  statusPagamento: StatusPagamento
): MatrixRule | undefined {
  return MATRIX_RULES.find(
    (r) =>
      r.statusCliente === statusCliente &&
      r.statusGeral === statusGeral &&
      r.statusPagamento === statusPagamento
  );
}

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeStatusCliente(raw: unknown): StatusCliente | null {
  const s = cleanString(raw);
  if (!s) return null;
  if (s.includes('vigente') || s.includes('renovad') || s === 'ativa' || s === 'ativo') {
    return 'Vigente / Renovado';
  }
  if (s.includes('negocia') || s.includes('proposta') || s.includes('cotacao') || s === 'rascunho' || s === 'enviada') {
    return 'Em negociação';
  }
  if (s.includes('expirad') || s.includes('vencid')) {
    return 'Expirado';
  }
  if (s.includes('cancelad') || s.includes('recusad')) {
    return 'Cancelado';
  }
  if (s.includes('cadastrad') || s.includes('lead') || s.includes('novo') || s === 'cadastro') {
    return 'Cadastrado';
  }
  return null;
}

export function normalizeStatusGeral(raw: unknown): StatusGeral | null {
  const s = cleanString(raw);
  if (!s) return null;
  if (s.includes('negocio fechado') || s.includes('fechado') || s === 'emitida' || s === 'aprovada') {
    return 'Negócio Fechado';
  }
  if (s.includes('assinatura') || s.includes('assinar')) {
    return 'Pendente de Assinatura';
  }
  if (s.includes('pagamento') || s.includes('pagar') || s.includes('fatura') || s.includes('boleto')) {
    return 'Pendente de Pagamento';
  }
  if (s.includes('inativ') || s.includes('sem atividade')) {
    return 'Inativo';
  }
  return null;
}

export function normalizeStatusPagamento(raw: unknown): StatusPagamento | null {
  const s = cleanString(raw);
  if (!s) return null;
  if (s.includes('> 50') || s.includes('maior que 50') || s.includes('acima de 50') || s.includes('>50')) {
    return 'Falta Pagamento > 50 dias';
  }
  if (s.includes('<= 50') || s.includes('menor que 50') || s.includes('ate 50') || s.includes('atraso')) {
    return 'Em atraso <= 50 dias';
  }
  if (s.includes('em dia') || s === 'pago' || s === 'paga' || s === 'recebido' || s === 'confirmado') {
    return 'Em dia';
  }
  if (s.includes('assinatura')) {
    return 'Falta Assinatura';
  }
  if (s.includes('falta pagamento') || s.includes('pendente') || s.includes('aguardando')) {
    return 'Falta Pagamento';
  }
  if (s.includes('quitad')) {
    return 'Quitado';
  }
  if (s.includes('cancelad')) {
    return 'Cancelado';
  }
  if (s.includes('inativ')) {
    return 'Inativo';
  }
  return null;
}

function parseDateSafely(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  try {
    const s = String(val).trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ============================================================================
// 5. FUNÇÃO PRINCIPAL: calculateMatrixStatus
// ============================================================================

/**
 * Calcula dinamicamente o trio canônico de status da matriz para uma Cotação, Venda ou Cobrança.
 * Garante que o retorno seja sempre uma das 9 combinações exatas da regra de negócio.
 */
export function calculateMatrixStatus(input: MatrixStatusInput): MatrixStatusResult {
  const now = parseDateSafely(input.referenceDate) || new Date();

  // 1. Verificação de inputs brutos diretos (quando fornecidos com exatidão)
  const normRawCliente = normalizeStatusCliente(input.rawStatusCliente);
  const normRawGeral = normalizeStatusGeral(input.rawStatusGeral);
  const normRawPagamento = normalizeStatusPagamento(input.rawStatusPagamento);

  if (normRawCliente && normRawGeral && normRawPagamento) {
    const directRule = findMatrixRule(normRawCliente, normRawGeral, normRawPagamento);
    if (directRule) {
      return buildResult(directRule);
    }
  }

  // 2. Extração e sanitização dos parâmetros operacionais
  const cotacaoStatusClean = cleanString(input.cotacaoStatus);
  const saleStatusClean = cleanString(input.saleStatus);
  const signatureStatusClean = cleanString(input.signatureStatus);
  const paymentStatusClean = cleanString(input.paymentStatus);

  const isContractSigned = Boolean(
    input.isContractSigned === true ||
    signatureStatusClean === 'signed' ||
    cotacaoStatusClean === 'assinado' ||
    cotacaoStatusClean === 'pagamento_gerado' ||
    cotacaoStatusClean === 'aprovada' ||
    cotacaoStatusClean === 'emitida'
  );

  const hasSale = Boolean(
    input.hasSale === true ||
    saleStatusClean === 'ativa' ||
    cotacaoStatusClean === 'emitida' ||
    cotacaoStatusClean === 'aprovada'
  );

  const isExplicitlyCanceled = Boolean(
    input.isCanceled === true ||
    cotacaoStatusClean === 'cancelada' ||
    cotacaoStatusClean === 'recusada' ||
    saleStatusClean === 'cancelada' ||
    signatureStatusClean === 'canceled'
  );

  // Cliente está efetivamente pago / quitado se:
  // - Flag isFullyPaid for verdadeira; ou
  // - Status do pagamento for paid / pago / received / confirmed / quitado; ou
  // - Total de parcelas pagas for maior ou igual ao total contratado.
  const isPaidOrQuitado = Boolean(
    input.isFullyPaid === true ||
    ['paid', 'pago', 'paga', 'received', 'recebido', 'confirmed', 'confirmado', 'quitado', 'quitada'].includes(paymentStatusClean) ||
    ((input.paidInstallments ?? 0) >= (input.totalInstallments || 1) && (input.totalInstallments ?? 0) > 0)
  );

  // Se a apólice/cobrança está paga ou quitada, o atraso efetivo é ESTRITAMENTE 0 dias.
  const rawMaxOverdue = Math.max(
    0,
    typeof input.daysOverdue === 'number' ? input.daysOverdue : 0,
    typeof input.maxDaysOverdue === 'number' ? input.maxDaysOverdue : 0
  );
  const maxOverdue = isPaidOrQuitado ? 0 : rawMaxOverdue;

  const expiryDate = parseDateSafely(input.expiryDate);
  const isExpired = Boolean(
    input.isExpired === true ||
    (expiryDate && expiryDate.getTime() < now.getTime())
  );

  // 3. Regra de Inadimplência Crítica: Atraso > 50 dias cancela a apólice
  // CRÍTICO: SOMENTE pode ser acionado se NÃO estiver pago/quitado!
  if (!isPaidOrQuitado && (maxOverdue > 50 || input.cancelReason === 'delinquency' || input.cancelReason === 'overdue_gt_50')) {
    if (hasSale || cotacaoStatusClean === 'emitida' || cotacaoStatusClean === 'aprovada' || normRawGeral === 'Negócio Fechado') {
      return buildResult(getRule('CANCELADO_INADIMPLENCIA_GT_50'));
    }
  }

  // 4. Regra de Cancelamentos
  if (isExplicitlyCanceled) {
    // Se era uma apólice fechada com inadimplência real > 50 dias e não foi quitada
    if (hasSale && !isPaidOrQuitado && maxOverdue > 50) {
      return buildResult(getRule('CANCELADO_INADIMPLENCIA_GT_50'));
    }
    // Se o contrato já havia sido assinado (estava na etapa de pagamento)
    if (isContractSigned || cotacaoStatusClean === 'pagamento_gerado' || normRawGeral === 'Pendente de Pagamento') {
      return buildResult(getRule('CANCELADO_PENDENTE_PAGAMENTO'));
    }
    // Cancelamento antes da assinatura
    return buildResult(getRule('CANCELADO_PENDENTE_ASSINATURA'));
  }

  // 5. Regra de Expirado (Apólice encerrou vigência anual de 1 ano quitada)
  if (isExpired && hasSale) {
    return buildResult(getRule('EXPIRADO_QUITADO'));
  }

  // 6. Regra de Negócio Fechado / Vigente (Apólice emitida em vigor)
  if (hasSale && saleStatusClean !== 'cancelada') {
    if (!isPaidOrQuitado && maxOverdue > 0 && maxOverdue <= 50) {
      return buildResult(getRule('VIGENTE_ATRASO_LE_50'));
    }
    return buildResult(getRule('VIGENTE_EM_DIA'));
  }

  // 7. Regra de Em Negociação (Proposta/Cotação em andamento)
  const hasCotacao = Boolean(
    input.hasCotacao !== false &&
    (input.hasCotacao === true ||
     Boolean(input.cotacaoStatus) ||
     normRawCliente === 'Em negociação' ||
     cotacaoStatusClean.length > 0)
  );

  if (hasCotacao) {
    if (isContractSigned) {
      return buildResult(getRule('NEGOCIACAO_PENDENTE_PAGAMENTO'));
    }
    return buildResult(getRule('NEGOCIACAO_PENDENTE_ASSINATURA'));
  }

  // 8. Regra Padrão: Cliente apenas Cadastrado sem negócios
  return buildResult(getRule('CADASTRADO_INATIVO'));
}

function getRule(id: MatrixRuleId): MatrixRule {
  const rule = MATRIX_RULES.find((r) => r.id === id);
  if (!rule) {
    throw new Error(`Regra da matriz não encontrada: ${id}`);
  }
  return rule;
}

function buildResult(rule: MatrixRule): MatrixStatusResult {
  return {
    statusCliente: rule.statusCliente,
    statusGeral: rule.statusGeral,
    statusPagamento: rule.statusPagamento,
    ruleId: rule.id,
    descricao: rule.descricao,
    badge: {
      cliente: getStatusClienteBadge(rule.statusCliente),
      geral: getStatusGeralBadge(rule.statusGeral),
      pagamento: getStatusPagamentoBadge(rule.statusPagamento),
    },
  };
}

// ============================================================================
// 6. SNIPPETS E EXPRESSÕES SQL EM POSTGRES
// ============================================================================

/**
 * Retorna as expressões SQL (PostgreSQL) para calcular dinamicamente os 3 status
 * em queries SELECT com base nas tabelas canônicas:
 * - cotacoes (alias padrão: c)
 * - sales (alias padrão: s)
 * - payment_orders / payment_installments (max_overdue_days)
 */
export interface SqlMatrixOptions {
  cotacaoAlias?: string; // padrão: 'c'
  saleAlias?: string; // padrão: 's'
  maxOverdueDaysExpression?: string; // padrão: 'COALESCE(sub_p.max_overdue_days, 0)'
  referenceDateExpression?: string; // padrão: 'CURRENT_DATE'
}

export function buildStatusMatrixSqlExpressions(options?: SqlMatrixOptions) {
  const c = options?.cotacaoAlias ?? 'c';
  const s = options?.saleAlias ?? 's';
  const overdue = options?.maxOverdueDaysExpression ?? 'COALESCE(sub_p.max_overdue_days, 0)';
  const refDate = options?.referenceDateExpression ?? 'CURRENT_DATE';

  const statusClienteSql = `
CASE
  WHEN (${s}.status = 'cancelada' OR ${c}.status IN ('recusada', 'cancelada') OR (${s}.id IS NOT NULL AND ${overdue} > 50))
    THEN 'Cancelado'
  WHEN (${s}.id IS NOT NULL AND ${s}.expiry_date < ${refDate})
    THEN 'Expirado'
  WHEN (${s}.id IS NOT NULL AND ${s}.status = 'ativa' AND ${s}.expiry_date >= ${refDate})
    THEN 'Vigente / Renovado'
  WHEN (${c}.id IS NOT NULL AND ${c}.status NOT IN ('recusada', 'cancelada', 'expirada'))
    THEN 'Em negociação'
  ELSE 'Cadastrado'
END`.trim();

  const statusGeralSql = `
CASE
  WHEN (${s}.id IS NOT NULL OR ${c}.status IN ('emitida', 'aprovada'))
    THEN 'Negócio Fechado'
  WHEN (${c}.status IN ('assinado', 'pagamento_gerado'))
    THEN 'Pendente de Pagamento'
  WHEN (${c}.id IS NOT NULL AND ${c}.status IN ('rascunho', 'enviada', 'contrato_gerado'))
    THEN 'Pendente de Assinatura'
  ELSE 'Inativo'
END`.trim();

  const statusPagamentoSql = `
CASE
  WHEN (${s}.id IS NOT NULL OR ${c}.status IN ('emitida', 'aprovada')) AND ${overdue} > 50
    THEN 'Falta Pagamento > 50 dias'
  WHEN (${c}.status IN ('recusada', 'cancelada') OR ${s}.status = 'cancelada')
    THEN 'Cancelado'
  WHEN (${s}.id IS NOT NULL AND ${s}.expiry_date < ${refDate})
    THEN 'Quitado'
  WHEN (${s}.id IS NOT NULL AND ${overdue} > 0 AND ${overdue} <= 50)
    THEN 'Em atraso <= 50 dias'
  WHEN (${s}.id IS NOT NULL AND ${overdue} = 0)
    THEN 'Em dia'
  WHEN (${c}.status IN ('assinado', 'pagamento_gerado'))
    THEN 'Falta Pagamento'
  WHEN (${c}.id IS NOT NULL AND ${c}.status IN ('rascunho', 'enviada', 'contrato_gerado'))
    THEN 'Falta Assinatura'
  ELSE 'Inativo'
END`.trim();

  return {
    statusClienteSql,
    statusGeralSql,
    statusPagamentoSql,
    selectFieldsSql: `
  (${statusClienteSql}) AS matrix_status_cliente,
  (${statusGeralSql}) AS matrix_status_geral,
  (${statusPagamentoSql}) AS matrix_status_pagamento
    `.trim(),
  };
}

export const SQL_STATUS_CLIENTE_EXPRESSION = buildStatusMatrixSqlExpressions().statusClienteSql;
export const SQL_STATUS_GERAL_EXPRESSION = buildStatusMatrixSqlExpressions().statusGeralSql;
export const SQL_STATUS_PAGAMENTO_EXPRESSION = buildStatusMatrixSqlExpressions().statusPagamentoSql;
export const SQL_STATUS_MATRIX_SELECT_FIELDS = buildStatusMatrixSqlExpressions().selectFieldsSql;

/**
 * Exemplo completo de query PostgreSQL pronta para uso integrando insurance_clients, cotacoes, sales e parcelas.
 */
export const SQL_FULL_STATUS_MATRIX_QUERY_EXAMPLE = `
SELECT
  ic.id AS client_id,
  ic.full_name,
  ic.document_number,
  c.id AS cotacao_id,
  c.status AS raw_cotacao_status,
  s.id AS sale_id,
  s.policy_number,
  s.expiry_date,
  COALESCE(sub_p.max_overdue_days, 0) AS max_overdue_days,

  -- 1. Status do Cliente
  ${SQL_STATUS_CLIENTE_EXPRESSION} AS status_cliente,

  -- 2. Status Geral
  ${SQL_STATUS_GERAL_EXPRESSION} AS status_geral,

  -- 3. Status de Pagamento
  ${SQL_STATUS_PAGAMENTO_EXPRESSION} AS status_pagamento

FROM insurance_clients ic
LEFT JOIN LATERAL (
  SELECT c1.id, c1.status, c1.created_at
  FROM cotacoes c1
  WHERE c1.client_id = ic.id
  ORDER BY c1.created_at DESC
  LIMIT 1
) c ON TRUE
LEFT JOIN LATERAL (
  SELECT s1.id, s1.status, s1.expiry_date, s1.policy_number, s1.created_at
  FROM sales s1
  WHERE s1.client_id = ic.id
  ORDER BY s1.created_at DESC
  LIMIT 1
) s ON TRUE
LEFT JOIN LATERAL (
  SELECT
    MAX(CASE WHEN pi.status = 'overdue' OR (pi.status = 'pending' AND pi.due_date < CURRENT_DATE)
             THEN CURRENT_DATE - pi.due_date
             ELSE 0 END) AS max_overdue_days
  FROM payment_installments pi
  WHERE pi.cotacao_id = c.id
) sub_p ON TRUE
ORDER BY ic.created_at DESC;
`.trim();

/**
 * Retorna as condições SQL WHERE para filtrar Vendas (tabela `sales s`)
 * com base em `statusGeral` e `statusPagamento`.
 */
export function getSaleMatrixFilterSql(
  statusGeral?: string | null,
  statusPagamento?: string | null,
  saleAlias: string = 's',
  cotacaoAlias: string = 'c'
): string[] {
  const clauses: string[] = [];
  const s = saleAlias;

  // Subexpressão determinística de quitação em vendas
  const isPaidSql = `(
    (SELECT COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE pi_f.status IN ('paid', 'received', 'confirmed')) FROM payment_installments pi_f WHERE pi_f.cotacao_id = ${s}.cotacao_id)
    OR
    (SELECT po_f.status IN ('paid', 'received', 'confirmed') FROM payment_orders po_f WHERE po_f.cotacao_id = ${s}.cotacao_id ORDER BY po_f.created_at DESC LIMIT 1)
  )`;

  // Subexpressão de atraso máximo em vendas
  const maxOverdueSql = `COALESCE(
    (
      SELECT CASE
        WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE pi_o.status IN ('paid', 'received', 'confirmed')) THEN 0
        ELSE MAX(CASE WHEN pi_o.status IN ('pending', 'overdue') AND pi_o.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - pi_o.due_date)::int) ELSE 0 END)
      END
      FROM payment_installments pi_o
      WHERE pi_o.cotacao_id = ${s}.cotacao_id
    ),
    (
      SELECT CASE
        WHEN po_o.status IN ('paid', 'received', 'confirmed') THEN 0
        WHEN po_o.status IN ('pending', 'overdue') AND po_o.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - po_o.due_date)::int)
        ELSE 0
      END
      FROM payment_orders po_o
      WHERE po_o.cotacao_id = ${s}.cotacao_id
      ORDER BY po_o.created_at DESC
      LIMIT 1
    ),
    0
  )`;

  if (statusGeral) {
    const sg = statusGeral.toLowerCase().trim();
    if (['negocio_fechado', 'negócio fechado'].includes(sg)) {
      clauses.push(`${s}.id IS NOT NULL`);
    } else {
      // Pendente de Assinatura, Pendente de Pagamento ou Inativo não existem em vendas ativas/emitidas
      clauses.push(`1 = 0`);
    }
  }

  if (statusPagamento) {
    const sp = statusPagamento.toLowerCase().trim();
    if (['em_dia', 'em dia'].includes(sp)) {
      clauses.push(`(${s}.status = 'ativa' AND ${s}.expiry_date >= CURRENT_DATE AND (${isPaidSql} = true OR ${maxOverdueSql} = 0))`);
    } else if (['atraso_le_50', 'em atraso <= 50 dias'].includes(sp)) {
      clauses.push(`(${s}.status = 'ativa' AND ${s}.expiry_date >= CURRENT_DATE AND ${isPaidSql} = false AND ${maxOverdueSql} > 0 AND ${maxOverdueSql} <= 50)`);
    } else if (['falta_pagamento_gt_50', 'falta pagamento > 50 dias'].includes(sp)) {
      clauses.push(`(${isPaidSql} = false AND ${maxOverdueSql} > 50)`);
    } else if (['quitado'].includes(sp)) {
      clauses.push(`(${s}.expiry_date < CURRENT_DATE OR ${s}.status = 'expirada' OR ${isPaidSql} = true)`);
    } else if (['cancelado'].includes(sp)) {
      clauses.push(`(${s}.status = 'cancelada')`);
    } else {
      clauses.push(`1 = 0`);
    }
  }

  return clauses;
}

/**
 * Retorna as condições SQL WHERE para filtrar Cotações (tabela `cotacoes c` e `sales s`)
 * com base em `statusGeral` e `statusPagamento`.
 */
export function getCotacaoMatrixFilterSql(
  statusGeral?: string | null,
  statusPagamento?: string | null,
  cotacaoAlias: string = 'c',
  saleAlias: string = 's'
): string[] {
  const clauses: string[] = [];
  const c = cotacaoAlias;
  const s = saleAlias;

  const isPaidSql = `(
    (SELECT COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE pi_f.status IN ('paid', 'received', 'confirmed')) FROM payment_installments pi_f WHERE pi_f.cotacao_id = ${c}.id)
    OR
    (SELECT po_f.status IN ('paid', 'received', 'confirmed') FROM payment_orders po_f WHERE po_f.cotacao_id = ${c}.id ORDER BY po_f.created_at DESC LIMIT 1)
    OR
    (${c}.status IN ('aprovada', 'emitida'))
  )`;

  const maxOverdueSql = `COALESCE(
    (
      SELECT CASE
        WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE pi_o.status IN ('paid', 'received', 'confirmed')) THEN 0
        ELSE MAX(CASE WHEN pi_o.status IN ('pending', 'overdue') AND pi_o.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - pi_o.due_date)::int) ELSE 0 END)
      END
      FROM payment_installments pi_o
      WHERE pi_o.cotacao_id = ${c}.id
    ),
    (
      SELECT CASE
        WHEN po_o.status IN ('paid', 'received', 'confirmed') THEN 0
        WHEN po_o.status IN ('pending', 'overdue') AND po_o.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - po_o.due_date)::int)
        ELSE 0
      END
      FROM payment_orders po_o
      WHERE po_o.cotacao_id = ${c}.id
      ORDER BY po_o.created_at DESC
      LIMIT 1
    ),
    0
  )`;

  if (statusGeral) {
    const sg = statusGeral.toLowerCase().trim();
    if (['negocio_fechado', 'negócio fechado'].includes(sg)) {
      clauses.push(`(${s}.id IS NOT NULL OR ${c}.status IN ('emitida', 'aprovada'))`);
    } else if (['pendente_assinatura', 'pendente de assinatura'].includes(sg)) {
      clauses.push(`(${s}.id IS NULL AND ${c}.status IN ('rascunho', 'enviada', 'contrato_gerado'))`);
    } else if (['pendente_pagamento', 'pendente de pagamento'].includes(sg)) {
      clauses.push(`(${s}.id IS NULL AND ${c}.status IN ('assinado', 'pagamento_gerado'))`);
    } else if (['inativo'].includes(sg)) {
      clauses.push(`(${c}.status IN ('recusada', 'cancelada'))`);
    }
  }

  if (statusPagamento) {
    const sp = statusPagamento.toLowerCase().trim();
    if (['em_dia', 'em dia'].includes(sp)) {
      clauses.push(`(${s}.id IS NOT NULL AND ${s}.status = 'ativa' AND ${s}.expiry_date >= CURRENT_DATE AND (${isPaidSql} = true OR ${maxOverdueSql} = 0))`);
    } else if (['atraso_le_50', 'em atraso <= 50 dias'].includes(sp)) {
      clauses.push(`(${s}.id IS NOT NULL AND ${s}.status = 'ativa' AND ${s}.expiry_date >= CURRENT_DATE AND ${isPaidSql} = false AND ${maxOverdueSql} > 0 AND ${maxOverdueSql} <= 50)`);
    } else if (['falta_pagamento_gt_50', 'falta pagamento > 50 dias'].includes(sp)) {
      clauses.push(`(${isPaidSql} = false AND ${maxOverdueSql} > 50)`);
    } else if (['quitado'].includes(sp)) {
      clauses.push(`(${s}.id IS NOT NULL AND (${s}.expiry_date < CURRENT_DATE OR ${s}.status = 'expirada'))`);
    } else if (['falta_assinatura', 'falta assinatura'].includes(sp)) {
      clauses.push(`(${s}.id IS NULL AND ${c}.status IN ('rascunho', 'enviada', 'contrato_gerado'))`);
    } else if (['falta_pagamento', 'falta pagamento'].includes(sp)) {
      clauses.push(`(${s}.id IS NULL AND ${c}.status IN ('assinado', 'pagamento_gerado'))`);
    } else if (['cancelado'].includes(sp)) {
      clauses.push(`(${c}.status IN ('recusada', 'cancelada') OR ${s}.status = 'cancelada')`);
    } else if (['inativo'].includes(sp)) {
      clauses.push(`(${c}.status = 'rascunho' AND ${s}.id IS NULL)`);
    }
  }

  return clauses;
}

