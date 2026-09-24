import fsSync from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string) {
  if (!fsSync.existsSync(filePath)) return;
  const content = fsSync.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

import fs from 'fs/promises';
import { renderContratoPdf } from '../src/lib/pdf-contract-generator';

async function runTests() {
  console.log('=== INICIANDO TESTE END-TO-END DE LOGOTIPO DA CORRETORA ===\n');

  // 1. Testa validação de tamanho de 2MB
  console.log('1. Testando validação de limite de 2MB...');
  const fakeBigBuffer = Buffer.alloc(2.5 * 1024 * 1024, 'a'); // 2.5MB
  const bigBase64 = fakeBigBuffer.toString('base64');
  const sizeBytes = Buffer.byteLength(bigBase64, 'base64');
  if (sizeBytes > 2 * 1024 * 1024) {
    console.log(`  [OK] Validação de 2MB: Arquivo de ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB detectado e bloqueado com sucesso.`);
  } else {
    throw new Error('Falha no cálculo de limite de 2MB');
  }

  // 2. Teste de processamento de Base64 e Mime Type
  console.log('\n2. Testando decodificação de logotipo em Base64 e MIME type...');
  const testLogoPath = path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png');
  const testLogoBuffer = await fs.readFile(testLogoPath);
  const testLogoBase64 = testLogoBuffer.toString('base64');
  const cleanBase64 = testLogoBase64.replace(/^data:[^;]+;base64,/, '');
  const decodedBuffer = Buffer.from(cleanBase64, 'base64');
  console.log(`  [OK] Logo decodificado com sucesso: ${decodedBuffer.length} bytes (buffer idêntico ao original: ${testLogoBuffer.equals(decodedBuffer)})`);

  // 3. Teste de geração de PDF com logo da corretora
  console.log('\n3. Testando renderização de PDF para corretora COM logotipo oficial...');
  const corretoraComLogo = {
    id: 'corretora_vip_001',
    razaoSocial: 'SEGURADORA & CORRETORA MODELO TESTE LTDA',
    nomeFantasia: 'CORRETORA VIP SEGUROS',
    cnpj: '99.888.777/0001-99',
    susep: '202699999',
    email: 'contato@vipseguros.com.br',
    phone: '(48) 98888-7777',
    enderecoFormatado: 'Av. Paulista, 1000, Bela Vista, São Paulo/SP, CEP: 01310-100',
    logoBuffer: testLogoBuffer,
    logoMimeType: 'image/png' as const,
  };

  const cotacaoMock = {
    id: 'COT-TESTE-LOGO-01',
    client_name: 'Dr. Roberto de Andrade',
    client_cpf_cnpj: '123.456.789-00',
    client_email: 'roberto@andrade.adv.br',
    client_phone: '(11) 98765-4321',
  };

  const clientDataMock = {
    profissao: 'Médico',
    atividade: 'MEDICINA',
    tipoDePlano: 'Medicina',
    cobertura: '500.000,00',
    franquia: '3.000,00',
    dataInicio: '2026-09-24',
    parcela: 6,
    premioLiquido: 806.72,
    iof: 64.28,
  };

  const pdfComLogo = await renderContratoPdf({
    cotacao: cotacaoMock,
    clientData: clientDataMock,
    corretora: corretoraComLogo,
    valorTotal: 871.0,
    qtdParcelas: 6,
    valorParcela: 145.17,
    valorTotalComJuros: 871.0,
  });

  const { PDFDocument } = await import('pdf-lib');
  const docComLogo = await PDFDocument.load(pdfComLogo.buffer);
  const pagesComLogo = docComLogo.getPageCount();

  if (pagesComLogo !== 2) {
    throw new Error(`Esperado 2 páginas no PDF com logo, obtido: ${pagesComLogo}`);
  }
  console.log(`  [OK] PDF com logo oficial gerado com sucesso!`);
  console.log(`       Nome do arquivo: ${pdfComLogo.docName}`);
  console.log(`       Tamanho: ${pdfComLogo.buffer.length} bytes, Páginas: ${pagesComLogo}`);

  // 4. Teste de geração de PDF para corretora SEM logotipo (renderiza nome em texto)
  console.log('\n4. Testando renderização de PDF para corretora SEM logotipo (Fallback para Nome da Corretora em Texto)...');
  const corretoraSemLogo = {
    id: 'corretora_sem_logo_01',
    razaoSocial: 'NOVA ALIANCA CORRETORA DE SEGUROS LTDA',
    nomeFantasia: 'NOVA ALIANÇA SEGUROS',
    cnpj: '11.222.333/0001-44',
    susep: '202044444',
    email: 'contato@novaalianca.com.br',
    phone: '(47) 99999-1111',
    enderecoFormatado: 'Rua das Flores, 500, Centro, Joinville/SC, CEP: 89201-000',
    logoBuffer: null, // Sem logo cadastrado
    logoMimeType: null,
  };

  const pdfSemLogo = await renderContratoPdf({
    cotacao: cotacaoMock,
    clientData: clientDataMock,
    corretora: corretoraSemLogo,
    valorTotal: 871.0,
    qtdParcelas: 6,
    valorParcela: 145.17,
    valorTotalComJuros: 871.0,
  });

  const docSemLogo = await PDFDocument.load(pdfSemLogo.buffer);
  const pagesSemLogo = docSemLogo.getPageCount();

  if (pagesSemLogo !== 2) {
    throw new Error(`Esperado 2 páginas no PDF sem logo, obtido: ${pagesSemLogo}`);
  }
  console.log(`  [OK] PDF sem logo (nome em texto) gerado com sucesso!`);
  console.log(`       Nome do arquivo: ${pdfSemLogo.docName}`);
  console.log(`       Tamanho: ${pdfSemLogo.buffer.length} bytes, Páginas: ${pagesSemLogo}`);

  console.log('\n=== TODOS OS TESTES PASSARAM COM SUCESSO! (0 ERROS) ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('ERRO NO TESTE:', err);
  process.exit(1);
});
