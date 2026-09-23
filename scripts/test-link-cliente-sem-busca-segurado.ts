import assert from 'node:assert';
import { GET as buscaClientesGet } from '../app/api/clientes/busca/route';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('--- Iniciando Testes Automatizados: Bloqueio de Busca e Auto-preenchimento no Link do Cliente ---');

  // 1. Testa requisição para /api/clientes/busca com header x-public-token
  const reqWithHeader = new NextRequest('http://localhost:3000/api/clientes/busca?q=Carlos', {
    headers: {
      'x-public-token': 'dlk_test_1234567890',
    },
  });

  const resWithHeader = await buscaClientesGet(reqWithHeader);
  assert.strictEqual(resWithHeader.status, 403, 'Requisição com header x-public-token deve retornar status 403');
  const bodyHeader = await resWithHeader.json();
  assert(bodyHeader.error.includes('desabilitada em links públicos'), 'Mensagem de erro deve indicar bloqueio para links públicos');
  console.log('✔ 1. Bloqueio por header x-public-token na API /api/clientes/busca validado com 403');

  // 2. Testa requisição para /api/clientes/busca com query ?token=...
  const reqWithQuery = new NextRequest('http://localhost:3000/api/clientes/busca?q=Carlos&token=dlk_test_1234567890');
  const resWithQuery = await buscaClientesGet(reqWithQuery);
  assert.strictEqual(resWithQuery.status, 403, 'Requisição com query token deve retornar status 403');
  console.log('✔ 2. Bloqueio por query parameter token na API /api/clientes/busca validado com 403');

  // 3. Testa requisição para /api/clientes/busca com query ?publicToken=...
  const reqWithPublicQuery = new NextRequest('http://localhost:3000/api/clientes/busca?q=Carlos&publicToken=dlk_test_1234567890');
  const resWithPublicQuery = await buscaClientesGet(reqWithPublicQuery);
  assert.strictEqual(resWithPublicQuery.status, 403, 'Requisição com query publicToken deve retornar status 403');
  console.log('✔ 3. Bloqueio por query parameter publicToken na API /api/clientes/busca validado com 403');

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE BLOQUEIO DE BUSCA FORAM APROVADOS (100%)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de bloqueio:', err);
  process.exit(1);
});
