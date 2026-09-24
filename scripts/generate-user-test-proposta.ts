import fs from 'fs/promises';
import path from 'path';
import { renderContratoPdf } from '../src/lib/pdf-contract-generator';

async function main() {
  console.log('=== GERANDO PROPOSTA DE TESTE CONFORME SOLICITAÇÃO DO USUÁRIO ===\n');

  // Dados da Corretora e Vendedor
  // Como a corretora não tem logo cadastrado, logoBuffer = null aciona o fallback de renderizar o nome em texto no topo
  const corretora = {
    id: 'corretora_carlos_augusto_duarte',
    razaoSocial: 'CARLOS AUGUSTO DUARTE CORRETAGEM DE SEGUROS',
    nomeFantasia: 'Carlos Augusto Duarte',
    cnpj: '12.345.678/0001-90',
    susep: '202612345',
    email: 'carlos.duarte@corretora.com.br',
    phone: '(48) 99999-8888',
    enderecoFormatado: 'Rua Principal, 100, Sala 10, Centro, Florianópolis/SC, CEP: 88010-000',
    endereco: 'Rua Principal, 100, Sala 10',
    bairro: 'Centro',
    cep: '88010-000',
    cidade: 'Florianópolis',
    uf: 'SC',
    logoBuffer: null, // Sem logo cadastrado: deve escrever o nome da Corretora em texto!
    logoMimeType: null,
  };

  // Dados do Contratante
  const cotacao = {
    id: '1007800004999',
    client_name: 'Fulano de tal',
    client_cpf_cnpj: '123.456.789-00',
    client_email: 'fulanotal@emil.com',
    client_phone: '(48) 99999-9999',
  };

  // Dados do Plano e Cobertura
  // 100k (R$ 100.000,00) - franquia: R$ 3000,00 - Valor: 1x R$ 310,00
  // Data vigência: hoje (24/09/2026) - Vigência até: 23/09/2027
  // Vendedor: Carlos Duarte
  const valorTotal = 310.00;
  const qtdParcelas = 1;
  const valorParcela = 310.00;
  const valorTotalComJuros = 310.00;

  // Cálculo de IOF e Prêmio Líquido:
  // IOF de 7,38%: 310 / 1.0738 = 288.69, IOF = 21.31
  const premioLiquido = 288.69;
  const iof = 21.31;

  const clientData = {
    profissao: 'Advogado',
    atividade: 'ADVOGADO',
    tipoDePlano: 'Plano 100k',
    cobertura: '100.000,00',
    lmi: '100.000,00',
    franquia: '3.000,00',
    dataInicio: '2026-09-24', // Hoje
    dataFim: '2027-09-23',    // 23/09/2027
    vigenciaAte: '23/09/2027',
    retroatividade: '24/09/2026',
    formaPagamento: 'Boleto bancário',
    parcela: 1,
    premioLiquido,
    iof,
    endereco: 'Rua Alguma, 1234',
    bairro: 'Lugar Nenhum',
    cidade: 'Sem City',
    uf: 'HY',
    cep: '00000-000',
    vendedorNome: 'Carlos Duarte',
  };

  console.log('1. Renderizando PDF oficial com 2 páginas (Modelo KEV Seguros + DuoLife)...');
  const result = await renderContratoPdf({
    cotacao,
    clientData,
    corretora,
    valorTotal,
    qtdParcelas,
    valorParcela,
    valorTotalComJuros,
  });

  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(result.buffer);
  const pageCount = doc.getPageCount();

  console.log(`  [OK] Proposta gerada com sucesso! Total de páginas: ${pageCount}`);
  console.log(`  [OK] Nome do arquivo gerado: ${result.docName}`);
  console.log(`  [OK] Tamanho do buffer: ${result.buffer.length} bytes`);

  // Salva no Desktop do usuário
  const desktopPath = path.join('C:', 'Users', 'Windows 10', 'Desktop', 'proposta_teste_fulano_de_tal.pdf');
  await fs.writeFile(desktopPath, result.buffer);
  console.log(`\n2. Arquivo salvo com sucesso no Desktop:\n   -> ${desktopPath}`);

  console.log('\n=== PROPOSTA DE TESTE GERADA COM SUCESSO! ===');
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
