if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

import assert from 'node:assert';
import {
  DEFAULT_CONTRACT_TEMPLATES,
  getContractTemplateBySlug,
  getContractTemplateByIdOrSlug,
  listContractTemplates,
} from '../src/lib/contract-templates-service';

async function testContractTemplates() {
  console.log('🧪 Iniciando testes de Contract Templates e Fallback...');

  // 1. Verifica template padrão rc_advogados_adesao
  const rcAdv = DEFAULT_CONTRACT_TEMPLATES.find((t) => t.slug === 'rc_advogados_adesao');
  assert(rcAdv, 'Template padrão rc_advogados_adesao deve existir');
  assert.strictEqual(rcAdv.titulo, 'Seguro de Responsabilidade Civil para Advogado');
  assert.strictEqual(rcAdv.subtitulo, 'Termo de Adesão por parte do Advogado');
  assert(rcAdv.declaracao_texto.includes('O Proponente, ao optar pelo pagamento do prêmio do seguro'));
  assert(rcAdv.declaracao_texto.includes('DUOLIFE PLATAFORMA DE NEGÓCIOS'));
  assert(Array.isArray(rcAdv.tabela_proponente) && rcAdv.tabela_proponente.length > 0);
  assert(Array.isArray(rcAdv.tabela_condicoes) && rcAdv.tabela_condicoes.length > 0);
  console.log('✅ Template padrão rc_advogados_adesao verificado com sucesso.');

  // 2. Testa fallback seguro de busca por slug
  const fetchedBySlug = await getContractTemplateBySlug('rc_advogados_adesao');
  assert(fetchedBySlug, 'getContractTemplateBySlug deve retornar template mesmo sem conexão com BD');
  assert.strictEqual(fetchedBySlug.slug, 'rc_advogados_adesao');
  assert.strictEqual(fetchedBySlug.titulo, 'Seguro de Responsabilidade Civil para Advogado');
  console.log('✅ getContractTemplateBySlug fallback funcionando.');

  // 3. Testa busca por id ou slug
  const fetchedByIdOrSlug = await getContractTemplateByIdOrSlug('tpl_rc_advogados_adesao');
  assert(fetchedByIdOrSlug, 'getContractTemplateByIdOrSlug deve resolver pelo id');
  assert.strictEqual(fetchedByIdOrSlug.slug, 'rc_advogados_adesao');
  console.log('✅ getContractTemplateByIdOrSlug fallback funcionando.');

  // 4. Testa listagem com fallback
  const list = await listContractTemplates();
  assert(Array.isArray(list) && list.length >= 2, 'listContractTemplates deve retornar pelo menos os templates padrão');
  console.log(`✅ listContractTemplates retornou ${list.length} templates com fallback.`);

  const listAdv = await listContractTemplates({ ramoId: 'rc-advogados' });
  assert.strictEqual(listAdv.length, 1);
  assert.strictEqual(listAdv[0].slug, 'rc_advogados_adesao');
  console.log('✅ Filtro por ramo_id funcionando no fallback.');

  console.log('🎉 Todos os testes de Contract Templates passaram com sucesso!');
}

testContractTemplates().catch((err) => {
  console.error('❌ Falha nos testes de contract templates:', err);
  process.exit(1);
});
