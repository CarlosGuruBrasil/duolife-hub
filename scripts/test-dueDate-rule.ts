import { calculateBillingDueDate } from '../src/lib/business-days';

console.log('=== TESTES DA NOVA REGRA DE VENCIMENTO E EMISSÃO DE COBRANÇA ===\n');

let passCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

// 1. Cenário Normal: Vigência no Futuro (sexta-feira 25/09/2026, hoje 22/09/2026)
// Vencimento = 25/09 + 2 dias úteis = 29/09/2026 (terça-feira, pulando sábado e domingo)
{
  const res = calculateBillingDueDate({
    rawVigencia: '2026-09-25',
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(res.ok === true, 'Cenário 1: Vigência futura deve permitir emissão para vendedor');
  assert(res.dueDate === '2026-09-29', `Cenário 1: Vencimento deve ser 2026-09-29 (obtido: ${res.dueDate})`);
  assert(res.reason === 'normal', 'Cenário 1: Reason deve ser normal');
}

// 2. Cenário Normal: Vigência Hoje (22/09/2026)
// Vencimento = 22/09 + 2 dias úteis = 24/09/2026
{
  const res = calculateBillingDueDate({
    rawVigencia: '2026-09-22',
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(res.ok === true, 'Cenário 2: Vigência hoje deve permitir emissão para vendedor');
  assert(res.dueDate === '2026-09-24', `Cenário 2: Vencimento deve ser 2026-09-24 (obtido: ${res.dueDate})`);
}

// 3. Nova Regra: Vigência atrasada (21/09/2026, segunda), mas assinado hoje (22/09/2026, terça - 1 dia útil após vigência)
// Vencimento = Data da Assinatura (22/09) + 2 dias úteis = 24/09/2026
{
  const res = calculateBillingDueDate({
    rawVigencia: '2026-09-21',
    rawAssinatura: '2026-09-22T14:30:00.000Z',
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(res.ok === true, 'Cenário 3: Vigência ontem, assinado hoje (1 dia útil) -> VENDEDOR PERMITIDO');
  assert(res.dueDate === '2026-09-24', `Cenário 3: Vencimento deve ser assinatura + 2 dias úteis: 2026-09-24 (obtido: ${res.dueDate})`);
  assert(res.reason === 'late_signed_on_time', 'Cenário 3: Reason deve ser late_signed_on_time');
}

// 4. Nova Regra com Fim de Semana: Vigência sexta (18/09/2026), assinado terça (22/09/2026)
// 18/09 + 2 dias úteis = 22/09 (limite exato). Assinado em 22/09.
// Vencimento = Assinatura (22/09) + 2 dias úteis = 24/09/2026
{
  const res = calculateBillingDueDate({
    rawVigencia: '2026-09-18',
    rawAssinatura: '2026-09-22',
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(res.ok === true, 'Cenário 4: Vigência sexta, assinado terça (exatos 2 dias úteis) -> VENDEDOR PERMITIDO');
  assert(res.dueDate === '2026-09-24', `Cenário 4: Vencimento deve ser 2026-09-24 (obtido: ${res.dueDate})`);
}

// 5. Nova Regra: Vigência atrasada (18/09/2026), assinado fora do prazo (quarta 23/09/2026, 3 dias úteis após)
{
  // Vendedor
  const resVendor = calculateBillingDueDate({
    rawVigencia: '2026-09-18',
    rawAssinatura: '2026-09-23',
    todayDate: '2026-09-23',
    isManualAdmin: false,
  });
  assert(resVendor.ok === false, 'Cenário 5: Assinatura fora dos 2 dias úteis -> VENDEDOR BLOQUEADO');
  assert(resVendor.reason === 'blocked_late_signature', 'Cenário 5: Reason deve ser blocked_late_signature');

  // Admin Override
  const resAdmin = calculateBillingDueDate({
    rawVigencia: '2026-09-18',
    rawAssinatura: '2026-09-23',
    todayDate: '2026-09-23',
    isManualAdmin: true,
  });
  assert(resAdmin.ok === true, 'Cenário 5: Admin pode emitir mesmo com assinatura tardia');
  assert(resAdmin.dueDate === '2026-09-25', `Cenário 5: Vencimento Admin deve ser hoje + 2 dias úteis (2026-09-25) (obtido: ${resAdmin.dueDate})`);
  assert(resAdmin.reason === 'admin_override', 'Cenário 5: Reason Admin deve ser admin_override');
}

// 6. Vigência atrasada e CONTRATO NÃO ASSINADO
{
  // Vendedor
  const resVendor = calculateBillingDueDate({
    rawVigencia: '2026-09-18',
    rawAssinatura: null,
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(resVendor.ok === false, 'Cenário 6: Vigência passada e não assinado -> VENDEDOR BLOQUEADO');
  assert(resVendor.reason === 'blocked_not_signed', 'Cenário 6: Reason deve ser blocked_not_signed');

  // Admin
  const resAdmin = calculateBillingDueDate({
    rawVigencia: '2026-09-18',
    rawAssinatura: null,
    todayDate: '2026-09-22',
    isManualAdmin: true,
  });
  assert(resAdmin.ok === true, 'Cenário 6: Admin pode emitir para contrato não assinado com vigência passada');
  assert(resAdmin.dueDate === '2026-09-24', 'Cenário 6: Admin vencimento = hoje + 2 dias úteis');
}

// 7. Salvaguarda: Assinado no prazo em relação à vigência, mas data de vencimento da assinatura já prescreveu no tempo
// Exemplo: Vigência 01/09/2026, assinado 02/09/2026 (dentro de 2 dias úteis). Vencimento da fatura seria 04/09/2026.
// Hoje é 22/09/2026 -> 04/09/2026 já passou!
{
  const resVendor = calculateBillingDueDate({
    rawVigencia: '2026-09-01',
    rawAssinatura: '2026-09-02',
    todayDate: '2026-09-22',
    isManualAdmin: false,
  });
  assert(resVendor.ok === false, 'Cenário 7: Vencimento da fatura prescreveu -> VENDEDOR BLOQUEADO (evita erro 400 no Asaas)');
  assert(resVendor.reason === 'blocked_expired_due_date', 'Cenário 7: Reason deve ser blocked_expired_due_date');

  const resAdmin = calculateBillingDueDate({
    rawVigencia: '2026-09-01',
    rawAssinatura: '2026-09-02',
    todayDate: '2026-09-22',
    isManualAdmin: true,
  });
  assert(resAdmin.ok === true, 'Cenário 7: Admin pode emitir cobrança com vencimento atualizado');
  assert(resAdmin.dueDate === '2026-09-24', 'Cenário 7: Admin vencimento = hoje + 2 dias úteis');
}

console.log(`\nResultado dos Testes: ${passCount}/${totalCount} passaram com sucesso.`);
if (passCount === totalCount) {
  console.log('>>> TODOS OS TESTES DA NOVA REGRA DE VENCIMENTO PASSARAM COM 100% DE SUCESSO! <<<');
} else {
  process.exit(1);
}
