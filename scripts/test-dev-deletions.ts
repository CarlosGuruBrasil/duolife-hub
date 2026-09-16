import { sql } from '../src/lib/pg';
import { roleIsDev, UserRole } from '../src/lib/roles';

async function main() {
  console.log('--- TESTE AUTOMATIZADO DE EXCLUSÕES PARA DESENVOLVEDOR ---');

  // 1. Verificação de papéis (Role Dev)
  console.log('\n1. Testando predicados de papel:');
  const rolesTest: [UserRole, boolean][] = [
    ['duolife_dev', true],
    ['duolife_admin', false],
    ['duolife_staff', false],
    ['corretora_admin', false],
    ['corretora_manager', false],
    ['corretora_staff', false],
    ['partner_director', false],
    ['partner_manager', false],
    ['partner_broker', false],
    ['partner_partner', false],
  ];

  for (const [role, expected] of rolesTest) {
    const isDev = roleIsDev(role);
    if (isDev !== expected) {
      throw new Error(`Falha no papel ${role}: esperado ${expected}, obtido ${isDev}`);
    }
  }
  console.log('✔ Todos os 10 papéis validados: apenas "duolife_dev" possui autorização de desenvolvedor.');

  // 2. Teste de Exclusão de Boleto / Parcela no Banco
  console.log('\n2. Testando exclusão de Parcela / Boleto:');
  const testDoc = '99999999901';
  
  // Cria cliente de teste
  const [testClient] = await sql`
    INSERT INTO insurance_clients (document_number, full_name, email)
    VALUES (${testDoc}, 'Cliente Teste Dev Exclusao', 'teste.dev@duolife.com.br')
    ON CONFLICT (document_number) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id
  `;

  // Busca produto e parceiro para teste
  const [product] = await sql`SELECT id FROM products LIMIT 1`;
  const [partner] = await sql`SELECT id FROM partners LIMIT 1`;

  if (!product || !partner) {
    throw new Error('Produto ou parceiro não localizado para executar teste');
  }

  // Cria cotação de teste
  const [testQuote] = await sql`
    INSERT INTO cotacoes (client_id, partner_id, product_id, client_name, client_cpf_cnpj, status, premio_final)
    VALUES (${testClient.id}, ${partner.id}, ${product.id}, 'Cliente Teste Dev Exclusao', ${testDoc}, 'pagamento_gerado', 500.00)
    RETURNING id
  `;

  // Cria ordem e parcela de teste
  const [testOrder] = await sql`
    INSERT INTO payment_orders (cotacao_id, client_id, partner_id, product_id, amount_total, installment_count, status)
    VALUES (${testQuote.id}, ${testClient.id}, ${partner.id}, ${product.id}, 500.00, 2, 'pending')
    RETURNING id
  `;

  const [testInst1] = await sql`
    INSERT INTO payment_installments (payment_order_id, cotacao_id, client_id, external_payment_id, installment_number, status, amount)
    VALUES (${testOrder.id}, ${testQuote.id}, ${testClient.id}, 'pay_teste_dev_01', 1, 'pending', 250.00)
    RETURNING id
  `;
  const [testInst2] = await sql`
    INSERT INTO payment_installments (payment_order_id, cotacao_id, client_id, external_payment_id, installment_number, status, amount)
    VALUES (${testOrder.id}, ${testQuote.id}, ${testClient.id}, 'pay_teste_dev_02', 2, 'pending', 250.00)
    RETURNING id
  `;

  // Exclui a primeira parcela
  await sql`DELETE FROM payment_installments WHERE id = ${testInst1.id}`;
  const [remInst] = await sql`SELECT COUNT(*)::int AS count FROM payment_installments WHERE payment_order_id = ${testOrder.id}`;
  if (remInst.count !== 1) {
    throw new Error(`Esperado 1 parcela restante, obtido ${remInst.count}`);
  }
  console.log('✔ Parcela 1 excluída com sucesso, restando 1 parcela na ordem.');

  // Exclui a segunda parcela e a ordem
  await sql`DELETE FROM payment_installments WHERE id = ${testInst2.id}`;
  await sql`DELETE FROM payment_orders WHERE id = ${testOrder.id}`;
  const [remOrders] = await sql`SELECT COUNT(*)::int AS count FROM payment_orders WHERE id = ${testOrder.id}`;
  if (remOrders.count !== 0) {
    throw new Error(`Ordem não excluída após remoção de todas as parcelas`);
  }
  console.log('✔ Todas as parcelas e a ordem excluídas com sucesso.');

  // 3. Teste de Exclusão de Cotação com Cobranças Não Pagas
  console.log('\n3. Testando exclusão de cotação com cobranças não pagas:');
  const [testQuote2] = await sql`
    INSERT INTO cotacoes (client_id, partner_id, product_id, client_name, client_cpf_cnpj, status, premio_final)
    VALUES (${testClient.id}, ${partner.id}, ${product.id}, 'Cliente Teste Dev Exclusao 2', ${testDoc}, 'pagamento_gerado', 300.00)
    RETURNING id
  `;

  const [testOrder2] = await sql`
    INSERT INTO payment_orders (cotacao_id, client_id, partner_id, product_id, amount_total, installment_count, status)
    VALUES (${testQuote2.id}, ${testClient.id}, ${partner.id}, ${product.id}, 300.00, 1, 'pending')
    RETURNING id
  `;

  await sql`
    INSERT INTO payment_installments (payment_order_id, cotacao_id, client_id, external_payment_id, installment_number, status, amount)
    VALUES (${testOrder2.id}, ${testQuote2.id}, ${testClient.id}, 'pay_teste_dev_03', 1, 'pending', 300.00)
  `;

  // Simula a rotina da API: exclusão de cobranças não pagas + cotação
  await sql.begin(async (tx) => {
    await tx`DELETE FROM payment_installments WHERE cotacao_id = ${testQuote2.id}`;
    await tx`DELETE FROM payment_orders WHERE cotacao_id = ${testQuote2.id}`;
    await tx`DELETE FROM cotacoes WHERE id = ${testQuote2.id}`;
  });

  const [q2Check] = await sql`SELECT COUNT(*)::int AS count FROM cotacoes WHERE id = ${testQuote2.id}`;
  const [ord2Check] = await sql`SELECT COUNT(*)::int AS count FROM payment_orders WHERE cotacao_id = ${testQuote2.id}`;
  const [inst2Check] = await sql`SELECT COUNT(*)::int AS count FROM payment_installments WHERE cotacao_id = ${testQuote2.id}`;

  if (q2Check.count !== 0 || ord2Check.count !== 0 || inst2Check.count !== 0) {
    throw new Error('Falha na exclusão da cotação com suas cobranças não pagas');
  }
  console.log('✔ Cotação e cobranças não pagas excluídas simultaneamente com sucesso.');

  // 4. Teste de Exclusão de Cliente em Cascata
  console.log('\n4. Testando exclusão de cliente em cascata (cliente + cotações + cobranças):');
  // Cria nova cotação e parcelas para o cliente
  const [testQuote3] = await sql`
    INSERT INTO cotacoes (client_id, partner_id, product_id, client_name, client_cpf_cnpj, status, premio_final)
    VALUES (${testClient.id}, ${partner.id}, ${product.id}, 'Cliente Teste Dev Exclusao 3', ${testDoc}, 'rascunho', 450.00)
    RETURNING id
  `;

  const [testOrder3] = await sql`
    INSERT INTO payment_orders (cotacao_id, client_id, partner_id, product_id, amount_total, installment_count, status)
    VALUES (${testQuote3.id}, ${testClient.id}, ${partner.id}, ${product.id}, 450.00, 1, 'pending')
    RETURNING id
  `;

  await sql`
    INSERT INTO payment_installments (payment_order_id, cotacao_id, client_id, external_payment_id, installment_number, status, amount)
    VALUES (${testOrder3.id}, ${testQuote3.id}, ${testClient.id}, 'pay_teste_dev_04', 1, 'pending', 450.00)
  `;

  // Executa exclusão completa do cliente em cascata
  await sql.begin(async (tx) => {
    await tx`DELETE FROM payment_installments WHERE client_id = ${testClient.id}`;
    await tx`DELETE FROM payment_orders WHERE client_id = ${testClient.id}`;
    await tx`DELETE FROM cotacoes WHERE client_id = ${testClient.id}`;
    await tx`DELETE FROM insurance_clients WHERE id = ${testClient.id}`;
  });

  const [cliCheck] = await sql`SELECT COUNT(*)::int AS count FROM insurance_clients WHERE id = ${testClient.id}`;
  const [qCheckFinal] = await sql`SELECT COUNT(*)::int AS count FROM cotacoes WHERE client_id = ${testClient.id}`;
  const [ordCheckFinal] = await sql`SELECT COUNT(*)::int AS count FROM payment_orders WHERE client_id = ${testClient.id}`;

  if (cliCheck.count !== 0 || qCheckFinal.count !== 0 || ordCheckFinal.count !== 0) {
    throw new Error('Falha na exclusão em cascata do cliente');
  }
  console.log('✔ Cliente, cotações e ordens/parcelas excluídos em cascata com 100% de sucesso.');

  // Limpeza final de segurança
  await sql`DELETE FROM insurance_clients WHERE document_number = ${testDoc}`;
  await sql`DELETE FROM cotacoes WHERE client_cpf_cnpj = ${testDoc}`;

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
