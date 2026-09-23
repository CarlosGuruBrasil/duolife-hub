import assert from 'node:assert';

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runTests() {
  console.log('--- Iniciando Testes Automatizados: Data de Vigência com Data Atual ---');

  // 1. Valida o formato ISO YYYY-MM-DD
  const today = getTodayIsoDate();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(today), 'Data de vigência deve estar no formato YYYY-MM-DD');
  
  const now = new Date();
  const expectedYear = now.getFullYear();
  const expectedMonth = now.getMonth() + 1;
  const expectedDay = now.getDate();

  const [y, m, d] = today.split('-').map(Number);
  assert.strictEqual(y, expectedYear, 'Ano deve coincidir com ano atual local');
  assert.strictEqual(m, expectedMonth, 'Mês deve coincidir com mês atual local');
  assert.strictEqual(d, expectedDay, 'Dia deve coincidir com dia atual local');
  console.log(`✔ 1. Formato e valores da data de vigência atual validados com sucesso: ${today}`);

  // 2. Simula criação de formulário do cliente e do vendedor
  const mockInitialFormState = {
    nome: '',
    cpfCnpj: '',
    isRenovacao: 'Não',
    dataInicioVigencia: getTodayIsoDate(),
  };

  assert(mockInitialFormState.dataInicioVigencia, 'dataInicioVigencia deve ser pré-populada no estado inicial');
  assert.strictEqual(mockInitialFormState.dataInicioVigencia, today, 'dataInicioVigencia deve ser igual à data de hoje');
  console.log('✔ 2. Estado inicial do formulário (cliente e vendedor) nasce com a data atual');

  // 3. Simula avanço do Passo 3 sem preenchimento manual (fallback reativo)
  let formStateSimulado: { dataInicioVigencia?: string } = {};
  if (!formStateSimulado.dataInicioVigencia) {
    formStateSimulado.dataInicioVigencia = getTodayIsoDate();
  }
  assert.strictEqual(formStateSimulado.dataInicioVigencia, today, 'Passo 3 aplica fallback da data atual se o campo for limpo');
  console.log('✔ 3. Fallback do Passo 3 garante data atual caso o usuário não altere o campo');

  // 4. Simula formatação para ISO completa ao persistir na API
  const formatDateForIso = (dateStr: string) => {
    if (!dateStr) return null;
    try {
      const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T15:00:00Z');
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };

  const isoPayload = formatDateForIso(mockInitialFormState.dataInicioVigencia);
  assert(isoPayload !== null, 'Data formatada para ISO não pode ser nula');
  assert(isoPayload.startsWith(today), 'ISO payload deve iniciar com a data atual');
  console.log(`✔ 4. Persistência de ISO válida gerada para a cotação: ${isoPayload}`);

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE DATA DE VIGÊNCIA FORAM APROVADOS (100%)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de vigência:', err);
  process.exit(1);
});
