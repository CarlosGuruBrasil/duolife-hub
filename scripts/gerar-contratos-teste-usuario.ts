import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { renderContratoPdf } from '../src/lib/pdf-contract-generator';

async function main() {
  console.log('=== GERAÇÃO DOS 3 CONTRATOS TESTE COM DADOS FICTÍCIOS ===\n');

  // Carrega logotipo da Net4Life
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

  const desktopDir = path.join('C:', 'Users', 'Windows 10', 'Desktop');

  // -------------------------------------------------------------
  // 1. CONTRATO 100K NOVO (2 Páginas)
  // -------------------------------------------------------------
  console.log('1. Gerando Contrato 100K Novo (Dr. Marcelo Augusto Guimarães)...');
  const cotacao100k = {
    id: '1007800004101',
    client_name: 'Dr. Marcelo Augusto Guimarães',
    client_cpf_cnpj: '312.874.965-02',
    client_email: 'marcelo.guimaraes@advocacia.com.br',
    client_phone: '(48) 99876-5432',
  };

  const clientData100k = {
    nome: cotacao100k.client_name,
    cpf: cotacao100k.client_cpf_cnpj,
    email: cotacao100k.client_email,
    celular: cotacao100k.client_phone,
    oab: '48.912/SC',
    dataNascto: '1982-08-14',
    logradouro: 'Av. Trompowsky',
    numero: '291',
    complemento: 'Apto 801',
    bairro: 'Centro',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88015-300',
    dataAtividade: '2008-03-01',
    tipo: '100k',
    tipoDePlano: 'Plano 100 Mil',
    cobertura: '100.000,00',
    franquia: '1.000,00',
    isRenovacao: 'Não',
    parcela: 1,
    formaPagamento: 'Boleto bancário à vista',
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
  const path100k = path.join(desktopDir, 'Contrato_Teste_100k_Novo.pdf');
  await fs.writeFile(path100k, res100k.buffer);
  console.log(`   -> Salvo em: ${path100k}`);
  console.log(`   -> Páginas: ${doc100k.getPageCount()} | Tamanho: ${res100k.buffer.length} bytes\n`);

  // -------------------------------------------------------------
  // 2. CONTRATO 100K RENOVAÇÃO (2 Páginas)
  // -------------------------------------------------------------
  console.log('2. Gerando Contrato 100K Renovação (Dra. Fernanda Vasconcelos Ribeiro)...');
  const cotacao100kRen = {
    id: '1007800004102',
    client_name: 'Dra. Fernanda Vasconcelos Ribeiro',
    client_cpf_cnpj: '582.419.730-88',
    client_email: 'fernanda.ribeiro@vr-advogados.com.br',
    client_phone: '(48) 99123-4567',
    is_renewal: true,
  };

  const clientData100kRen = {
    nome: cotacao100kRen.client_name,
    cpf: cotacao100kRen.client_cpf_cnpj,
    email: cotacao100kRen.client_email,
    celular: cotacao100kRen.client_phone,
    oab: '35.120/SC',
    dataNascto: '1987-11-22',
    logradouro: 'Rua Felipe Schmidt',
    numero: '515',
    complemento: 'Sala 602',
    bairro: 'Centro',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88010-001',
    dataAtividade: '2012-02-15',
    tipo: '100k',
    tipoDePlano: 'Plano 100 Mil',
    cobertura: '100.000,00',
    franquia: '1.000,00',
    isRenovacao: 'Sim',
    parcela: 1,
    formaPagamento: 'Boleto bancário à vista',
    // Dados de Renovação
    seguradora: 'Kovr Seguradora S.A.',
    limite: 'R$ 100.000,00',
    vigencia: '2025-09-24',
    dataRetroativa: '2024-09-24',
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
  const path100kRen = path.join(desktopDir, 'Contrato_Teste_100k_Renovacao.pdf');
  await fs.writeFile(path100kRen, res100kRen.buffer);
  console.log(`   -> Salvo em: ${path100kRen}`);
  console.log(`   -> Páginas: ${doc100kRen.getPageCount()} | Tamanho: ${res100kRen.buffer.length} bytes\n`);

  // -------------------------------------------------------------
  // 3. CONTRATO 300K OFICIAL (4 Páginas)
  // -------------------------------------------------------------
  console.log('3. Gerando Contrato 300K Oficial (Dr. Roberto Silveira Albuquerque)...');
  const cotacao300k = {
    id: '1007800004103',
    client_name: 'Dr. Roberto Silveira Albuquerque',
    client_cpf_cnpj: '741.963.852-19',
    client_email: 'roberto@albuquerquelaw.com.br',
    client_phone: '(48) 98888-7777',
  };

  const clientData300k = {
    nome: cotacao300k.client_name,
    cpf: cotacao300k.client_cpf_cnpj,
    email: cotacao300k.client_email,
    celular: cotacao300k.client_phone,
    oab: '28.450/SC',
    dataNascto: '1976-05-10',
    logradouro: 'Rodovia SC-401',
    numero: '4150',
    complemento: 'Edifício Trend, Sala 304',
    bairro: 'Saco Grande',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88032-005',
    dataAtividade: '2001-01-05',
    tipo: '300k',
    tipoDePlano: 'Plano 300 Mil',
    cobertura: '300.000,00',
    franquia: '3.000,00',
    isRenovacao: 'Não',
    parcela: 6,
    formaPagamento: 'Cartão de Crédito / Parcelado',
    // Informações Profissionais
    escritorioAssociado: 'Albuquerque & Silveira Sociedade de Advogados (OAB/SC 1.450)',
    titularidade: 'Mestre em Direito Tributário (USP) e Especialista em Contratos Empresariais',
    faturamentoAntes: 'R$ 680.000,00',
    faturamentoDepois: 'R$ 850.000,00',
    // Áreas de Atuação
    atuacao: ['civil', 'tributaria', 'direitoEmpresarial', 'fusoesAquisicoes', 'trabalhista'],
    // PPE
    ppeCargos: 'Não',
    ppeRepresenta: 'Não',
    ppeCargoSelect: 'Nenhum cargo ocupado nos últimos 5 anos',
    // Seguro Anterior
    seguradora: 'Akad Seguros S.A.',
    limite: 'R$ 300.000,00',
    vigencia: '2025-10-15',
    dataRetroativa: '2023-10-15',
    propostaRecusada: 'Não',
    propostaDetalhe: 'Não se aplica',
    // Histórico de Reclamações
    reclamacaoProfissional: 'Não',
    reclamacaoDetalhe: 'Não se aplica',
    investigacaoAutoridade: 'Não',
    investigacaoDetalhe: 'Não se aplica',
    fatoTerceiros: 'Não',
    fatoDetalhe: 'Não se aplica',
    pagouReclamacao: 'Não',
    pagouDetalhe: 'Não se aplica',
  };

  const res300k = await renderContratoPdf({
    cotacao: cotacao300k,
    clientData: clientData300k,
    corretora,
    valorTotal: 1650.00,
    qtdParcelas: 6,
    valorParcela: 275.00,
    valorTotalComJuros: 1650.00,
  });

  const doc300k = await PDFDocument.load(res300k.buffer);
  const path300k = path.join(desktopDir, 'Contrato_Teste_300k_Oficial.pdf');
  await fs.writeFile(path300k, res300k.buffer);
  console.log(`   -> Salvo em: ${path300k}`);
  console.log(`   -> Páginas: ${doc300k.getPageCount()} | Tamanho: ${res300k.buffer.length} bytes\n`);

  console.log('===============================================================');
  console.log('OS 3 CONTRATOS TESTE FORAM GERADOS COM SUCESSO NO DESKTOP:');
  console.log(`1. 100K Novo (2 páginas): ${path100k}`);
  console.log(`2. 100K Renovação (2 páginas): ${path100kRen}`);
  console.log(`3. 300K Oficial (4 páginas): ${path300k}`);
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Erro na geração:', err);
  process.exit(1);
});
