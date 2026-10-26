import fs from 'fs/promises';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  convertHtmlToPdf,
  isGotenbergAvailable,
  getGotenbergUrl,
  inlineLocalAssets,
  buildHtmlDocument,
  substituirTagsHtml,
} from '../src/lib/gotenberg-client';
import { ContractA4Sheet } from '../src/components/contracts/ContractA4Sheet';
import { RcAdvogadoContractTemplate } from '../src/components/contracts/RcAdvogadoContractTemplate';
import type { ContractData } from '../src/types/contract';

async function main() {
  console.log('='.repeat(70));
  console.log('🚀 INICIANDO TESTE DO MOTOR DE PDF (GOTENBERG) — DUOLIFE HUB');
  console.log('='.repeat(70));

  const scratchDir = path.join(process.cwd(), 'scratch');
  await fs.mkdir(scratchDir, { recursive: true });

  const pdfOutputPath = path.join(scratchDir, 'contrato-teste.pdf');
  const htmlOutputPath = path.join(scratchDir, 'contrato-teste.html');

  // 1. Dados simulados do contrato
  const dadosContrato: ContractData = {
    proponente: {
      nome: 'Dr. Carlos Eduardo Santos de Souza',
      dataNascimento: '15/04/1985',
      cpf: '123.456.789-00',
      email: 'carlos@exemplo.adv.br',
      celular: '(11) 98765-4321',
      endereco: 'Av. Brigadeiro Faria Lima, 2000 - Cj 42 - Itaim Bibi - São Paulo/SP',
      inicioProfissional: '10/02/2010',
      oab: 'SP 456.789',
    },
    condicoes: {
      importanciaSegurada: 'R$ 100.000,00',
      franquia: 'Sem aplicação de franquia',
      valorPremio: 'R$ 790,00',
      formaPagamento: '1x à vista no Boleto ou Cartão de Crédito',
      vigencia: '1 ano',
      estipulante: 'DUOLIFE PLATAFORMA DE NEGÓCIOS',
      corretora: 'Corretora Net4Life Seguros',
      seguradora: 'AKAD Seguros S.A.',
    },
    corretora: {
      nome: 'Net4Life Corretora de Seguros',
      razaoSocial: 'Net4Life Soluções e Corretagem de Seguros Ltda',
      nomeFantasia: 'Net4Life Seguros',
      cidade: 'São Paulo',
      estado: 'SP',
    },
    dataCidade: {
      cidade: 'São Paulo',
      dia: '26',
      mes: 'Outubro',
      ano: '2026',
    },
  };

  console.log('📋 Montando componente A4 e Template RC Advogados em HTML...');

  // 2. Renderização do componente React para marcação HTML estática
  const innerHtml = renderToStaticMarkup(
    React.createElement(
      ContractA4Sheet,
      { corretora: dadosContrato.corretora },
      React.createElement(RcAdvogadoContractTemplate, { data: dadosContrato })
    )
  );

  // 3. Montagem do documento HTML completo com Tailwind e calibração A4
  let fullHtml = buildHtmlDocument(innerHtml, {
    title: 'Termo de Adesão - RC Advogados (Teste Gotenberg)',
  });

  // 4. Injeção de Data URIs para imagens locais (/images/...)
  console.log('🖼️ Convertendo imagens locais para Base64 Data URIs...');
  fullHtml = await inlineLocalAssets(fullHtml);

  // Salva o HTML final gerado no disco para inspeção no navegador
  await fs.writeFile(htmlOutputPath, fullHtml, 'utf-8');
  console.log(`📄 HTML compilado salvo em: ${path.relative(process.cwd(), htmlOutputPath)}`);

  // 5. Verificação de disponibilidade do Gotenberg
  const gotenbergUrl = getGotenbergUrl();
  console.log(`🔍 Testando conectividade com Gotenberg em: ${gotenbergUrl}`);

  const isAvailable = await isGotenbergAvailable(3000);

  if (isAvailable) {
    console.log('✅ Gotenberg está online! Enviando requisição de conversão...');
    const startMs = Date.now();

    try {
      const pdfResult = await convertHtmlToPdf({
        html: fullHtml,
        waitDelayMs: 300,
        emulateMediaType: 'print',
      });

      const elapsedMs = Date.now() - startMs;
      await fs.writeFile(pdfOutputPath, pdfResult.buffer);

      console.log('='.repeat(70));
      console.log(`🎉 SUCESSO! PDF gerado via Gotenberg em ${elapsedMs}ms!`);
      console.log(`📁 Arquivo salvo em: ${path.relative(process.cwd(), pdfOutputPath)}`);
      console.log(`📊 Tamanho do arquivo: ${(pdfResult.size / 1024).toFixed(2)} KB (${pdfResult.size} bytes)`);
      console.log('='.repeat(70));
      return;
    } catch (conversionErr: any) {
      console.error('❌ Falha na conversão via Gotenberg:', conversionErr.message);
    }
  }

  // Se o Gotenberg não estiver rodando (ex: ambiente dev sem Docker iniciado)
  console.log('\n' + '!'.repeat(70));
  console.log('⚠️ AVISO: Gotenberg não está em execução ou não respondeu.');
  console.log(`Endpoint configurado: ${gotenbergUrl}`);
  console.log('Para iniciar o Gotenberg via Docker, execute em seu terminal:');
  console.log('👉 docker run --rm -p 3001:3000 gotenberg/gotenberg:8');
  console.log('ou via docker-compose:');
  console.log('👉 docker compose up -d gotenberg');
  console.log('!'.repeat(70) + '\n');

  console.log('🛠️ Gerando PDF de contingência/validação local para scratch/contrato-teste.pdf...');

  // Gera PDF de validação estrutural via pdf-lib para que o arquivo exista no disco
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Página A4: 595.28 x 841.89 pontos (72 DPI)
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  // Cabeçalho timbrado
  page.drawRectangle({
    x: 36,
    y: height - 60,
    width: width - 72,
    height: 36,
    color: rgb(0.05, 0.29, 0.35),
  });

  page.drawText('DUOLIFE HUB — TERMO DE ADESÃO RC ADVOGADOS', {
    x: 46,
    y: height - 44,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('STATUS: Validação Estrutural (HTML pronto em scratch/contrato-teste.html)', {
    x: 46,
    y: height - 54,
    size: 8,
    font,
    color: rgb(0.85, 0.95, 0.95),
  });

  // Dados do proponente
  let y = height - 90;
  page.drawText('1. DADOS DO PROPONENTE', { x: 36, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;

  const proponenteLinhas = [
    `Nome: ${dadosContrato.proponente?.nome}`,
    `CPF: ${dadosContrato.proponente?.cpf}  |  Nascimento: ${dadosContrato.proponente?.dataNascimento}`,
    `E-mail: ${dadosContrato.proponente?.email}  |  Celular: ${dadosContrato.proponente?.celular}`,
    `Endereço: ${dadosContrato.proponente?.endereco}`,
    `OAB: ${dadosContrato.proponente?.oab}  |  Início Profissional: ${dadosContrato.proponente?.inicioProfissional}`,
  ];

  for (const linha of proponenteLinhas) {
    page.drawText(linha, { x: 46, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }

  y -= 10;
  page.drawText('2. CONDIÇÕES DE COMERCIALIZAÇÃO', { x: 36, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;

  const condicoesLinhas = [
    `Importância Segurada: ${dadosContrato.condicoes?.importanciaSegurada}`,
    `Franquia: ${dadosContrato.condicoes?.franquia}`,
    `Prêmio: ${dadosContrato.condicoes?.valorPremio} (${dadosContrato.condicoes?.formaPagamento})`,
    `Vigência: ${dadosContrato.condicoes?.vigencia}  |  Seguradora: ${dadosContrato.condicoes?.seguradora}`,
    `Corretora: ${dadosContrato.condicoes?.corretora}`,
  ];

  for (const linha of condicoesLinhas) {
    page.drawText(linha, { x: 46, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }

  y -= 20;
  page.drawText('3. ÂNCORAS ZAPSIGN', { x: 36, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  page.drawText('{{assinatura_corretora}}                                  {{assinatura_proponente}}', {
    x: 60,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(pdfOutputPath, pdfBytes);

  console.log('='.repeat(70));
  console.log(`📄 Arquivo gerado em: ${path.relative(process.cwd(), pdfOutputPath)}`);
  console.log(`📊 Tamanho do arquivo: ${(pdfBytes.length / 1024).toFixed(2)} KB (${pdfBytes.length} bytes)`);
  console.log(`🌐 O HTML timbrado correspondente está em: ${path.relative(process.cwd(), htmlOutputPath)}`);
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('Erro fatal no script de teste:', err);
  process.exit(1);
});
