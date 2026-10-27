import { isNet4LifeCorretora } from '../src/lib/corretora-resolver';

function testNet4LifeResolution() {
  console.log('--- Testando resolução de Corretora Net4Life vs Outras Corretoras ---');

  const net4lifeMaster = {
    id: 'corretora_net4life_001',
    cnpj: '07.351.909/0001-33',
    nomeFantasia: 'NET4LIFE CORRETORA',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
  };

  const net4lifeDefault = {
    id: 'default',
    cnpj: '34.567.890/0001-12',
    nomeFantasia: 'NET4LIFE',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
  };

  const outraCorretora1 = {
    id: 'corretora_parceira_alpha',
    cnpj: '12.345.678/0001-90',
    nomeFantasia: 'Alpha Corretora de Seguros',
    razaoSocial: 'Alpha Seguros Ltda',
  };

  const outraCorretora2 = {
    id: 'corretora_beta_456',
    cnpj: '98.765.432/0001-10',
    nomeFantasia: 'Beta Brokers',
    razaoSocial: 'Beta Corretagem S/A',
  };

  const isNet1 = isNet4LifeCorretora(net4lifeMaster);
  const isNet2 = isNet4LifeCorretora(net4lifeDefault);
  const isOutra1 = isNet4LifeCorretora(outraCorretora1);
  const isOutra2 = isNet4LifeCorretora(outraCorretora2);

  console.log('Net4life Master:', isNet1 ? 'PASS (é Net4Life)' : 'FAIL');
  console.log('Net4life Default:', isNet2 ? 'PASS (é Net4Life)' : 'FAIL');
  console.log('Outra Corretora 1:', !isOutra1 ? 'PASS (não é Net4Life)' : 'FAIL');
  console.log('Outra Corretora 2:', !isOutra2 ? 'PASS (não é Net4Life)' : 'FAIL');

  if (!isNet1 || !isNet2 || isOutra1 || isOutra2) {
    throw new Error('Falha na validação de isNet4LifeCorretora');
  }

  // Simulação da regra de decisão do contrato
  function resolverModoContrato(corretora: any, docGenerationMode: 'template' | 'dynamic_pdf', isMedico = false) {
    const isNet = isNet4LifeCorretora(corretora);
    const isDynamicPdf = !isNet || isMedico || docGenerationMode === 'dynamic_pdf';
    return { isDynamicPdf, modo: isDynamicPdf ? 'dynamic_pdf' : 'template' };
  }

  // Caso 1: Net4life com modo template configurado
  const res1 = resolverModoContrato(net4lifeMaster, 'template');
  console.log('Net4life + Template Mode =>', res1.modo, res1.modo === 'template' ? 'PASS' : 'FAIL');
  if (res1.modo !== 'template') throw new Error('Deveria ser template para Net4life');

  // Caso 2: Net4life com modo dynamic_pdf configurado
  const res2 = resolverModoContrato(net4lifeMaster, 'dynamic_pdf');
  console.log('Net4life + Dynamic PDF Mode =>', res2.modo, res2.modo === 'dynamic_pdf' ? 'PASS' : 'FAIL');
  if (res2.modo !== 'dynamic_pdf') throw new Error('Deveria ser dynamic_pdf para Net4life');

  // Caso 3: Outra corretora com modo template configurado globalmente
  const res3 = resolverModoContrato(outraCorretora1, 'template');
  console.log('Outra Corretora + Template Mode Configurado =>', res3.modo, res3.modo === 'dynamic_pdf' ? 'PASS (Bloqueou template)' : 'FAIL');
  if (res3.modo !== 'dynamic_pdf') throw new Error('Outra corretora DEVE ser forçada a dynamic_pdf');

  // Caso 4: Outra corretora com modo dynamic_pdf configurado
  const res4 = resolverModoContrato(outraCorretora2, 'dynamic_pdf');
  console.log('Outra Corretora + Dynamic PDF Mode =>', res4.modo, res4.modo === 'dynamic_pdf' ? 'PASS' : 'FAIL');
  if (res4.modo !== 'dynamic_pdf') throw new Error('Outra corretora DEVE ser dynamic_pdf');

  console.log('--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

testNet4LifeResolution();
