import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { renderContratoPdf } from '../src/lib/pdf-contract-generator';

async function main() {
  console.log('=== TESTE DOS 3 MODELOS DE CONTRATO COM PAPEL TIMBRADO CERTIFICADO DUOLIFE ===\n');

  // Carrega logo da Net4Life para teste
  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = await fs.readFile(path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png'));
  } catch (e) {
    console.warn('Logo net4life não encontrado, usando fallback textual');
  }

  const corretora = {
    id: 'corretora_net4life_001',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
    nomeFantasia: 'NET4LIFE',
    cnpj: '34.567.890/0001-12',
    susep: '202058392',
    email: 'contato@net4life.com.br',
    phone: '(48) 99139-4912',
    enderecoFormatado: 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05, Santo Antônio de Lisboa, Florianópolis/SC, CEP: 88050-000',
    endereco: 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05',
    bairro: 'Santo Antônio de Lisboa',
    cep: '88050-000',
    cidade: 'Florianópolis',
    uf: 'SC',
    logoBuffer,
    logoMimeType: 'image/png' as const,
  };

  const proponenteBase = {
    nome: 'Carlos Eduardo Santos de Souza',
    cpf: '123.456.789-00',
    email: 'carlos@advocacia.com.br',
    celular: '(48) 99999-8888',
    oab: '12345/SC',
    dataNascto: '1985-05-15',
    logradouro: 'Avenida Beira Mar Norte',
    numero: '1000',
    complemento: 'Sala 502',
    bairro: 'Agronômica',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88025-000',
    inicioProfissional: '2010-03-01',
  };

  // -------------------------------------------------------------
  // TESTE 1: Contrato 100K Novo (Deve ter exatamente 2 páginas)
  // -------------------------------------------------------------
  console.log('1. Testando Modelo 1: 100k Novo (PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k)...');
  const cotacao100k = {
    id: 'cot_100k_teste_01',
    client_name: proponenteBase.nome,
    client_cpf_cnpj: proponenteBase.cpf,
    client_email: proponenteBase.email,
    client_phone: proponenteBase.celular,
  };

  const clientData100k = {
    ...proponenteBase,
    tipo: '100k',
    tipoDePlano: 'Plano 100 Mil',
    cobertura: '100.000,00',
    franquia: '1.000,00',
    isRenovacao: 'Não',
    parcela: 1,
  };

  const res100k = await renderContratoPdf({
    cotacao: cotacao100k,
    clientData: clientData100k,
    corretora,
    valorTotal: 680.00,
    qtdParcelas: 1,
    valorParcela: 680.00,
    valorTotalComJuros: 680.00,
  });

  const doc100k = await PDFDocument.load(res100k.buffer);
  const pages100k = doc100k.getPageCount();
  console.log(`   -> Tipo Detectado: ${res100k.tipoContrato}`);
  console.log(`   -> Total de Páginas: ${pages100k}`);
  console.log(`   -> Nome do Arquivo: ${res100k.docName}`);
  if (pages100k !== 2) throw new Error(`Esperado 2 páginas para 100k novo, obteve ${pages100k}`);
  console.log('   [OK] Teste 100k Novo Aprovado!\n');

  // Salva no Desktop
  const path100k = path.join('C:', 'Users', 'Windows 10', 'Desktop', 'proposta_modelo_100k_novo.pdf');
  await fs.writeFile(path100k, res100k.buffer);

  // ----------------------------------------------------------------------
  // TESTE 2: Contrato 100K Renovação (Deve ter exatamente 2 páginas com seguro anterior)
  // ----------------------------------------------------------------------
  console.log('2. Testando Modelo 2: 100k Renovação (PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k Renovação)...');
  const cotacao100kRen = {
    id: 'cot_100k_ren_02',
    client_name: proponenteBase.nome,
    client_cpf_cnpj: proponenteBase.cpf,
    client_email: proponenteBase.email,
    client_phone: proponenteBase.celular,
    is_renewal: true,
  };

  const clientData100kRen = {
    ...proponenteBase,
    tipo: '100k',
    tipoDePlano: 'Plano 100 Mil',
    cobertura: '100.000,00',
    franquia: '1.000,00',
    isRenovacao: 'Sim',
    seguradora: 'Kovr Seguradora S.A.',
    limite: 'R$ 100.000,00',
    vigencia: '2025-09-24',
    dataRetroativa: '2025-09-24',
    parcela: 1,
  };

  const res100kRen = await renderContratoPdf({
    cotacao: cotacao100kRen,
    clientData: clientData100kRen,
    corretora,
    valorTotal: 680.00,
    qtdParcelas: 1,
    valorParcela: 680.00,
    valorTotalComJuros: 680.00,
  });

  const doc100kRen = await PDFDocument.load(res100kRen.buffer);
  const pages100kRen = doc100kRen.getPageCount();
  console.log(`   -> Tipo Detectado: ${res100kRen.tipoContrato}`);
  console.log(`   -> Total de Páginas: ${pages100kRen}`);
  console.log(`   -> Nome do Arquivo: ${res100kRen.docName}`);
  if (pages100kRen !== 2) throw new Error(`Esperado 2 páginas para 100k renovação, obteve ${pages100kRen}`);
  console.log('   [OK] Teste 100k Renovação Aprovado!\n');

  // Salva no Desktop
  const path100kRen = path.join('C:', 'Users', 'Windows 10', 'Desktop', 'proposta_modelo_100k_renovacao.pdf');
  await fs.writeFile(path100kRen, res100kRen.buffer);

  // ----------------------------------------------------------------------
  // TESTE 3: Contrato 300K ou Superior (OFICIAL - Deve ter exatamente 4 páginas)
  // ----------------------------------------------------------------------
  console.log('3. Testando Modelo 3: 300k ou Superior (PROPOSTA RC ADVOGADO FACILITIES - SITE RC - OFICIAL)...');
  const cotacaoOficial = {
    id: 'cot_oficial_300k_03',
    client_name: proponenteBase.nome,
    client_cpf_cnpj: proponenteBase.cpf,
    client_email: proponenteBase.email,
    client_phone: proponenteBase.celular,
  };

  const clientDataOficial = {
    ...proponenteBase,
    tipo: '300k',
    tipoDePlano: 'Plano 300 Mil',
    cobertura: '300.000,00',
    franquia: '3.000,00',
    isRenovacao: 'Não',
    parcela: 6,
    escritorioAssociado: 'Souza & Advogados Associados OAB/SC 999',
    titularidade: 'Especialista em Direito Tributário e Mestre em Direito Empresarial',
    faturamentoAntes: 'R$ 450.000,00',
    faturamentoDepois: 'R$ 550.000,00',
    atuacao: ['civil', 'tributaria', 'direitoEmpresarial', 'trabalhista'],
    ppeCargos: 'Não',
    ppeRepresenta: 'Não',
    ppeCargoSelect: 'Nenhum cargo ocupado nos últimos 5 anos',
    seguradora: 'Akad Seguros',
    limite: 'R$ 300.000,00',
    vigencia: '2025-10-01',
    dataRetroativa: '2024-10-01',
    propostaRecusada: 'Não',
    propostaDetalhe: 'Nenhuma recusa anterior',
    reclamacaoProfissional: 'Não',
    reclamacaoDetalhe: 'Nenhuma reclamação ou processo',
    investigacaoAutoridade: 'Não',
    investigacaoDetalhe: 'Nenhum processo disciplinar na OAB',
    fatoTerceiros: 'Não',
    fatoDetalhe: 'Sem conhecimento de fatos geradores',
    pagouReclamacao: 'Não',
    pagouDetalhe: 'Nenhum pagamento realizado',
  };

  const resOficial = await renderContratoPdf({
    cotacao: cotacaoOficial,
    clientData: clientDataOficial,
    corretora,
    valorTotal: 1650.00,
    qtdParcelas: 6,
    valorParcela: 275.00,
    valorTotalComJuros: 1650.00,
  });

  const docOficial = await PDFDocument.load(resOficial.buffer);
  const pagesOficial = docOficial.getPageCount();
  console.log(`   -> Tipo Detectado: ${resOficial.tipoContrato}`);
  console.log(`   -> Total de Páginas: ${pagesOficial}`);
  console.log(`   -> Nome do Arquivo: ${resOficial.docName}`);
  if (pagesOficial !== 4) throw new Error(`Esperado 4 páginas para Oficial, obteve ${pagesOficial}`);
  console.log('   [OK] Teste Oficial 300K+ Aprovado!\n');

  // Salva no Desktop
  const pathOficial = path.join('C:', 'Users', 'Windows 10', 'Desktop', 'proposta_modelo_oficial_300k.pdf');
  await fs.writeFile(pathOficial, resOficial.buffer);

  // ----------------------------------------------------------------------
  // TESTE 4: Testando Planos 500k, 1mi, 1,5mi, 2mi e 3mi (Devem todos ir para OFICIAL)
  // ----------------------------------------------------------------------
  console.log('4. Testando Enquadramento dos demais planos (500k, 1mi, 1,5mi, 2mi, 3mi)...');
  const planosOficiais = ['500k', '1mi', '1,5mi', '2mi', '3mi'];
  for (const pl of planosOficiais) {
    const res = await renderContratoPdf({
      cotacao: { id: `test_${pl}`, client_name: 'Advogado Teste', client_cpf_cnpj: '000.000.000-00' },
      clientData: { tipo: pl, cobertura: pl },
      corretora,
      valorTotal: 5000,
      qtdParcelas: 1,
      valorParcela: 5000,
      valorTotalComJuros: 5000,
    });
    const doc = await PDFDocument.load(res.buffer);
    if (doc.getPageCount() !== 4 || res.tipoContrato !== 'oficial') {
      throw new Error(`Plano ${pl} não foi para o modelo oficial de 4 páginas!`);
    }
    console.log(`   -> Plano ${pl}: 4 páginas [OFICIAL OK]`);
  }

  console.log('\n======================================================');
  console.log('TODOS OS 3 MODELOS DE CONTRATO TESTADOS COM 100% DE SUCESSO!');
  console.log('Arquivos salvos no Desktop para conferência visual:');
  console.log(`1. ${path100k}`);
  console.log(`2. ${path100kRen}`);
  console.log(`3. ${pathOficial}`);
  console.log('======================================================');
}

main().catch((err) => {
  console.error('ERRO NO TESTE:', err);
  process.exit(1);
});
