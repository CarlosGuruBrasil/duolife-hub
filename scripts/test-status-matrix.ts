import {
  calculateMatrixStatus,
  MATRIX_RULES,
  isValidMatrixCombination,
  STATUS_CLIENTE_BADGES,
  STATUS_GERAL_BADGES,
  STATUS_PAGAMENTO_BADGES,
  buildStatusMatrixSqlExpressions,
  SQL_FULL_STATUS_MATRIX_QUERY_EXAMPLE,
  StatusCliente,
  StatusGeral,
  StatusPagamento,
  STATUS_CLIENTE_OPTIONS,
  STATUS_GERAL_OPTIONS,
  STATUS_PAGAMENTO_OPTIONS,
  formatStatusGeralLabel,
  formatStatusPagamentoLabel,
  getSaleMatrixFilterSql,
  getCotacaoMatrixFilterSql,
} from '../src/lib/status-matrix';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIl: ${msg}`);
    process.exit(1);
  }
}

console.log('--- TESTANDO MATRIZ DE STATUS DUOLIFE ---');

// 1. Validar as 9 regras canônicas da matriz
console.log(`[1] Total de regras na matriz: ${MATRIX_RULES.length} (esperado: 9)`);
assert(MATRIX_RULES.length === 9, 'A matriz deve conter exatamente 9 regras');

for (const rule of MATRIX_RULES) {
  assert(
    isValidMatrixCombination(rule.statusCliente, rule.statusGeral, rule.statusPagamento),
    `Combinação válida: ${rule.id}`
  );
}

// 2. Testar cada uma das 9 regras via calculateMatrixStatus

// Regra 1: Vigente / Renovado + Negócio Fechado + Em dia
const r1 = calculateMatrixStatus({
  hasSale: true,
  saleStatus: 'ativa',
  daysOverdue: 0,
});
console.log(`[Regra 1] ${r1.statusCliente} + ${r1.statusGeral} + ${r1.statusPagamento}`);
assert(r1.ruleId === 'VIGENTE_EM_DIA', 'R1 falhou');
assert(r1.statusCliente === 'Vigente / Renovado', 'R1 statusCliente');
assert(r1.statusGeral === 'Negócio Fechado', 'R1 statusGeral');
assert(r1.statusPagamento === 'Em dia', 'R1 statusPagamento');

// Regra 2: Vigente / Renovado + Negócio Fechado + Em atraso <= 50 dias
const r2 = calculateMatrixStatus({
  hasSale: true,
  saleStatus: 'ativa',
  daysOverdue: 25,
});
console.log(`[Regra 2] ${r2.statusCliente} + ${r2.statusGeral} + ${r2.statusPagamento}`);
assert(r2.ruleId === 'VIGENTE_ATRASO_LE_50', 'R2 falhou');
assert(r2.statusCliente === 'Vigente / Renovado', 'R2 statusCliente');
assert(r2.statusGeral === 'Negócio Fechado', 'R2 statusGeral');
assert(r2.statusPagamento === 'Em atraso <= 50 dias', 'R2 statusPagamento');

// Regra 3: Em negociação + Pendente de Assinatura + Falta Assinatura
const r3 = calculateMatrixStatus({
  hasCotacao: true,
  cotacaoStatus: 'enviada',
  isContractSigned: false,
});
console.log(`[Regra 3] ${r3.statusCliente} + ${r3.statusGeral} + ${r3.statusPagamento}`);
assert(r3.ruleId === 'NEGOCIACAO_PENDENTE_ASSINATURA', 'R3 falhou');
assert(r3.statusCliente === 'Em negociação', 'R3 statusCliente');
assert(r3.statusGeral === 'Pendente de Assinatura', 'R3 statusGeral');
assert(r3.statusPagamento === 'Falta Assinatura', 'R3 statusPagamento');

// Regra 4: Em negociação + Pendente de Pagamento + Falta Pagamento
const r4 = calculateMatrixStatus({
  hasCotacao: true,
  cotacaoStatus: 'assinado',
  isContractSigned: true,
});
console.log(`[Regra 4] ${r4.statusCliente} + ${r4.statusGeral} + ${r4.statusPagamento}`);
assert(r4.ruleId === 'NEGOCIACAO_PENDENTE_PAGAMENTO', 'R4 falhou');
assert(r4.statusCliente === 'Em negociação', 'R4 statusCliente');
assert(r4.statusGeral === 'Pendente de Pagamento', 'R4 statusGeral');
assert(r4.statusPagamento === 'Falta Pagamento', 'R4 statusPagamento');

// Regra 5: Cadastrado + Inativo + Inativo
const r5 = calculateMatrixStatus({
  hasCotacao: false,
  hasSale: false,
});
console.log(`[Regra 5] ${r5.statusCliente} + ${r5.statusGeral} + ${r5.statusPagamento}`);
assert(r5.ruleId === 'CADASTRADO_INATIVO', 'R5 falhou');
assert(r5.statusCliente === 'Cadastrado', 'R5 statusCliente');
assert(r5.statusGeral === 'Inativo', 'R5 statusGeral');
assert(r5.statusPagamento === 'Inativo', 'R5 statusPagamento');

// Regra 6: Expirado + Negócio Fechado + Quitado
const r6 = calculateMatrixStatus({
  hasSale: true,
  isExpired: true,
});
console.log(`[Regra 6] ${r6.statusCliente} + ${r6.statusGeral} + ${r6.statusPagamento}`);
assert(r6.ruleId === 'EXPIRADO_QUITADO', 'R6 falhou');
assert(r6.statusCliente === 'Expirado', 'R6 statusCliente');
assert(r6.statusGeral === 'Negócio Fechado', 'R6 statusGeral');
assert(r6.statusPagamento === 'Quitado', 'R6 statusPagamento');

// Regra 7: Cancelado + Pendente de Assinatura + Cancelado
const r7 = calculateMatrixStatus({
  cotacaoStatus: 'cancelada',
  isContractSigned: false,
});
console.log(`[Regra 7] ${r7.statusCliente} + ${r7.statusGeral} + ${r7.statusPagamento}`);
assert(r7.ruleId === 'CANCELADO_PENDENTE_ASSINATURA', 'R7 falhou');
assert(r7.statusCliente === 'Cancelado', 'R7 statusCliente');
assert(r7.statusGeral === 'Pendente de Assinatura', 'R7 statusGeral');
assert(r7.statusPagamento === 'Cancelado', 'R7 statusPagamento');

// Regra 8: Cancelado + Pendente de Pagamento + Cancelado
const r8 = calculateMatrixStatus({
  cotacaoStatus: 'cancelada',
  isContractSigned: true,
});
console.log(`[Regra 8] ${r8.statusCliente} + ${r8.statusGeral} + ${r8.statusPagamento}`);
assert(r8.ruleId === 'CANCELADO_PENDENTE_PAGAMENTO', 'R8 falhou');
assert(r8.statusCliente === 'Cancelado', 'R8 statusCliente');
assert(r8.statusGeral === 'Pendente de Pagamento', 'R8 statusGeral');
assert(r8.statusPagamento === 'Cancelado', 'R8 statusPagamento');

// Regra 9: Cancelado + Negócio Fechado + Falta Pagamento > 50 dias
const r9 = calculateMatrixStatus({
  hasSale: true,
  saleStatus: 'ativa',
  daysOverdue: 55,
});
console.log(`[Regra 9] ${r9.statusCliente} + ${r9.statusGeral} + ${r9.statusPagamento}`);
assert(r9.ruleId === 'CANCELADO_INADIMPLENCIA_GT_50', 'R9 falhou');
assert(r9.statusCliente === 'Cancelado', 'R9 statusCliente');
assert(r9.statusGeral === 'Negócio Fechado', 'R9 statusGeral');
assert(r9.statusPagamento === 'Falta Pagamento > 50 dias', 'R9 statusPagamento');

// Blindagem: Cliente com venda ativa, pago (isFullyPaid: true) NUNCA pode ser classificado como inadimplente > 50 dias
const rPaidSafe = calculateMatrixStatus({
  hasSale: true,
  saleStatus: 'ativa',
  daysOverdue: 60, // resíduo de cotação antiga
  isFullyPaid: true,
  paymentStatus: 'paid',
});
console.log(`[Blindagem Pagamento Quitado] ${rPaidSafe.statusCliente} + ${rPaidSafe.statusGeral} + ${rPaidSafe.statusPagamento}`);
assert(rPaidSafe.ruleId === 'VIGENTE_EM_DIA', 'Cliente quitado com resíduo de atraso deve ser VIGENTE_EM_DIA');
assert(rPaidSafe.statusCliente === 'Vigente / Renovado', 'Blindagem statusCliente');
assert(rPaidSafe.statusGeral === 'Negócio Fechado', 'Blindagem statusGeral');
assert(rPaidSafe.statusPagamento === 'Em dia', 'Blindagem statusPagamento');

// 3. Testar Design System de Badges (bg-[cor]-50 border-[cor]-200 text-[cor]-800)
console.log('[3] Validando classes Tailwind do Design System...');
const allBadges = [
  ...Object.values(STATUS_CLIENTE_BADGES),
  ...Object.values(STATUS_GERAL_BADGES),
  ...Object.values(STATUS_PAGAMENTO_BADGES),
];

for (const badge of allBadges) {
  assert(badge.bgClass.startsWith('bg-') && badge.bgClass.endsWith('-50'), `Fundo: ${badge.bgClass}`);
  assert(badge.borderClass.startsWith('border-') && badge.borderClass.endsWith('-200'), `Borda: ${badge.borderClass}`);
  assert(badge.textClass.startsWith('text-') && badge.textClass.endsWith('-800'), `Texto: ${badge.textClass}`);
  assert(badge.badgeClass.includes(badge.bgClass), `Badge contém fundo: ${badge.badgeClass}`);
  assert(badge.badgeClass.includes(badge.borderClass), `Badge contém borda: ${badge.badgeClass}`);
  assert(badge.badgeClass.includes(badge.textClass), `Badge contém texto: ${badge.badgeClass}`);
}

// 4. Testar Expressões SQL
console.log('[4] Validando gerador de SQL...');
const sqlResult = buildStatusMatrixSqlExpressions();
assert(sqlResult.statusClienteSql.includes('CASE'), 'statusClienteSql deve conter CASE');
assert(sqlResult.statusGeralSql.includes('CASE'), 'statusGeralSql deve conter CASE');
assert(sqlResult.statusPagamentoSql.includes('CASE'), 'statusPagamentoSql deve conter CASE');
assert(SQL_FULL_STATUS_MATRIX_QUERY_EXAMPLE.includes('insurance_clients'), 'Exemplo de query');

// 5. Testar Opções de Filtro e Predicados SQL de Vendas e Cotações
console.log('[5] Validando opções de filtros e predicados SQL...');
assert(STATUS_CLIENTE_OPTIONS.length === 5, '5 opções de status do cliente');
assert(STATUS_GERAL_OPTIONS.length === 4, '4 opções de status geral');
assert(STATUS_PAGAMENTO_OPTIONS.length === 8, '8 opções de status de pagamento');

assert(formatStatusGeralLabel('negocio_fechado') === 'Negócio Fechado', 'Label Negócio Fechado');
assert(formatStatusPagamentoLabel('falta_pagamento_gt_50') === 'Falta Pagamento > 50 dias', 'Label Falta Pagamento > 50 dias');

const saleFilters = getSaleMatrixFilterSql('negocio_fechado', 'em_dia', 's', 'c');
assert(saleFilters.length === 2, '2 cláusulas para venda em dia');
assert(saleFilters[0].includes('s.id IS NOT NULL'), 'Venda negócio fechado');
assert(saleFilters[1].includes("s.status = 'ativa'"), 'Venda ativa');

const cotacaoFilters = getCotacaoMatrixFilterSql('pendente_assinatura', 'falta_assinatura', 'c', 's');
assert(cotacaoFilters.length === 2, '2 cláusulas para cotação pendente assinatura');
assert(cotacaoFilters[0].includes('s.id IS NULL'), 'Cotação sem venda');

console.log('✅ TODOS OS 5 BLOCOS DE TESTES PASSARAM COM SUCESSO!');

