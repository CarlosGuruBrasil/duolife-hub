// Mock offline do Postgres para execução estritamente em memória (sem conexão TCP)
const offlineSqlMock = ((..._args: any[]) => Promise.resolve([])) as any;
offlineSqlMock.unsafe = () => Promise.resolve([]);
offlineSqlMock.json = (val: any) => JSON.stringify(val);
offlineSqlMock.array = (val: any) => val;
(global as any)._pg = offlineSqlMock;

import { calcularPrecoServidor, FALLBACK_PLANOS } from '../src/lib/pricing';
import { getRamoConfig, RAMOS_REGISTRY } from '../src/lib/product-schemas';

async function runTests() {
  console.log('=== TESTES DE PRECIFICAÇÃO E ARQUITETURA MULTI-RAMO ===');

  // 1. Teste RC Advogados (Padrão e Fallback)
  console.log('\n--- 1. RC Advogados ---');
  const precoAdv = await calcularPrecoServidor({
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 2,
    flowKey: 'rc_professional_v1',
  });
  console.log('Preço RC Advogados 200k (2x):', precoAdv);
  if (!precoAdv || precoAdv.valorOriginal !== 1200 || precoAdv.valorTotal !== 1200 || precoAdv.qtdParcelas !== 2 || precoAdv.valorParcela !== 600) {
    throw new Error(`Cálculo de RC Advogados incorreto: ${JSON.stringify(precoAdv)}`);
  }
  console.log('✓ RC Advogados 200k calculado com sucesso');

  // Teste Plano 100k RC Advogados (Apenas à vista)
  const precoAdv100k = await calcularPrecoServidor({
    tipoDePlano: '100k',
    qtdParcelasSolicitada: 4,
    flowKey: 'rc_advogados_v1',
  });
  console.log('Preço RC Advogados 100k (tentou 4x, deve forçar 1x):', precoAdv100k);
  if (!precoAdv100k || precoAdv100k.qtdParcelas !== 1 || precoAdv100k.valorTotal !== 680 || precoAdv100k.valorParcela !== 680) {
    throw new Error(`Plano 100k não forçou pagamento à vista: ${JSON.stringify(precoAdv100k)}`);
  }
  console.log('✓ Plano 100k forçou 1 parcela à vista corretamente');

  // 2. Teste RC Médicos
  console.log('\n--- 2. RC Médicos ---');
  const precoMed = await calcularPrecoServidor({
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 3,
    flowKey: 'rc_medicos_v1',
  });
  console.log('Preço RC Médicos 200k (3x):', precoMed);
  if (!precoMed || precoMed.valorOriginal !== 1850 || precoMed.qtdParcelas !== 3 || precoMed.valorParcela !== 616.67) {
    throw new Error(`Cálculo de RC Médicos incorreto: ${JSON.stringify(precoMed)}`);
  }
  console.log('✓ RC Médicos 200k (3x) calculado com sucesso');

  // 3. Teste Trava Inegociável de 40% de Desconto Comercial
  console.log('\n--- 3. Trava de Desconto Máximo de 40% ---');
  const precoComDescontoTentado50 = await calcularPrecoServidor({
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 1,
    flowKey: 'rc_medicos_v1',
    descontoManualPercent: 50, // Tentativa abusiva acima de 40%
  });
  console.log('Preço com tentativa de 50% de desconto:', precoComDescontoTentado50);
  if (!precoComDescontoTentado50 || precoComDescontoTentado50.descontoPercentual !== 40) {
    throw new Error(`Trava de 40% falhou! Desconto aplicado: ${precoComDescontoTentado50?.descontoPercentual}`);
  }
  // 1850 - 40% = 1850 * 0.6 = 1110
  if (precoComDescontoTentado50.valorTotal !== 1110) {
    throw new Error(`Valor com desconto de 40% incorreto: esperado 1110, obtido ${precoComDescontoTentado50.valorTotal}`);
  }
  console.log('✓ Trava inegociável de 40% de desconto aplicada com sucesso (50% limitado a 40%)');

  // Desconto de 25% válido
  const precoComDesconto25 = await calcularPrecoServidor({
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 2,
    flowKey: 'rc_medicos_v1',
    descontoManualPercent: 25,
  });
  console.log('Preço com desconto de 25% (2x):', precoComDesconto25);
  // Original: 1850, Parcela 2X: 925
  // Desconto 25%: total = 1850 * 0.75 = 1387.50
  // Parcela com desconto: 925 * 0.75 = 693.75
  if (!precoComDesconto25 || precoComDesconto25.valorTotal !== 1387.5 || precoComDesconto25.valorParcela !== 693.75) {
    throw new Error(`Cálculo de desconto parcial e parcela incorreto: ${JSON.stringify(precoComDesconto25)}`);
  }
  console.log('✓ Desconto comercial de 25% e parcelas calculados com exatidão');

  // 4. Teste D&O Executivos
  console.log('\n--- 4. Seguro D&O Executivos ---');
  const precoDo = await calcularPrecoServidor({
    tipoDePlano: '1M',
    qtdParcelasSolicitada: 4,
    flowKey: 'do_executivos_v1',
  });
  console.log('Preço D&O 1M (4x):', precoDo);
  const doConfig = RAMOS_REGISTRY['do-executivos'];
  const planoDo1M = doConfig.planos.find(p => p.tipoDePlano === '1M');
  console.log('Plano D&O 1M esperado:', planoDo1M);
  if (!precoDo || precoDo.valorOriginal <= 0 || precoDo.qtdParcelas !== 4) {
    throw new Error(`Cálculo de D&O incorreto: ${JSON.stringify(precoDo)}`);
  }
  console.log('✓ Seguro D&O Executivos calculado com sucesso');

  // 5. Teste de Produto não Registrado
  console.log('\n--- 5. Produto não registrado ---');
  const precoDesconhecido = await calcularPrecoServidor({
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 1,
    flowKey: 'ramo_inexistente_xyz',
  });
  if (precoDesconhecido !== null) {
    throw new Error(`Esperado null para ramo desconhecido, obtido ${JSON.stringify(precoDesconhecido)}`);
  }
  console.log('✓ Ramo desconhecido retornou null com segurança');

  console.log('\n==============================================');
  console.log('TODOS OS TESTES DE PRECIFICAÇÃO PASSARAM (100%)');
  console.log('==============================================');
}

runTests().catch((err) => {
  console.error('ERRO NOS TESTES:', err);
  process.exit(1);
});
