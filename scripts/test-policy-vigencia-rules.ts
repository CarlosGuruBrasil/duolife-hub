import assert from 'node:assert';
import {
  calculatePolicyExpiryDate,
  resolvePolicyExpiryDate,
  formatPolicyValidity,
  formatDate,
} from '../src/lib/format';

async function runTests() {
  console.log('--- Iniciando Testes Automatizados: Regra de Vigência de 1 Ano (SUSEP) ---');

  // 1. Exemplo exato do usuário: de 07/10/2026 até 06/10/2027
  const userExample = calculatePolicyExpiryDate('2026-10-07');
  assert.strictEqual(
    userExample,
    '2027-10-06',
    'Apólice iniciando em 07/10/2026 deve expirar em 06/10/2027'
  );
  console.log('✔ 1. Exemplo do usuário validado: 07/10/2026 -> 06/10/2027');

  // 2. Caso do print do usuário: de 06/10/2026 até 05/10/2027
  const screenshotExample = calculatePolicyExpiryDate('2026-10-06');
  assert.strictEqual(
    screenshotExample,
    '2027-10-05',
    'Apólice iniciando em 06/10/2026 deve expirar em 05/10/2027'
  );
  console.log('✔ 2. Caso do print validado: 06/10/2026 -> 05/10/2027');

  // 3. Início no primeiro dia do ano civil: 01/01/2026 -> 31/12/2026
  const newYearExample = calculatePolicyExpiryDate('2026-01-01');
  assert.strictEqual(
    newYearExample,
    '2026-12-31',
    'Apólice iniciando em 01/01/2026 deve expirar em 31/12/2026'
  );
  console.log('✔ 3. Ano civil validado: 01/01/2026 -> 31/12/2026');

  // 4. Ano bissexto: 29/02/2024 -> 28/02/2025
  const leapDayExample = calculatePolicyExpiryDate('2024-02-29');
  assert.strictEqual(
    leapDayExample,
    '2025-02-28',
    'Apólice iniciando em 29/02/2024 deve expirar em 28/02/2025'
  );
  console.log('✔ 4. Início em 29/02 (ano bissexto) validado: 29/02/2024 -> 28/02/2025');

  // 5. Início em 01/03/2023 terminando em ano bissexto: 01/03/2023 -> 29/02/2024
  const leapEndExample = calculatePolicyExpiryDate('2023-03-01');
  assert.strictEqual(
    leapEndExample,
    '2024-02-29',
    'Apólice iniciando em 01/03/2023 deve expirar em 29/02/2024'
  );
  console.log('✔ 5. Término em ano bissexto validado: 01/03/2023 -> 29/02/2024');

  // 6. Auto-correção de registros legados com o erro do "+ 1 ano exato"
  const legacyFixed = resolvePolicyExpiryDate('2026-10-06', '2027-10-06');
  assert.strictEqual(
    legacyFixed,
    '2027-10-05',
    'Registro com 06/10/2026 e 06/10/2027 deve ser auto-corrigido para 05/10/2027'
  );
  console.log('✔ 6. Auto-correção de registro legado 06/10/2026 + 06/10/2027 -> 05/10/2027 validada');

  // 7. Preservação de registros já corretos
  const correctPreserved = resolvePolicyExpiryDate('2026-10-06', '2027-10-05');
  assert.strictEqual(
    correctPreserved,
    '2027-10-05',
    'Registro já correto deve ser preservado'
  );
  console.log('✔ 7. Preservação de registro correto validada: 05/10/2027');

  // 8. Resolução a partir de issueDate quando expiryDate for nulo
  const resolvedNull = resolvePolicyExpiryDate('2026-10-07', null);
  assert.strictEqual(
    resolvedNull,
    '2027-10-06',
    'Resolução com expiryDate nulo deve calcular 1 ano menos 1 dia'
  );
  console.log('✔ 8. Resolução com expiryDate nulo validada: 07/10/2026 -> 06/10/2027');

  // 9. Formatação na interface: formatPolicyValidity
  const formattedUser = formatPolicyValidity('2026-10-07', '2027-10-06');
  assert.strictEqual(formattedUser, '07/10/2026 — 06/10/2027');
  console.log(`✔ 9. Formatação da vigência para usuário validada: ${formattedUser}`);

  // 10. Formatação na interface corrigindo registro legado do print (06/10/2026 - 06/10/2027 -> 06/10/2026 - 05/10/2027)
  const formattedLegacy = formatPolicyValidity('2026-10-06', '2027-10-06');
  assert.strictEqual(formattedLegacy, '06/10/2026 — 05/10/2027');
  console.log(`✔ 10. Formatação de linha da tabela do print corrigida com sucesso: ${formattedLegacy}`);

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE VIGÊNCIA ANUAL FORAM APROVADOS COM SUCESSO (100%)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de vigência:', err);
  process.exit(1);
});
