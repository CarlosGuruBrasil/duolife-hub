import { renderContratoPdf } from '../src/lib/pdf-contract-generator';
import { CorretoraContratoInfo } from '../src/lib/corretora-resolver';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log('--- Iniciando teste do gerador de contratos em PDF ---');

  // Carrega logo da NET4Life local para o teste
  const logoPath = path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png');
  const logoBuffer = await fs.readFile(logoPath);

  const mockCorretora: CorretoraContratoInfo = {
    id: 'corretora_net4life_001',
    razaoSocial: 'Net4life Corretora de Seguros Ltda',
    nomeFantasia: 'NET4Life Corretora de Seguros',
    cnpj: '07.351.909/0001-33',
    susep: '202018702',
    email: 'contato@net4life.com.br',
    phone: '+55 (11) 91177-1319',
    enderecoFormatado: 'Rod. José Carlos Daux, 8600 - Bloco 03 Sala 05, Santo Antônio de Lisboa, Florianópolis/SC',
    logoBuffer,
    logoMimeType: 'image/png',
  };

  const mockCotacao = {
    id: 'cot-test-12345678',
    client_name: 'Dr. Carlos Eduardo da Silva',
    client_cpf_cnpj: '123.456.789-00',
    client_email: 'carlos.eduardo@exemplo.com.br',
    client_phone: '(48) 98888-7777',
  };

  const mockClientData = {
    dataNascto: '1985-06-15',
    oab: '12345/SC',
    logradouro: 'Avenida Beira Mar Norte',
    numero: '1200',
    complemento: 'Sala 402',
    bairro: 'Centro',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88015-100',
    dataAtividade: '2010-01-10',
    escritorioAssociado: 'Silva & Associados Advogados',
    titularidade: 'Sócio Proprietário',
    ppeCargos: 'Não',
    atuacao: ['Direito Civil', 'Direito Empresarial', 'Direito Tributário'],
    seguradora: 'Porto Seguro',
    dataRetroativa: '2021-03-01',
    valorCobertura: 'Plano Ouro - R$ 500.000,00',
    planoFranquia: 'R$ 5.000,00',
    parcela: '6',
    valorParcela: 420.50,
  };

  console.log('Testando renderização do PDF com a marca da corretora...');
  const t0 = Date.now();
  const pdfResult = await renderContratoPdf({
    cotacao: mockCotacao,
    clientData: mockClientData,
    corretora: mockCorretora,
    valorTotal: 2523.00,
    qtdParcelas: 6,
    valorParcela: 420.50,
    valorTotalComJuros: 2523.00,
  });
  const duracao = Date.now() - t0;

  console.log(`PDF gerado em ${duracao}ms!`);
  console.log({
    docName: pdfResult.docName,
    bufferSize: pdfResult.buffer.length,
    base64Size: pdfResult.base64.length,
    headerMagicBytes: pdfResult.buffer.subarray(0, 4).toString(),
    signatario: pdfResult.signatario,
  });

  const outputPath = path.join(process.cwd(), 'scratch_test_contrato.pdf');
  await fs.writeFile(outputPath, pdfResult.buffer);
  console.log(`PDF de teste salvo para verificação: ${outputPath}`);

  if (pdfResult.buffer.subarray(0, 4).toString() !== '%PDF' || pdfResult.buffer.length < 5000) {
    throw new Error('Falha na validação do PDF gerado.');
  }

  console.log('--- TESTE CONCLUÍDO COM 100% DE SUCESSO! ---');
}

main().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
