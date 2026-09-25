import { normalizeEmailVariables } from '../src/lib/email-service';

function runTests() {
  console.log('--- TESTE: Formas de Pagamento e Normalização de Variáveis de E-mail ---');

  // 1. Teste de normalização de formaPagamento e formaPagamentoTexto
  const rawInput = {
    nome: 'Carlos Eduardo',
    cotacao_id: 'abc-123',
    formaPagamento: 'UNDEFINED',
    formaPagamentoTexto: 'Fatura (Cartão de Crédito, Boleto Bancário ou PIX)',
  };

  const normalized = normalizeEmailVariables(rawInput);
  console.log('Variáveis normalizadas:', normalized);

  if (normalized.forma_pagamento !== 'UNDEFINED') {
    throw new Error('Falha na normalização de forma_pagamento');
  }
  if (normalized.forma_pagamento_texto !== 'Fatura (Cartão de Crédito, Boleto Bancário ou PIX)') {
    throw new Error('Falha na normalização de forma_pagamento_texto');
  }
  if (normalized.billing_type !== 'UNDEFINED') {
    throw new Error('Falha na normalização de billing_type');
  }
  console.log('[OK] Normalização de aliases validada com sucesso');

  // 2. Teste com billingType / forma_pagamento camelCase
  const rawInput2 = {
    billingType: 'CREDIT_CARD',
    forma_pagamento_texto: 'Cartão de Crédito',
  };
  const normalized2 = normalizeEmailVariables(rawInput2);
  if (normalized2.forma_pagamento !== 'CREDIT_CARD' || normalized2.billing_type !== 'CREDIT_CARD') {
    throw new Error('Falha no fallback de billingType para forma_pagamento');
  }
  console.log('[OK] Normalização reversa (billingType -> forma_pagamento) validada com sucesso');

  // 3. Teste das 4 modalidades
  const modalidades = ['UNDEFINED', 'BOLETO', 'PIX', 'CREDIT_CARD'];
  for (const mod of modalidades) {
    const res = normalizeEmailVariables({ formaPagamento: mod });
    if (res.forma_pagamento !== mod || res.billing_type !== mod) {
      throw new Error(`Falha no mapeamento da modalidade ${mod}`);
    }
  }
  console.log('[OK] As 4 modalidades testadas com sucesso');

  console.log('\n>>> TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! <<<');
}

runTests();
