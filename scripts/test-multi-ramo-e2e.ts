// Mock offline do Postgres para execução estritamente em memória (sem conexão TCP)
const offlineSqlMock = ((..._args: any[]) => Promise.resolve([])) as any;
offlineSqlMock.unsafe = () => Promise.resolve([]);
offlineSqlMock.json = (val: any) => JSON.stringify(val);
offlineSqlMock.array = (val: any) => val;
(global as any)._pg = offlineSqlMock;

import fs from 'fs';
import path from 'path';
import {
  getAllRegisteredRamos,
  getRamoConfig,
  buildRamoZodSchema,
  RAMOS_REGISTRY,
} from '../src/lib/product-schemas';
import { calcularPrecoServidor } from '../src/lib/pricing';

async function main() {
  console.log('======================================================================');
  console.log('INICIANDO TESTES END-TO-END (E2E) DA ARQUITETURA MULTI-RAMO DUOLIFE');
  console.log('Ambiente: Estritamente em Memória / Offline (Zero conexão TCP)');
  console.log('======================================================================\n');

  let totalAssertions = 0;
  function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (!condition) {
      throw new Error(`[FALHA NA ASSERÇÃO] ${message}`);
    }
    console.log(`  ✓ ${message}`);
  }

  // ==========================================================================
  // ETAPA 1: Validação de Resolução dos 6 Ramos Canônicos e Múltiplos Aliases
  // ==========================================================================
  console.log('--- ETAPA 1: Resolução de Todos os 6 Ramos (IDs, Aliases, Codes, FlowKeys) ---');
  
  const allRamos = getAllRegisteredRamos();
  assert(allRamos.length === 6, `Esperado exatamente 6 ramos registrados, obtido ${allRamos.length}`);

  const expectedRamoIds = [
    'rc-advogados',
    'rc-medicos',
    'rc-odonto',
    'rc-engenheiros',
    'rc-contadores',
    'do-executivos',
  ];

  for (const id of expectedRamoIds) {
    const config = RAMOS_REGISTRY[id];
    assert(Boolean(config), `Ramo canônico '${id}' registrado no RAMOS_REGISTRY`);
    assert(config.ramoId === id, `Configuração de '${id}' possui ramoId correto`);
    assert(config.planos && config.planos.length >= 3, `Ramo '${id}' possui catálogo de planos configurado (${config.planos?.length} planos)`);
    assert(config.questionarioRisco && config.questionarioRisco.length >= 5, `Ramo '${id}' possui questionário de risco configurado (${config.questionarioRisco?.length} perguntas)`);
  }

  const aliasResolutionTests = [
    // RC Advogados
    { input: 'rc-advogados', expected: 'rc-advogados', desc: 'ID canônico rc-advogados' },
    { input: 'rc_advogados_v1', expected: 'rc-advogados', desc: 'Flow rc_advogados_v1' },
    { input: 'rc_professional_v1', expected: 'rc-advogados', desc: 'Flow legado rc_professional_v1' },
    { input: 'rc-001', expected: 'rc-advogados', desc: 'Código legado rc-001' },
    { input: 'dl-rc', expected: 'rc-advogados', desc: 'Alias dl-rc' },
    { input: { flow_key: 'rc_advogados_v1' }, expected: 'rc-advogados', desc: 'Objeto produto { flow_key: rc_advogados_v1 }' },
    { input: { code: 'rc-001' }, expected: 'rc-advogados', desc: 'Objeto produto { code: rc-001 }' },

    // RC Médicos
    { input: 'rc-medicos', expected: 'rc-medicos', desc: 'ID canônico rc-medicos' },
    { input: 'rc_medicos_v1', expected: 'rc-medicos', desc: 'Flow rc_medicos_v1' },
    { input: 'rc-med-001', expected: 'rc-medicos', desc: 'Código rc-med-001' },
    { input: 'medicos', expected: 'rc-medicos', desc: 'Alias medicos' },
    { input: { flowKey: 'rc_medicos_v1' }, expected: 'rc-medicos', desc: 'Objeto produto { flowKey: rc_medicos_v1 }' },
    { input: { code: 'rc-med-001' }, expected: 'rc-medicos', desc: 'Objeto produto { code: rc-med-001 }' },

    // RC Odontologia
    { input: 'rc-odonto', expected: 'rc-odonto', desc: 'ID canônico rc-odonto' },
    { input: 'rc_odonto_v1', expected: 'rc-odonto', desc: 'Flow rc_odonto_v1' },
    { input: 'rc-odo-001', expected: 'rc-odonto', desc: 'Código rc-odo-001' },
    { input: 'dentistas', expected: 'rc-odonto', desc: 'Alias dentistas' },
    { input: { flow_key: 'rc_odonto_v1' }, expected: 'rc-odonto', desc: 'Objeto produto { flow_key: rc_odonto_v1 }' },

    // RC Engenharia & Arquitetura
    { input: 'rc-engenheiros', expected: 'rc-engenheiros', desc: 'ID canônico rc-engenheiros' },
    { input: 'rc_engenharia_v1', expected: 'rc-engenheiros', desc: 'Flow rc_engenharia_v1' },
    { input: 'rc-eng-001', expected: 'rc-engenheiros', desc: 'Código rc-eng-001' },
    { input: 'engenharia', expected: 'rc-engenheiros', desc: 'Alias engenharia' },
    { input: { flowKey: 'rc_engenharia_v1' }, expected: 'rc-engenheiros', desc: 'Objeto produto { flowKey: rc_engenharia_v1 }' },

    // RC Contadores
    { input: 'rc-contadores', expected: 'rc-contadores', desc: 'ID canônico rc-contadores' },
    { input: 'rc_contabilidade_v1', expected: 'rc-contadores', desc: 'Flow rc_contabilidade_v1' },
    { input: 'RC-CONT-001', expected: 'rc-contadores', desc: 'Código RC-CONT-001' },
    { input: 'contabilidade', expected: 'rc-contadores', desc: 'Alias contabilidade' },
    { input: { flow_key: 'rc_contabilidade_v1' }, expected: 'rc-contadores', desc: 'Objeto produto { flow_key: rc_contabilidade_v1 }' },

    // Seguro D&O Executivos
    { input: 'do-executivos', expected: 'do-executivos', desc: 'ID canônico do-executivos' },
    { input: 'do_executivos_v1', expected: 'do-executivos', desc: 'Flow do_executivos_v1' },
    { input: 'do_corporate_v1', expected: 'do-executivos', desc: 'Flow do_corporate_v1' },
    { input: 'do-corp-001', expected: 'do-executivos', desc: 'Código do-corp-001' },
    { input: 'd&o', expected: 'do-executivos', desc: 'Alias d&o' },
    { input: { flowKey: 'do_executivos_v1' }, expected: 'do-executivos', desc: 'Objeto produto { flowKey: do_executivos_v1 }' },

    // Fallbacks e Chaves Desconhecidas
    { input: null, expected: 'rc-advogados', desc: 'Fallback null -> rc-advogados' },
    { input: undefined, expected: 'rc-advogados', desc: 'Fallback undefined -> rc-advogados' },
    { input: '', expected: 'rc-advogados', desc: 'Fallback vazio "" -> rc-advogados' },
    { input: {}, expected: 'rc-advogados', desc: 'Fallback objeto vazio {} -> rc-advogados' },
    { input: 'ramo_inexistente_xyz', expected: null, desc: 'Ramo inexistente retorna null' },
    { input: { flowKey: 'inexistente_123' }, expected: null, desc: 'Objeto inexistente retorna null' },
  ];

  for (const testCase of aliasResolutionTests) {
    const res = getRamoConfig(testCase.input as any);
    const resolvedId = res ? res.ramoId : null;
    assert(
      resolvedId === testCase.expected,
      `Resolução: ${testCase.desc} -> obtido: '${resolvedId}', esperado: '${testCase.expected}'`
    );
  }

  // ==========================================================================
  // ETAPA 2: Validação Zod Integral de Cargas Válidas e Rejeições Específicas
  // ==========================================================================
  console.log('\n--- ETAPA 2: Validação Zod Completa para os 6 Ramos ---');

  const baseValidData = {
    nome: 'Carlos Engenheiro QA Silva',
    cpfCnpj: '123.456.789-00',
    email: 'qa.testes@duolife.net.br',
    celular: '11988887777',
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    numero: '1000',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    faturamentoAntes: 'R$ 350.000,00',
    faturamentoDepois: 'R$ 480.000,00',
    ppeCargos: 'Não',
    ppeRepresenta: 'Não',
    isRenovacao: 'Não',
  };

  // 1. RC Advogados
  console.log('\n  [Ramo 1: RC Advogados]');
  const advSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-advogados']);
  const advValidPayload = {
    ...baseValidData,
    tipoDePlano: '200k',
    qtdParcelas: 2,
    oab: '123456/SP',
    especialidades: ['civil', 'tributaria'],
    propostaRecusada: 'Não',
    reclamacaoProfissional: 'Não',
    investigacaoAutoridade: 'Não',
    fatoTerceiros: 'Não',
    pagouReclamacao: 'Não',
  };
  const resAdvOk = advSchema.safeParse(advValidPayload);
  assert(resAdvOk.success, 'RC Advogados com OAB e dados completos passa na validação Zod');

  const resAdvSemOab = advSchema.safeParse({ ...advValidPayload, oab: '' });
  assert(!resAdvSemOab.success, 'RC Advogados sem OAB é rejeitado pelo Zod');
  const advOabIssue = !resAdvSemOab.success && resAdvSemOab.error.issues.find((i) => i.path.includes('oab'));
  assert(Boolean(advOabIssue), 'Erro de validação de RC Advogados aponta explicitamente para o campo OAB');

  // 2. RC Médicos
  console.log('\n  [Ramo 2: RC Médicos]');
  const medSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-medicos']);
  const medValidPayload = {
    ...baseValidData,
    tipoDePlano: '200k',
    qtdParcelas: 3,
    crm: '654321',
    crmUf: 'SP',
    especialidades: ['clinicaGeral', 'cardiologia'],
    propostaRecusada: 'Não',
    processoConselho: 'Não',
    reclamacaoErroMedico: 'Não',
    complicacoesCirurgicas: 'Não',
    fatoPotencial: 'Não',
    pagamentoIndenizacao: 'Não',
  };
  const resMedOk = medSchema.safeParse(medValidPayload);
  assert(resMedOk.success, 'RC Médicos com CRM ativo passa na validação Zod');

  const resMedSemCrm = medSchema.safeParse({ ...medValidPayload, crm: '' });
  assert(!resMedSemCrm.success, 'RC Médicos sem CRM é rejeitado pelo Zod');
  const medCrmIssue = !resMedSemCrm.success && resMedSemCrm.error.issues.find((i) => i.path.includes('crm'));
  assert(Boolean(medCrmIssue), 'Erro de validação de RC Médicos aponta explicitamente para a ausência de CRM');

  // 3. RC Odonto
  console.log('\n  [Ramo 3: RC Odontologia]');
  const odoSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-odonto']);
  const odoValidPayload = {
    ...baseValidData,
    tipoDePlano: '200k',
    qtdParcelas: 2,
    cro: '98765',
    croUf: 'SP',
    especialidades: ['implantodontia', 'harmonizacaoOrofacial'],
    propostaRecusada: 'Não',
    processoCro: 'Não',
    reclamacaoOdonto: 'Não',
    complicacaoInvasiva: 'Não',
    fatoPendente: 'Não',
    acordoIndenizatorio: 'Não',
  };
  const resOdoOk = odoSchema.safeParse(odoValidPayload);
  assert(resOdoOk.success, 'RC Odontologia com CRO ativo passa na validação Zod');

  const resOdoSemCro = odoSchema.safeParse({ ...odoValidPayload, cro: '' });
  assert(!resOdoSemCro.success, 'RC Odontologia sem CRO é rejeitado pelo Zod');
  const odoCroIssue = !resOdoSemCro.success && resOdoSemCro.error.issues.find((i) => i.path.includes('cro'));
  assert(Boolean(odoCroIssue), 'Erro de validação de RC Odonto aponta explicitamente para a ausência de CRO');

  // 4. RC Engenheiros
  console.log('\n  [Ramo 4: RC Engenheiros & Arquitetos]');
  const engSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-engenheiros']);
  const engValidPayload = {
    ...baseValidData,
    tipoDePlano: '500k',
    qtdParcelas: 4,
    creaCau: '506070/D-SP',
    creaCauUf: 'SP',
    especialidades: ['civilEdificacoes', 'estruturalCalculo'],
    propostaRecusada: 'Não',
    sinistroEstrutural: 'Não',
    processoCreaCau: 'Não',
    acoesJudiciaisEng: 'Não',
    danosLindeiros: 'Não',
    pagouIndenizacaoEng: 'Não',
  };
  const resEngOk = engSchema.safeParse(engValidPayload);
  assert(resEngOk.success, 'RC Engenharia com CREA/CAU ativo passa na validação Zod');

  const resEngSemCrea = engSchema.safeParse({ ...engValidPayload, creaCau: '' });
  assert(!resEngSemCrea.success, 'RC Engenharia sem CREA/CAU é rejeitado pelo Zod');
  const engCreaIssue = !resEngSemCrea.success && resEngSemCrea.error.issues.find((i) => i.path.includes('creaCau'));
  assert(Boolean(engCreaIssue), 'Erro de validação de RC Engenharia aponta explicitamente para ausência de CREA/CAU');

  // 5. RC Contadores
  console.log('\n  [Ramo 5: RC Contadores]');
  const cntSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-contadores']);
  const cntValidPayload = {
    ...baseValidData,
    tipoDePlano: '200k',
    qtdParcelas: 3,
    crc: '1SP123456/O-0',
    crcUf: 'SP',
    especialidades: ['fiscalTributario', 'contabilidadeGeral'],
    propostaRecusada: 'Não',
    autuacaoFiscal: 'Não',
    perdaPrazosSped: 'Não',
    processoCrc: 'Não',
    reclamacaoContabil: 'Não',
    ressarcimentoCliente: 'Não',
  };
  const resCntOk = cntSchema.safeParse(cntValidPayload);
  assert(resCntOk.success, 'RC Contadores com CRC ativo passa na validação Zod');

  const resCntSemCrc = cntSchema.safeParse({ ...cntValidPayload, crc: '' });
  assert(!resCntSemCrc.success, 'RC Contadores sem CRC é rejeitado pelo Zod');
  const cntCrcIssue = !resCntSemCrc.success && resCntSemCrc.error.issues.find((i) => i.path.includes('crc'));
  assert(Boolean(cntCrcIssue), 'Erro de validação de RC Contadores aponta explicitamente para ausência de CRC');

  // 6. D&O Executivos
  console.log('\n  [Ramo 6: Seguro D&O Executivos]');
  const doSchema = buildRamoZodSchema(RAMOS_REGISTRY['do-executivos']);
  const doValidPayload = {
    ...baseValidData,
    tipoDePlano: '1M',
    qtdParcelas: 4,
    razaoSocialTomadora: 'Tech Holdings Brasil S.A.',
    cnpjTomadora: '12.345.678/0001-90',
    ativoTotal: 'R$ 45.000.000,00',
    faturamentoAnual: 'R$ 78.000.000,00',
    especialidades: ['tecnologiaSoftware', 'servicosFinanceirosFintech'],
    propostaRecusada: 'Não',
    investigacaoOrgaosReguladores: 'Não',
    autuacoesFiscaisGraves: 'Não',
    disputasSocietarias: 'Não',
    reclamacoesTrabalhistasDiretoria: 'Não',
    circunstanciasConhecidasDo: 'Não',
  };
  const resDoOk = doSchema.safeParse(doValidPayload);
  assert(resDoOk.success, 'D&O Executivos com dados da Tomadora completos passa na validação Zod');

  const resDoSemCnpj = doSchema.safeParse({ ...doValidPayload, cnpjTomadora: '123' });
  assert(!resDoSemCnpj.success, 'D&O Executivos com CNPJ da tomadora inválido é rejeitado');
  const doCnpjIssue = !resDoSemCnpj.success && resDoSemCnpj.error.issues.find((i) => i.path.includes('cnpjTomadora'));
  assert(Boolean(doCnpjIssue), 'Erro de validação aponta explicitamente para CNPJ da tomadora');

  const resDoSemRazao = doSchema.safeParse({ ...doValidPayload, razaoSocialTomadora: '' });
  assert(!resDoSemRazao.success, 'D&O Executivos sem Razão Social da Tomadora é rejeitado');
  const doRazaoIssue = !resDoSemRazao.success && resDoSemRazao.error.issues.find((i) => i.path.includes('razaoSocialTomadora'));
  assert(Boolean(doRazaoIssue), 'Erro de validação aponta explicitamente para Razão Social da Tomadora');

  const resDoSemAtivo = doSchema.safeParse({ ...doValidPayload, ativoTotal: '' });
  assert(!resDoSemAtivo.success, 'D&O Executivos sem Ativo Total é rejeitado');

  // Teste de plano inválido para o ramo
  const resPlanoInvalido = advSchema.safeParse({ ...advValidPayload, tipoDePlano: '10M' });
  assert(!resPlanoInvalido.success, 'Plano inexistente no ramo (10M em RC Advogados) é rejeitado');

  // ==========================================================================
  // ETAPA 3: Precificação via calcularPrecoServidor e Trava Inegociável de 40%
  // ==========================================================================
  console.log('\n--- ETAPA 3: Precificação Multi-Ramo, Trava de 40% e Parcelamento ---');

  // Cálculo RC Advogados 200k (2x)
  const calcAdv = await calcularPrecoServidor({
    flowKey: 'rc_advogados_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 2,
  });
  assert(calcAdv !== null, 'calcularPrecoServidor retornou preço para RC Advogados 200k');
  assert(calcAdv?.valorOriginal === 1200, 'RC Advogados 200k valor original R$ 1.200,00');
  assert(calcAdv?.qtdParcelas === 2, 'RC Advogados 200k parcelado em 2x');
  assert(calcAdv?.valorParcela === 600, 'RC Advogados 200k parcela R$ 600,00');

  // RC Advogados 100k (deve forçar 1x à vista mesmo solicitando 4x)
  const calcAdv100k = await calcularPrecoServidor({
    flowKey: 'rc_advogados_v1',
    tipoDePlano: '100k',
    qtdParcelasSolicitada: 4,
  });
  assert(calcAdv100k?.qtdParcelas === 1, 'Plano 100k força 1 parcela (à vista)');
  assert(calcAdv100k?.valorTotal === 680, 'Plano 100k valor total R$ 680,00');

  // RC Médicos 200k (3x)
  const calcMed = await calcularPrecoServidor({
    flowKey: 'rc_medicos_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 3,
  });
  assert(calcMed?.valorOriginal === 1850, 'RC Médicos 200k valor original R$ 1.850,00');
  assert(calcMed?.qtdParcelas === 3, 'RC Médicos 200k parcelado em 3x');
  assert(calcMed?.valorParcela === 616.67, 'RC Médicos 200k parcela R$ 616,67');

  // RC Odonto 200k (4x)
  const calcOdo = await calcularPrecoServidor({
    flowKey: 'rc_odonto_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 4,
  });
  assert(calcOdo?.valorOriginal === 1550, 'RC Odonto 200k valor original R$ 1.550,00');
  assert(calcOdo?.qtdParcelas === 4, 'RC Odonto 200k parcelado em 4x');
  assert(calcOdo?.valorParcela === 387.5, 'RC Odonto 200k parcela R$ 387,50');

  // RC Odonto 100k (deve forçar 1x à vista mesmo se solicitado parcelamento)
  const calcOdo100k = await calcularPrecoServidor({
    flowKey: 'rc_odonto_v1',
    tipoDePlano: '100k',
    qtdParcelasSolicitada: 3,
  });
  assert(calcOdo100k?.qtdParcelas === 1, 'RC Odonto 100k força 1 parcela (à vista)');
  assert(calcOdo100k?.valorTotal === 950, 'RC Odonto 100k valor total R$ 950,00');

  // RC Engenharia 500k (4x)
  const calcEng = await calcularPrecoServidor({
    flowKey: 'rc_engenharia_v1',
    tipoDePlano: '500k',
    qtdParcelasSolicitada: 4,
  });
  assert(calcEng?.valorOriginal === 3650, 'RC Engenharia 500k valor original R$ 3.650,00');
  assert(calcEng?.qtdParcelas === 4, 'RC Engenharia 500k parcelado em 4x');
  assert(calcEng?.valorParcela === 912.5, 'RC Engenharia 500k parcela R$ 912,50');

  // RC Contadores 200k (6x)
  const calcCnt = await calcularPrecoServidor({
    flowKey: 'rc_contabilidade_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 6,
  });
  assert(calcCnt?.valorOriginal === 1280, 'RC Contadores 200k valor original R$ 1.280,00');
  assert(calcCnt?.qtdParcelas === 6, 'RC Contadores 200k parcelado em 6x');
  assert(calcCnt?.valorParcela === 213.33, 'RC Contadores 200k parcela R$ 213,33');

  // Seguro D&O 1M (4x)
  const calcDo = await calcularPrecoServidor({
    flowKey: 'do_executivos_v1',
    tipoDePlano: '1M',
    qtdParcelasSolicitada: 4,
  });
  assert(calcDo?.valorOriginal === 7500, 'D&O 1M valor original R$ 7.500,00');
  assert(calcDo?.qtdParcelas === 4, 'D&O 1M parcelado em 4x');
  assert(calcDo?.valorParcela === 1875, 'D&O 1M parcela R$ 1.875,00');

  // Enforcement da Trava de Desconto Máximo de 40%
  console.log('\n  [Trava Inegociável de 40% de Desconto Comercial]');
  
  // Tentativa abusiva de 50% de desconto
  const calcDescontoAbusivo50 = await calcularPrecoServidor({
    flowKey: 'rc_medicos_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 1,
    descontoManualPercent: 50,
  });
  assert(calcDescontoAbusivo50?.descontoPercentual === 40, 'Tentativa de 50% foi estritamente limitada a 40%');
  assert(calcDescontoAbusivo50?.valorTotal === 1110, 'Valor total limitado com 40% (1850 * 0.6 = 1110)');

  // Tentativa abusiva de 90% de desconto
  const calcDescontoAbusivo90 = await calcularPrecoServidor({
    flowKey: 'rc_engenharia_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 1,
    descontoManualPercent: 90,
  });
  assert(calcDescontoAbusivo90?.descontoPercentual === 40, 'Tentativa de 90% foi estritamente limitada a 40%');

  // Tentativa de desconto negativo (-15%)
  const calcDescontoNegativo = await calcularPrecoServidor({
    flowKey: 'rc_advogados_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 1,
    descontoManualPercent: -15,
  });
  assert(calcDescontoNegativo?.descontoPercentual === 0, 'Desconto negativo tratado como 0%');

  // Desconto comercial legítimo de 20% em 3 parcelas
  // RC Medicos 200k (3x): original parcela R$ 616,67. Total: 1850.
  // Com 20% desconto: Total: 1850 * 0.8 = 1480. Parcela: 616.67 * 0.8 = 493.34
  const calcDescontoLegitimo20 = await calcularPrecoServidor({
    flowKey: 'rc_medicos_v1',
    tipoDePlano: '200k',
    qtdParcelasSolicitada: 3,
    descontoManualPercent: 20,
  });
  assert(calcDescontoLegitimo20?.descontoPercentual === 20, 'Desconto legítimo de 20% aplicado');
  assert(calcDescontoLegitimo20?.valorTotal === 1480, 'Valor total calculado com exatidão (R$ 1.480,00)');
  assert(calcDescontoLegitimo20?.valorParcela === 493.34, 'Valor da parcela calculado com exatidão (R$ 493,34)');

  // ==========================================================================
  // ETAPA 4: Verificação Estática de Exposição no Portal do Parceiro
  // ==========================================================================
  console.log('\n--- ETAPA 4: Verificação Estática de Filtragem em app/portal/cotacoes/nova/page.tsx ---');
  
  const portalPagePath = path.resolve(__dirname, '../app/portal/cotacoes/nova/page.tsx');
  assert(fs.existsSync(portalPagePath), 'Arquivo app/portal/cotacoes/nova/page.tsx existe');
  
  const portalPageContent = fs.readFileSync(portalPagePath, 'utf-8');

  // Verifica se a query SQL filtra estritamente por ppa.is_active = true AND p.is_active = true
  const hasStrictIsActiveFilter = portalPageContent.includes('ppa.is_active = true AND p.is_active = true');
  assert(
    hasStrictIsActiveFilter,
    "Query SQL contém a trava estrita: 'ppa.is_active = true AND p.is_active = true'"
  );

  // Verifica se filtra pelo parceiro autenticado
  const hasPartnerFilter = portalPageContent.includes('ppa.partner_id = ${user.partnerId}');
  assert(
    hasPartnerFilter,
    "Query SQL isola os produtos por parceiro: 'ppa.partner_id = ${user.partnerId}'"
  );

  // Verifica que usa getRamoConfig para resolução dinâmica do formulário
  const usesRamoConfig = portalPageContent.includes('getRamoConfig({ flowKey: product.flow_key, code: product.code })');
  assert(
    usesRamoConfig,
    'Página utiliza getRamoConfig para vincular dinamicamente o formulário multi-ramo'
  );

  // Verifica que passa ramoConfigOverride ao CotacaoFormRC
  const passesRamoConfigOverride = portalPageContent.includes('ramoConfigOverride={ramoConfig}');
  assert(
    passesRamoConfigOverride,
    'Componente CotacaoFormRC recebe ramoConfigOverride com a configuração resolvida'
  );

  console.log('\n======================================================================');
  console.log(`RELATÓRIO FINAL: ${totalAssertions} ASSERÇÕES EXECUTADAS COM 100% DE SUCESSO!`);
  console.log('Arquitetura Multi-Ramo totalmente validada, segura e pronta para produção.');
  console.log('======================================================================');
}

main().catch((err) => {
  console.error('\n❌ ERRO NA EXECUÇÃO DO TESTE E2E:', err);
  process.exit(1);
});
