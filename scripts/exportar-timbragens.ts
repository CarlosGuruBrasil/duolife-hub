import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function gerarTimbradoPdfs() {
  const imagesDir = path.join(process.cwd(), 'public', 'images', 'contrato-kev');
  const tempDir = path.join(process.cwd(), 'scratch', 'timbragem_temp');
  await fs.mkdir(tempDir, { recursive: true });

  const bgBytes = await fs.readFile(path.join(imagesDir, 'kev-background.jpg'));
  const duoBytes = await fs.readFile(path.join(imagesDir, 'duolife-logo.jpg'));
  const kevBytes = await fs.readFile(path.join(imagesDir, 'kev-logo.jpg'));
  const chLBytes = await fs.readFile(path.join(imagesDir, 'chevron-left.jpg'));
  const chRBytes = await fs.readFile(path.join(imagesDir, 'chevron-right.jpg'));

  let net4lifeBytes: Buffer | null = null;
  try {
    net4lifeBytes = await fs.readFile(path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png'));
  } catch (e) {
    console.warn('net4life-logo.png não encontrado');
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;

  // Helper para montar a página timbrada
  async function montarPdf(incluirCorretora: boolean) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 1. Background
    const bgImage = await pdfDoc.embedJpg(bgBytes);
    page.drawImage(bgImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    // 2. Logo Corretora (se solicitado)
    if (incluirCorretora && net4lifeBytes) {
      const corImage = await pdfDoc.embedPng(net4lifeBytes);
      const imgDims = corImage.scale(1);
      const maxW = 90;
      const maxH = 48;
      const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
      const w = imgDims.width * scale;
      const h = imgDims.height * scale;
      page.drawImage(corImage, {
        x: 40.0,
        y: pageHeight - 64 + (maxH - h) / 2,
        width: w,
        height: h,
      });
    }

    // 3. Logo DuoLife
    const duoImage = await pdfDoc.embedJpg(duoBytes);
    const duoDims = duoImage.scale(1);
    const maxDW = 90;
    const maxDH = 48;
    const scaleD = Math.min(maxDW / duoDims.width, maxDH / duoDims.height);
    page.drawImage(duoImage, {
      x: 345.0,
      y: pageHeight - 64 + (maxDH - duoDims.height * scaleD) / 2,
      width: duoDims.width * scaleD,
      height: duoDims.height * scaleD,
    });

    // 4. Logo KEV
    const kevImage = await pdfDoc.embedJpg(kevBytes);
    const kevDims = kevImage.scale(1);
    const maxKW = 105;
    const maxKH = 26;
    const scaleK = Math.min(maxKW / kevDims.width, maxKH / kevDims.height);
    page.drawImage(kevImage, {
      x: 445.0,
      y: pageHeight - 52 + (maxKH - kevDims.height * scaleK) / 2,
      width: kevDims.width * scaleK,
      height: kevDims.height * scaleK,
    });

    // 5. Rodapé
    const chLImage = await pdfDoc.embedJpg(chLBytes);
    page.drawImage(chLImage, {
      x: 91.4,
      y: 35.0,
      width: 8.7,
      height: 12.7,
    });

    const chRImage = await pdfDoc.embedJpg(chRBytes);
    page.drawImage(chRImage, {
      x: 487.9,
      y: 35.0,
      width: 8.7,
      height: 12.7,
    });

    const rodapeLinha1 = 'Avenida Brigadeiro Faria Lima, 3477, Torre B, 2º andar. Itaim Bibi, São Paulo - SP, 04538-133';
    const w1 = fontRegular.widthOfTextAtSize(rodapeLinha1, 8.0);
    page.drawText(rodapeLinha1, {
      x: (pageWidth - w1) / 2,
      y: 42.0,
      size: 8.0,
      font: fontRegular,
      color: rgb(0.12, 0.12, 0.12),
    });

    const rodapeLinha2 = 'kevseguros.com.br';
    const w2 = fontBold.widthOfTextAtSize(rodapeLinha2, 8.5);
    page.drawText(rodapeLinha2, {
      x: (pageWidth - w2) / 2,
      y: 30.5,
      size: 8.5,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    return await pdfDoc.save();
  }

  // Gera versão completa (com Net4Life)
  const pdfCompleto = await montarPdf(true);
  const pathCompleto = path.join(tempDir, 'timbrado_completo.pdf');
  await fs.writeFile(pathCompleto, pdfCompleto);
  console.log('PDF Timbrado Completo salvo em:', pathCompleto);

  // Gera versão neutra (sem Net4Life, espaço livre para corretora)
  const pdfNeutro = await montarPdf(false);
  const pathNeutro = path.join(tempDir, 'timbrado_neutro.pdf');
  await fs.writeFile(pathNeutro, pdfNeutro);
  console.log('PDF Timbrado Neutro salvo em:', pathNeutro);
}

gerarTimbradoPdfs().catch(console.error);
