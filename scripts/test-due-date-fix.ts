import assert from 'assert';

function toIsoDateString(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s.slice(0, 10);
}

function runTests() {
  console.log('--- TESTE: Proteção de Data de Vencimento (toIsoDateString) ---');

  // Teste 1: Objeto Date nativo retornado pelo PostgreSQL
  const pgDate = new Date('2026-09-30T00:00:00.000Z');
  const resDate = toIsoDateString(pgDate);
  console.log('1. Date objeto ->', resDate);
  assert.strictEqual(resDate, '2026-09-30', 'Deve formatar Date objeto para YYYY-MM-DD');

  // Teste 2: String ISO do banco
  const isoStr = '2026-09-30T14:30:00.000Z';
  const resIso = toIsoDateString(isoStr);
  console.log('2. String ISO ->', resIso);
  assert.strictEqual(resIso, '2026-09-30', 'Deve formatar string ISO para YYYY-MM-DD');

  // Teste 3: String data simples
  const simpleStr = '2026-09-30';
  const resSimple = toIsoDateString(simpleStr);
  console.log('3. String simples ->', resSimple);
  assert.strictEqual(resSimple, '2026-09-30', 'Deve manter string YYYY-MM-DD');

  // Teste 4: Null e undefined
  assert.strictEqual(toIsoDateString(null), '', 'Null deve retornar string vazia');
  assert.strictEqual(toIsoDateString(undefined), '', 'Undefined deve retornar string vazia');
  console.log('4. Null/Undefined -> vazio [OK]');

  // Teste 5: Simulação exata do cenário do usuário onde order.due_date é Date
  const mockOrder = {
    amount_total: '1220.00',
    installment_count: 4,
    due_date: new Date('2026-09-30T00:00:00.000Z'),
    billing_type: 'BOLETO',
    description: 'Seguro RC Profissional - Plano 1 Milhão',
  };

  const body = {
    valorTotal: 1220,
    qtdParcelas: 4,
    dueDate: '2026-09-30',
    billingType: 'CREDIT_CARD',
    description: 'Seguro RC Profissional - Plano 1 Milhão',
  };

  // Executa sem estourar TypeError: (order.due_date || "").slice is not a function
  const currentTotal = parseFloat(mockOrder.amount_total) || 0;
  const currentParcelas = mockOrder.installment_count || 1;
  const currentDue = toIsoDateString(mockOrder.due_date);
  const currentDesc = mockOrder.description || '';

  const newTotal = body.valorTotal !== undefined && body.valorTotal > 0
    ? Math.round(Number(body.valorTotal) * 100) / 100
    : currentTotal;
  const newParcelas = body.qtdParcelas !== undefined && body.qtdParcelas > 0
    ? Math.floor(Number(body.qtdParcelas))
    : currentParcelas;
  const newDue = body.dueDate ? toIsoDateString(body.dueDate) : currentDue;
  const newDesc = body.description !== undefined ? String(body.description).trim() : currentDesc;
  const newBillingType = String(body.billingType || mockOrder.billing_type || 'UNDEFINED').toUpperCase();
  const currentBillingType = String(mockOrder.billing_type || 'UNDEFINED').toUpperCase();
  const billingTypeChanged = Boolean(body.billingType && newBillingType !== currentBillingType);

  console.log('5. Cenário do Usuário:');
  console.log('   currentDue:', currentDue);
  console.log('   newDue:', newDue);
  console.log('   billingTypeChanged:', billingTypeChanged);

  assert.strictEqual(currentDue, '2026-09-30');
  assert.strictEqual(newDue, '2026-09-30');
  assert.strictEqual(billingTypeChanged, true);

  console.log('\n>>> TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! <<<');
}

runTests();
