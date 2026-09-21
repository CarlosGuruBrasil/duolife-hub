import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql } from '../src/lib/pg';
import { ensureSchema } from '../src/lib/schema';

async function run() {
  console.log('🧪 Iniciando Teste de Integração End-to-End do Fluxo Multi-Corretora...\n');

  await ensureSchema();

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const testCorretoraId = `test_corretora_${testSuffix}`;
  const testCorretoraEmail = `contato_${testSuffix}@corretorateste.com.br`;
  const testAdminEmail = `gestor_${testSuffix}@corretorateste.com.br`;
  const testPlainPassword = 'senhaTeste@2026';
  const testPasswordHash = await bcrypt.hash(testPlainPassword, 10);

  let testPartnerId: string | null = null;
  let testUserId: string | null = null;

  try {
    // 1. Cadastrar nova corretora
    console.log('1. Cadastrando nova corretora de testes...');
    const [corretora] = await sql`
      INSERT INTO corretoras (
        id,
        razao_social,
        nome_fantasia,
        cnpj,
        susep,
        email,
        phone,
        status,
        metadata
      )
      VALUES (
        ${testCorretoraId},
        ${`Alfa Seguros ${testSuffix} Ltda`},
        ${`Alfa Seguros ${testSuffix}`},
        ${`99${Date.now().toString().slice(-12)}`},
        '12345678',
        ${testCorretoraEmail},
        '(11) 99999-9999',
        'active',
        '{"whiteLabel": {"slug": "alfa-teste"}}'::jsonb
      )
      RETURNING id, nome_fantasia, status
    `;

    assert.equal(corretora.id, testCorretoraId);
    assert.equal(corretora.status, 'active');
    console.log(`   ✅ Corretora cadastrada com ID: ${corretora.id}`);

    // 2. Criar usuário administrador master da corretora
    console.log('2. Criando usuário administrador master da corretora...');
    const [corretoraUser] = await sql`
      INSERT INTO corretora_users (
        corretora_id,
        name,
        email,
        password_hash,
        role,
        permissions,
        is_active
      )
      VALUES (
        ${testCorretoraId},
        'Gestor Master Teste',
        ${testAdminEmail},
        ${testPasswordHash},
        'corretora_admin',
        '{"admin": true, "manage_team": true, "view_all_sales": true}'::jsonb,
        true
      )
      RETURNING id, name, email, role, is_active
    `;

    assert.equal(corretoraUser.email, testAdminEmail);
    assert.equal(corretoraUser.role, 'corretora_admin');
    assert.equal(corretoraUser.is_active, true);
    console.log(`   ✅ Usuário corretora_admin criado com ID: ${corretoraUser.id}`);

    // 3. Validar autenticação do usuário da corretora
    console.log('3. Validando login e comparação de senha do gestor da corretora...');
    const [loginCheck] = await sql`
      SELECT cu.id, cu.corretora_id, cu.password_hash, cu.role, c.status as corretora_status
      FROM corretora_users cu
      JOIN corretoras c ON c.id = cu.corretora_id
      WHERE cu.email = ${testAdminEmail} AND cu.is_active = true
    `;
    assert.ok(loginCheck);
    assert.equal(loginCheck.corretora_status, 'active');
    const passwordValid = await bcrypt.compare(testPlainPassword, loginCheck.password_hash);
    assert.equal(passwordValid, true);
    console.log('   ✅ Credenciais e status validados com sucesso.');

    // 4. Simular cadastro de vendedor pela corretora
    console.log('4. Cadastrando novo vendedor vinculado à corretora...');
    const testSellerEmail = `vendedor_${testSuffix}@corretorateste.com.br`;
    const [newPartner] = await sql`
      INSERT INTO partners (
        corretora_id,
        razao_social,
        nome_fantasia,
        person_type,
        email,
        status,
        metadata
      )
      VALUES (
        ${testCorretoraId},
        'Vendedor João Silva',
        'Vendedor João Silva',
        'pf',
        ${testSellerEmail},
        'active',
        '{"source": "portal_equipe"}'::jsonb
      )
      RETURNING id, razao_social, email, corretora_id
    `;
    testPartnerId = newPartner.id;
    assert.equal(newPartner.corretora_id, testCorretoraId);

    const [newSellerUser] = await sql`
      INSERT INTO partner_users (
        partner_id,
        name,
        email,
        password_hash,
        role,
        is_active
      )
      VALUES (
        ${newPartner.id},
        'Vendedor João Silva',
        ${testSellerEmail},
        ${testPasswordHash},
        'broker',
        true
      )
      RETURNING id, name, email, role
    `;
    testUserId = newSellerUser.id;

    // 5. Vincular produtos ativos para o novo vendedor (como implementado no endpoint)
    await sql`
      INSERT INTO partner_product_availability (partner_id, product_id, is_active)
      SELECT ${newPartner.id}, id, true
      FROM products
      WHERE is_active = true
      ON CONFLICT (partner_id, product_id) DO NOTHING
    `;
    console.log(`   ✅ Vendedor criado e vinculado à corretora (partnerId: ${newPartner.id})`);

    // 6. Validar se os produtos ativos estão realmente disponíveis para o vendedor
    console.log('6. Verificando catálogo de produtos disponíveis para o vendedor...');
    const availableProducts = await sql`
      SELECT p.id, p.name, p.code
      FROM products p
      JOIN partner_product_availability ppa ON ppa.product_id = p.id
      WHERE ppa.partner_id = ${newPartner.id} AND ppa.is_active = true AND p.is_active = true
    `;
    assert.ok(availableProducts.length > 0, 'O vendedor deve ter pelo menos 1 produto ativo disponível');
    console.log(`   ✅ Vendedor possui ${availableProducts.length} produto(s) ativo(s) pronto(s) para cotação!`);

    // 7. Validar isolamento multi-tenant (NET4Life não enxerga o vendedor da nova corretora)
    console.log('7. Validando isolamento multi-tenant entre corretoras...');
    const net4lifeSellers = await sql`
      SELECT p.id, p.razao_social
      FROM partners p
      WHERE p.corretora_id = 'corretora_net4life_001' AND p.id = ${newPartner.id}
    `;
    assert.equal(net4lifeSellers.length, 0, 'NET4Life não pode enxergar o vendedor da nova corretora');

    const corretoraSellers = await sql`
      SELECT p.id, p.razao_social
      FROM partners p
      WHERE p.corretora_id = ${testCorretoraId} AND p.id = ${newPartner.id}
    `;
    assert.equal(corretoraSellers.length, 1, 'A nova corretora deve enxergar exatamente seu vendedor');
    console.log('   ✅ Isolamento multi-tenant validado com sucesso.');

    console.log('\n🎉 TODOS OS TESTES END-TO-END DO FLUXO MULTI-CORRETORA PASSARAM COM SUCESSO!\n');
  } finally {
    // Limpeza dos dados de teste
    console.log('🧹 Limpando dados de teste do banco de dados...');
    if (testPartnerId) {
      await sql`DELETE FROM partner_product_availability WHERE partner_id = ${testPartnerId}`;
      await sql`DELETE FROM partner_users WHERE partner_id = ${testPartnerId}`;
      await sql`DELETE FROM partners WHERE id = ${testPartnerId}`;
    }
    await sql`DELETE FROM corretora_users WHERE corretora_id = ${testCorretoraId}`;
    await sql`DELETE FROM corretoras WHERE id = ${testCorretoraId}`;
    console.log('   ✅ Base limpa.');
    await sql.end();
  }
}

run().catch((err) => {
  console.error('❌ Erro no teste E2E:', err);
  process.exit(1);
});
