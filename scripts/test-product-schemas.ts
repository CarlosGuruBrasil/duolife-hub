import {
  getAllRegisteredRamos,
  getRamoConfig,
  buildRamoZodSchema,
  RAMOS_REGISTRY,
} from '../src/lib/product-schemas';

console.log('--- 1. Testando registro de ramos ---');
const ramos = getAllRegisteredRamos();
console.log('Total de ramos registrados:', ramos.length);
if (ramos.length !== 6) {
  throw new Error(`Esperado 6 ramos, obtido ${ramos.length}`);
}

console.log('--- 2. Testando getRamoConfig e fallbacks ---');
const tests = [
  { input: null, expected: 'rc-advogados', desc: 'null fallback' },
  { input: undefined, expected: 'rc-advogados', desc: 'undefined fallback' },
  { input: '', expected: 'rc-advogados', desc: 'empty string fallback' },
  { input: 'rc_professional_v1', expected: 'rc-advogados', desc: 'rc_professional_v1 legacy' },
  { input: 'rc_advogados_v1', expected: 'rc-advogados', desc: 'rc_advogados_v1' },
  { input: 'rc-medicos', expected: 'rc-medicos', desc: 'rc-medicos id' },
  { input: 'rc_medicos_v1', expected: 'rc-medicos', desc: 'rc_medicos_v1 flow' },
  { input: { flow_key: 'rc_odonto_v1' }, expected: 'rc-odonto', desc: 'flow_key rc_odonto_v1' },
  { input: { flowKey: 'rc_engenharia_v1' }, expected: 'rc-engenheiros', desc: 'flowKey rc_engenharia_v1' },
  { input: { code: 'RC-CONT-001' }, expected: 'rc-contadores', desc: 'code RC-CONT-001' },
  { input: { flowKey: 'do_executivos_v1' }, expected: 'do-executivos', desc: 'flowKey do_executivos_v1' },
  { input: { flowKey: 'produto_inexistente_v1' }, expected: null, desc: 'unregistered flowKey returns null' },
  { input: 'ramo_aleatorio_desconhecido', expected: null, desc: 'unregistered string returns null' },
];

for (const t of tests) {
  const res = getRamoConfig(t.input as any);
  const actual = res ? res.ramoId : null;
  if (actual !== t.expected) {
    throw new Error(`Falha no teste ${t.desc}: esperado ${t.expected}, obtido ${actual}`);
  }
  console.log(`✓ ${t.desc} -> ${actual}`);
}

console.log('--- 3. Testando validação Zod para RC Advogados ---');
const advSchema = buildRamoZodSchema(RAMOS_REGISTRY['rc-advogados']);
const validAdv = {
  tipoDePlano: '200k',
  qtdParcelas: 2,
  nome: 'Doutor Advogado Silva',
  cpfCnpj: '123.456.789-00',
  email: 'adv@example.com',
  celular: '11988887777',
  oab: '123456/SP',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
  faturamentoAntes: 'R$ 200.000,00',
  faturamentoDepois: 'R$ 300.000,00',
  especialidades: ['civil', 'tributaria'],
  ppeCargos: 'Não',
  ppeRepresenta: 'Não',
  isRenovacao: 'Não',
  propostaRecusada: 'Não',
  reclamacaoProfissional: 'Não',
  investigacaoAutoridade: 'Não',
  fatoTerceiros: 'Não',
  pagouReclamacao: 'Não',
};

const resAdv = advSchema.safeParse(validAdv);
if (!resAdv.success) {
  throw new Error(`RC Advogados válido falhou na validação: ${JSON.stringify(resAdv.error.issues)}`);
}
console.log('✓ RC Advogados válido passou com sucesso');

const resAdvInvalido = advSchema.safeParse({ ...validAdv, oab: '' });
if (resAdvInvalido.success) {
  throw new Error('RC Advogados sem OAB deveria ter falhado');
}
console.log('✓ RC Advogados sem OAB foi rejeitado corretamente');

console.log('--- 4. Testando validação Zod para Seguro D&O ---');
const doSchema = buildRamoZodSchema(RAMOS_REGISTRY['do-executivos']);
const validDo = {
  tipoDePlano: '1M',
  nome: 'Diretor Executivo',
  cpfCnpj: '123.456.789-00',
  email: 'diretor@empresa.com',
  celular: '11988887777',
  razaoSocialTomadora: 'Empresa SA',
  cnpjTomadora: '12.345.678/0001-90',
  ativoTotal: 'R$ 15.000.000,00',
  faturamentoAnual: 'R$ 25.000.000,00',
  cep: '01310-100',
  logradouro: 'Avenida Faria Lima',
  numero: '2000',
  bairro: 'Itaim Bibi',
  cidade: 'São Paulo',
  uf: 'SP',
  faturamentoAntes: 'R$ 20.000.000,00',
  faturamentoDepois: 'R$ 25.000.000,00',
  especialidades: ['tecnologiaSoftware'],
  ppeCargos: 'Não',
  ppeRepresenta: 'Não',
  isRenovacao: 'Não',
  propostaRecusada: 'Não',
  investigacaoOrgaosReguladores: 'Não',
  autuacoesFiscaisGraves: 'Não',
  disputasSocietarias: 'Não',
  reclamacoesTrabalhistasDiretoria: 'Não',
  circunstanciasConhecidasDo: 'Não',
};

const resDo = doSchema.safeParse(validDo);
if (!resDo.success) {
  throw new Error(`D&O válido falhou na validação: ${JSON.stringify(resDo.error.issues)}`);
}
console.log('✓ D&O válido passou com sucesso');

const resDoInvalido = doSchema.safeParse({ ...validDo, cnpjTomadora: '123' });
if (resDoInvalido.success) {
  throw new Error('D&O com CNPJ tomadora inválido deveria ter falhado');
}
console.log('✓ D&O com CNPJ tomadora inválido foi rejeitado corretamente');

console.log('==============================================');
console.log('TODAS AS ASSERÇÕES PASSARAM COM 100% DE SUCESSO');
console.log('==============================================');
