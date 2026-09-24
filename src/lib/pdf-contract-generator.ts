import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, Color } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { getCorretoraParaContrato, CorretoraContratoInfo } from './corretora-resolver';
import { parseAtuacaoList } from './atuacao';
import { logger } from './logger';

export interface ContratoPdfResult {
  buffer: Buffer;
  base64: string;
  docName: string;
  tipoContrato: TipoContratoPdf;
  signatario: {
    nome: string;
    email: string;
    phone: string;
    cpfCnpj: string;
  };
}

export type TipoContratoPdf = '100k' | '100k_renovacao' | 'oficial';

export interface RenderContratoPdfParams {
  cotacao: {
    id: string;
    client_name: string;
    client_cpf_cnpj: string;
    client_email?: string | null;
    client_phone?: string | null;
    is_renewal?: boolean | null;
    importancia_segurada?: number | string | null;
    premio_final?: number | string | null;
  };
  clientData: Record<string, any>;
  corretora: CorretoraContratoInfo;
  valorTotal: number;
  qtdParcelas: number;
  valorParcela: number;
  valorTotalComJuros: number;
}

/**
 * Sanitiza textos para o charset padrão do PDF (WinAnsi/Latin-1)
 * evitando caracteres tipográficos que quebram o encoder do pdf-lib.
 */
function sanitizeForPdf(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' '); // Mantém ASCII + Latin-1 suplementar (acentos pt-BR)
}

function formatMoeda(val: any): string {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCpf(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return raw;
}

function formatData(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const [ano, mes, dia] = val.slice(0, 10).split('-');
      return `${dia}/${mes}/${ano}`;
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

const MESES_PT_MIN = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

/**
 * Quebra linhas de texto para caber na largura especificada.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.trim().split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(sanitizeForPdf(testLine), fontSize);
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

/**
 * Determina com precisão qual dos 3 modelos de contrato deve ser gerado:
 * 1. 100k Novo (2 páginas)
 * 2. 100k Renovação (2 páginas)
 * 3. 300k ou superior: Oficial (4 páginas, para 300k, 500k, 1mi, 1,5mi, 2mi, 3mi)
 */
export function determinarTipoContrato(
  clientData: Record<string, any>,
  cotacao?: { is_renewal?: boolean | null; importancia_segurada?: number | string | null }
): TipoContratoPdf {
  const isRenovacao =
    clientData.isRenovacao === 'Sim' ||
    clientData.renovacao === true ||
    clientData.renovacao === 'true' ||
    clientData.renovacao === 'Sim' ||
    Boolean(cotacao?.is_renewal);

  const tipoRaw = String(
    clientData.tipo || clientData.tipoDePlano || clientData.plano || clientData.nomePlano || ''
  ).toLowerCase().trim();

  const coberturaDigits = String(
    clientData.cobertura || clientData.lmi || clientData.valorCobertura || cotacao?.importancia_segurada || ''
  ).replace(/\D/g, '');

  const is100k =
    tipoRaw.includes('100k') ||
    tipoRaw.includes('100 mil') ||
    tipoRaw === '100' ||
    coberturaDigits === '100000' ||
    coberturaDigits === '10000000';

  if (is100k) {
    return isRenovacao ? '100k_renovacao' : '100k';
  }

  // 300k, 500k, 1mi, 1,5mi, 2mi, 3mi etc.
  return 'oficial';
}

interface CellConfig {
  x: number;
  y: number; // Y do topo da célula (top-down)
  w: number;
  h: number;
  text?: string;
  font?: PDFFont;
  fontSize?: number;
  textColor?: Color;
  bgColor?: Color;
  borderColor?: Color;
  borderWidth?: number;
  align?: 'left' | 'center' | 'right';
  paddingX?: number;
  paddingY?: number;
}

/**
 * Helper para desenhar célula com borda e preenchimento no sistema top-down.
 */
function drawCell(page: PDFPage, pageHeight: number, c: CellConfig) {
  const yBottom = pageHeight - c.y - c.h;
  const borderWidth = c.borderWidth ?? 0.55;
  const borderColor = c.borderColor ?? rgb(0.78, 0.80, 0.80);

  // Fundo
  if (c.bgColor) {
    page.drawRectangle({
      x: c.x,
      y: yBottom,
      width: c.w,
      height: c.h,
      color: c.bgColor,
    });
  }

  // Borda
  if (borderWidth > 0) {
    page.drawRectangle({
      x: c.x,
      y: yBottom,
      width: c.w,
      height: c.h,
      borderColor,
      borderWidth,
    });
  }

  // Texto
  if (c.text !== undefined && c.font && c.fontSize) {
    const sanitized = sanitizeForPdf(c.text);
    const textWidth = c.font.widthOfTextAtSize(sanitized, c.fontSize);
    const padX = c.paddingX ?? 4;
    const align = c.align ?? 'left';

    let textX = c.x + padX;
    if (align === 'center') {
      textX = c.x + (c.w - textWidth) / 2;
    } else if (align === 'right') {
      textX = c.x + c.w - textWidth - padX;
    }

    // Centralização vertical do texto
    const textY = yBottom + (c.h - c.fontSize * 0.75) / 2;

    page.drawText(sanitized, {
      x: textX,
      y: textY,
      size: c.fontSize,
      font: c.font,
      color: c.textColor ?? rgb(0.08, 0.08, 0.08),
    });
  }
}

interface LoadedAssets {
  bgImage: any;
  duolifeLogoImage: any;
  kevLogoImage: any;
  chevronLeftImage: any;
  chevronRightImage: any;
  corretoraLogoImage: any;
}

/**
 * Renderiza o cabeçalho oficial timbrado com logos e o rodapé da KEV Seguros.
 */
function renderTimbradoHeaderAndFooter(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  assets: LoadedAssets,
  corretora: CorretoraContratoInfo,
  fontRegular: PDFFont,
  fontBold: PDFFont
) {
  // 1. Background completo timbrado
  if (assets.bgImage) {
    page.drawImage(assets.bgImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  // 2. Logos do topo
  // Corretora (Esquerda)
  if (assets.corretoraLogoImage) {
    const imgDims = assets.corretoraLogoImage.scale(1);
    const maxW = 90;
    const maxH = 48;
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const w = imgDims.width * scale;
    const h = imgDims.height * scale;
    page.drawImage(assets.corretoraLogoImage, {
      x: 40.0,
      y: pageHeight - 64 + (maxH - h) / 2,
      width: w,
      height: h,
    });
  } else {
    // Se a corretora não tiver logotipo cadastrado, renderiza o nome em texto estilizado
    const nomeCorretora = sanitizeForPdf(corretora.nomeFantasia || corretora.razaoSocial).toUpperCase();
    const maxTextWidth = 150;
    const words = nomeCorretora.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (fontBold.widthOfTextAtSize(testLine, 9.0) <= maxTextWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    const totalLines = Math.min(lines.length, 3);
    const startY = pageHeight - 38 + ((totalLines - 1) * 11) / 2;

    for (let i = 0; i < totalLines; i++) {
      page.drawText(lines[i], {
        x: 40.0,
        y: startY - i * 11.0,
        size: 9.0,
        font: fontBold,
        color: rgb(0.08, 0.08, 0.08),
      });
    }
  }

  // DuoLife (Centro)
  if (assets.duolifeLogoImage) {
    const imgDims = assets.duolifeLogoImage.scale(1);
    const maxW = 90;
    const maxH = 48;
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const w = imgDims.width * scale;
    const h = imgDims.height * scale;
    page.drawImage(assets.duolifeLogoImage, {
      x: 345.0,
      y: pageHeight - 64 + (maxH - h) / 2,
      width: w,
      height: h,
    });
  }

  // KEV Seguros (Direita)
  if (assets.kevLogoImage) {
    const imgDims = assets.kevLogoImage.scale(1);
    const maxW = 105;
    const maxH = 26;
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const w = imgDims.width * scale;
    const h = imgDims.height * scale;
    page.drawImage(assets.kevLogoImage, {
      x: 445.0,
      y: pageHeight - 52 + (maxH - h) / 2,
      width: w,
      height: h,
    });
  }

  // 3. Rodapé Oficial KEV
  if (assets.chevronLeftImage) {
    page.drawImage(assets.chevronLeftImage, {
      x: 91.4,
      y: 35.0,
      width: 8.7,
      height: 12.7,
    });
  }

  if (assets.chevronRightImage) {
    page.drawImage(assets.chevronRightImage, {
      x: 487.9,
      y: 35.0,
      width: 8.7,
      height: 12.7,
    });
  }

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
}

/**
 * Renderiza o cabeçalho textual do documento (Título e Subtítulo).
 */
function drawTitleBlock(page: PDFPage, pageWidth: number, pageHeight: number, yTop: number, fontRegular: PDFFont, fontBold: PDFFont): number {
  const t1 = 'Seguro de Responsabilidade Civil para Advogado';
  const t1W = fontBold.widthOfTextAtSize(t1, 11.5);
  page.drawText(t1, {
    x: (pageWidth - t1W) / 2,
    y: pageHeight - yTop - 11.5,
    size: 11.5,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  const t2 = 'Termo de Adesão por parte do Advogado';
  const t2W = fontRegular.widthOfTextAtSize(t2, 10.0);
  page.drawText(t2, {
    x: (pageWidth - t2W) / 2,
    y: pageHeight - yTop - 27.0,
    size: 10.0,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });

  return yTop + 38.0;
}

/**
 * Renderiza um título de seção no padrão do Certificado.
 */
function drawSectionHeader(
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  w: number,
  title: string,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorBorder: Color
): number {
  drawCell(page, pageHeight, {
    x,
    y: yTop,
    w,
    h: 18.0,
    text: title,
    font: fontBold,
    fontSize: 8.8,
    bgColor: colorGrayHeader,
    textColor: rgb(0.08, 0.08, 0.08),
    borderColor: colorBorder,
    borderWidth: 0.6,
    paddingX: 8,
  });

  return yTop + 20.0;
}

/**
 * Renderiza o bloco de dados do Proponente estilo Certificado.
 */
function drawProponenteBlock(
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  w: number,
  data: {
    nome: string;
    email: string;
    celular: string;
    cpf: string;
    oab: string;
    dataNascto: string;
    enderecoCompleto: string;
    inicioProfissional: string;
    lgpdConcorda: boolean;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
): number {
  let currY = yTop;
  const colLabelW = 75.0;
  const colValW = w - colLabelW;
  const rowH = 17.5;

  // Linha 1: Nome
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Nome:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: colValW, h: rowH, text: data.nome, font: fontBold, fontSize: 8.0, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 2: E-mail
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'E-mail:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: colValW, h: rowH, text: data.email, font: fontRegular, fontSize: 8.0, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 3: Celular | CPF | Nº OAB | Nascimento (4 colunas)
  const c1LabelW = 50.0;
  const c1ValW = 80.0;
  const c2LabelW = 40.0;
  const c2ValW = 90.0;
  const c3LabelW = 55.0;
  const c3ValW = 85.0;
  const c4LabelW = 60.0;
  const c4ValW = w - (c1LabelW + c1ValW + c2LabelW + c2ValW + c3LabelW + c3ValW + c4LabelW);

  let cX = x;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c1LabelW, h: rowH, text: 'Celular:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  cX += c1LabelW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c1ValW, h: rowH, text: data.celular, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  cX += c1ValW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c2LabelW, h: rowH, text: 'CPF:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  cX += c2LabelW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c2ValW, h: rowH, text: data.cpf, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  cX += c2ValW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c3LabelW, h: rowH, text: 'Nº OAB:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  cX += c3LabelW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c3ValW, h: rowH, text: data.oab, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  cX += c3ValW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c4LabelW, h: rowH, text: 'Nascimento:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  cX += c4LabelW;
  drawCell(page, pageHeight, { x: cX, y: currY, w: c4ValW, h: rowH, text: data.dataNascto, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder, align: 'center' });
  currY += rowH;

  // Linha 4: Endereço Completo
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Endereço:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: colValW, h: rowH, text: data.enderecoCompleto, font: fontRegular, fontSize: 7.6, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 5: Início Profissional & Tratamento de Dados (LGPD)
  const l5Col1W = 105.0;
  const l5Col2W = 75.0;
  const l5Col3W = 100.0;
  const l5Col4W = w - (l5Col1W + l5Col2W + l5Col3W);
  const rowH5 = 26.0;

  drawCell(page, pageHeight, { x, y: currY, w: l5Col1W, h: rowH5, text: 'Início Profissional:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + l5Col1W, y: currY, w: l5Col2W, h: rowH5, text: data.inicioProfissional, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder, align: 'center' });
  drawCell(page, pageHeight, { x: x + l5Col1W + l5Col2W, y: currY, w: l5Col3W, h: rowH5, text: 'Tratamento de Dados:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });

  // LGPD box
  const lgpdText = '([X]) Concordo que este site armazene minhas informações para que possam responder à minha consulta.';
  drawCell(page, pageHeight, { x: x + l5Col1W + l5Col2W + l5Col3W, y: currY, w: l5Col4W, h: rowH5, text: lgpdText, font: fontRegular, fontSize: 7.0, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH5;

  return currY + 12.0;
}

/**
 * Renderiza uma caixa de texto legal com quebra automática de linha.
 */
function drawTextCard(
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  w: number,
  h: number,
  text: string,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  bgColor: Color,
  borderColor: Color,
  textColor: Color
): number {
  drawCell(page, pageHeight, {
    x,
    y: yTop,
    w,
    h,
    bgColor,
    borderColor,
    borderWidth: 0.6,
  });

  const wrapped = wrapText(text, font, fontSize, w - 16);
  let textY = pageHeight - yTop - 14.0;

  for (const line of wrapped) {
    if (textY < pageHeight - yTop - h + 8) break; // Não ultrapassa a borda inferior
    page.drawText(sanitizeForPdf(line), {
      x: x + 8.0,
      y: textY,
      size: fontSize,
      font,
      color: textColor,
    });
    textY -= lineHeight;
  }

  return yTop + h + 12.0;
}

/**
 * Renderiza a tabela oficial de Condições de Comercialização (4 linhas x 2 colunas de campos).
 */
function drawCondicoesComercializacao(
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  w: number,
  cond: {
    importanciaSegurada: string;
    valorPremio: string;
    vigencia: string;
    corretora: string;
    franquia: string;
    formaPagamento: string;
    estipulante: string;
    seguradora: string;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
): number {
  let currY = yTop;
  const colW = w / 2;
  const labelW = 105.0;
  const valW = colW - labelW;
  const rowH = 18.0;

  // Linha 1: Importância Segurada & Forma de Pagamento
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Importância Segurada:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: cond.importanciaSegurada, font: fontBold, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Forma de Pagamento:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: cond.formaPagamento, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 2: Valor do Prêmio & Estipulante
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Valor do Prêmio a Pagar:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: cond.valorPremio, font: fontBold, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Estipulante:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: cond.estipulante, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 3: Vigência do Seguro & Seguradora
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Vigência do Seguro:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: cond.vigencia, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Seguradora:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: cond.seguradora, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 4: Corretora & Franquia
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Corretora:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: cond.corretora, font: fontRegular, fontSize: 7.2, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Franquia:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: cond.franquia, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  return currY + 16.0;
}

/**
 * Renderiza o bloco de assinaturas (Corretora e Proponente com a âncora ZapSign).
 */
function drawAssinaturas(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  yTop: number,
  corretoraNome: string,
  proponenteNome: string,
  cidadeDataStr: string,
  fontRegular: PDFFont,
  fontBold: PDFFont
): void {
  // Data e Local centralizado
  const dateW = fontRegular.widthOfTextAtSize(cidadeDataStr, 9.0);
  page.drawText(sanitizeForPdf(cidadeDataStr), {
    x: (pageWidth - dateW) / 2,
    y: pageHeight - yTop,
    size: 9.0,
    font: fontRegular,
    color: rgb(0.12, 0.12, 0.12),
  });

  const signLineY = pageHeight - yTop - 60.0;
  const colSignW = 215.0;

  // 1. Assinatura da Corretora (Esquerda)
  const leftX = 50.0;
  page.drawLine({
    start: { x: leftX, y: signLineY },
    end: { x: leftX + colSignW, y: signLineY },
    thickness: 0.8,
    color: rgb(0.1, 0.1, 0.1),
  });

  const corNameSanitized = sanitizeForPdf(corretoraNome);
  const corNameW = fontBold.widthOfTextAtSize(corNameSanitized, 8.5);
  page.drawText(corNameSanitized, {
    x: leftX + Math.max(0, (colSignW - corNameW) / 2),
    y: signLineY - 13.0,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const lblCor = 'Corretora Intermediadora';
  const lblCorW = fontRegular.widthOfTextAtSize(lblCor, 8.0);
  page.drawText(lblCor, {
    x: leftX + (colSignW - lblCorW) / 2,
    y: signLineY - 24.0,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // 2. Assinatura do Proponente (Direita) - com Âncora ZapSign
  const rightX = pageWidth - 50.0 - colSignW;
  page.drawLine({
    start: { x: rightX, y: signLineY },
    end: { x: rightX + colSignW, y: signLineY },
    thickness: 0.8,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Âncora textual quase invisível para o ZapSign posicionar a assinatura eletrônica
  page.drawText('{{ASSINATURA_SEGURADO}}', {
    x: rightX + 10.0,
    y: signLineY + 6.0,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.98, 0.98, 0.98),
  });

  const propNameSanitized = sanitizeForPdf(proponenteNome);
  const propNameW = fontBold.widthOfTextAtSize(propNameSanitized, 8.5);
  page.drawText(propNameSanitized, {
    x: rightX + Math.max(0, (colSignW - propNameW) / 2),
    y: signLineY - 13.0,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const lblProp = 'Proponente / Segurado';
  const lblPropW = fontRegular.widthOfTextAtSize(lblProp, 8.0);
  page.drawText(lblProp, {
    x: rightX + (colSignW - lblPropW) / 2,
    y: signLineY - 24.0,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
}

/**
 * Renderiza o Bloco "Sobre Responsabilidade Civil nos últimos 2 anos" (Seguro Anterior).
 */
function drawSeguroAnterior(
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  w: number,
  data: {
    seguradora: string;
    limite: string;
    vigencia: string;
    dataRetroativa: string;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
): number {
  let currY = yTop;
  const colW = w / 2;
  const labelW = 110.0;
  const valW = colW - labelW;
  const rowH = 18.0;

  // Linha 1: Seguradora & Limites Segurados
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Seguradora:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: data.seguradora, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Limites Segurados:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: data.limite, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 2: Vigência apólice atual & Data de retroatividade
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Vigência Apólice Atual:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: data.vigencia, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Data de Retroatividade:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: data.dataRetroativa, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  return currY + 12.0;
}

// =========================================================================
// RENDERIZADOR 1: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k (2 PÁGINAS)
// =========================================================================
function renderProposta100kNovo(
  pdfDoc: PDFDocument,
  pageWidth: number,
  pageHeight: number,
  assets: LoadedAssets,
  params: {
    cotacao: any;
    clientData: any;
    corretora: CorretoraContratoInfo;
    condicoes: any;
    cidadeDataStr: string;
    proponenteData: any;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
) {
  const contentX = 40.0;
  const contentW = pageWidth - 80.0; // 515.28 pt

  // --- PÁGINA 1 ---
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page1, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y = 88.0;
  y = drawTitleBlock(page1, pageWidth, pageHeight, y, fontRegular, fontBold);
  y = drawSectionHeader(page1, pageHeight, contentX, y, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y = drawProponenteBlock(page1, pageHeight, contentX, y, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 10.0;
  y = drawSectionHeader(page1, pageHeight, contentX, y, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracao100k =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso imediato após a sua emissão.';

  drawTextCard(
    page1,
    pageHeight,
    contentX,
    y,
    contentW,
    115.0,
    textoDeclaracao100k,
    fontRegular,
    8.2,
    13.0,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  // --- PÁGINA 2 ---
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page2, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y2 = 95.0;
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y2 = drawCondicoesComercializacao(page2, pageHeight, contentX, y2, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y2 += 40.0;
  drawAssinaturas(
    page2,
    pageWidth,
    pageHeight,
    y2,
    params.condicoes.corretora,
    params.proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// RENDERIZADOR 2: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k RENOVACAO (2 PÁGINAS)
// =========================================================================
function renderProposta100kRenovacao(
  pdfDoc: PDFDocument,
  pageWidth: number,
  pageHeight: number,
  assets: LoadedAssets,
  params: {
    cotacao: any;
    clientData: any;
    corretora: CorretoraContratoInfo;
    condicoes: any;
    cidadeDataStr: string;
    proponenteData: any;
    seguroAnterior: any;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
) {
  const contentX = 40.0;
  const contentW = pageWidth - 80.0;

  // --- PÁGINA 1 ---
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page1, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y = 88.0;
  y = drawTitleBlock(page1, pageWidth, pageHeight, y, fontRegular, fontBold);
  y = drawSectionHeader(page1, pageHeight, contentX, y, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y = drawProponenteBlock(page1, pageHeight, contentX, y, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y = drawSectionHeader(page1, pageHeight, contentX, y, contentW, 'SOBRE RESPONSABILIDADE CIVIL NOS ÚLTIMOS 2 ANOS', fontBold, colorGrayHeader, colorBorder);
  drawSeguroAnterior(page1, pageHeight, contentX, y, contentW, params.seguroAnterior, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  // --- PÁGINA 2 ---
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page2, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y2 = 95.0;
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracao100k =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  y2 = drawTextCard(
    page2,
    pageHeight,
    contentX,
    y2,
    contentW,
    115.0,
    textoDeclaracao100k,
    fontRegular,
    8.2,
    13.0,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y2 = drawCondicoesComercializacao(page2, pageHeight, contentX, y2, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y2 += 30.0;
  drawAssinaturas(
    page2,
    pageWidth,
    pageHeight,
    y2,
    params.condicoes.corretora,
    params.proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// RENDERIZADOR 3: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - OFICIAL (4 PÁGINAS)
// Para 300K, 500K, 1MI, 1.5MI, 2MI, 3MI ou superior
// =========================================================================
function renderPropostaOficial(
  pdfDoc: PDFDocument,
  pageWidth: number,
  pageHeight: number,
  assets: LoadedAssets,
  params: {
    cotacao: any;
    clientData: any;
    corretora: CorretoraContratoInfo;
    condicoes: any;
    cidadeDataStr: string;
    proponenteData: any;
    seguroAnterior: any;
    infoProfissional: {
      escritorio: string;
      titularidade: string;
      faturamentoAntes: string;
      faturamentoDepois: string;
    };
    areasAtuacao: string[];
    ppe: {
      ppeCargos: string;
      ppeRepresenta: string;
      ppeCargoSelect: string;
    };
    questionario: {
      propostaRecusada: string;
      propostaDetalhe: string;
      reclamacaoProfissional: string;
      reclamacaoDetalhe: string;
      investigacaoAutoridade: string;
      investigacaoDetalhe: string;
      fatoTerceiros: string;
      fatoDetalhe: string;
      pagouReclamacao: string;
      pagouDetalhe: string;
    };
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
) {
  const contentX = 40.0;
  const contentW = pageWidth - 80.0;

  // --- PÁGINA 1: Título, Proponente e Informações Profissionais ---
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page1, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y1 = 88.0;
  y1 = drawTitleBlock(page1, pageWidth, pageHeight, y1, fontRegular, fontBold);
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y1 = drawProponenteBlock(page1, pageHeight, contentX, y1, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'INFORMAÇÕES PROFISSIONAIS', fontBold, colorGrayHeader, colorBorder);

  // Pergunta 1: Escritório
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: contentW,
    h: 17.0,
    text: 'O profissional é associado a algum escritório? Caso positivo, informar detalhes:',
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1 + 17.0,
    w: contentW,
    h: 19.0,
    text: params.infoProfissional.escritorio,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y1 += 41.0;

  // Pergunta 2: Titularidade
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: contentW,
    h: 17.0,
    text: 'O profissional possui algum tipo de titularidade tais como, pós-graduação, mestrado, doutorado e/ou similares?',
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1 + 17.0,
    w: contentW,
    h: 19.0,
    text: params.infoProfissional.titularidade,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y1 += 41.0;

  // Linha: Faturamento Antes
  const fatLabelW = 240.0;
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: fatLabelW,
    h: 20.0,
    text: 'Faturamento Bruto referente aos últimos 12 meses:',
    font: fontBold,
    fontSize: 7.8,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + fatLabelW,
    y: y1,
    w: contentW - fatLabelW,
    h: 20.0,
    text: params.infoProfissional.faturamentoAntes,
    font: fontRegular,
    fontSize: 7.8,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });

  // --- PÁGINA 2: Faturamento Estimado, Áreas de Atuação e PPE ---
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page2, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y2 = 88.0;

  // Linha: Faturamento Depois
  drawCell(page2, pageHeight, {
    x: contentX,
    y: y2,
    w: fatLabelW,
    h: 20.0,
    text: 'Faturamento Bruto Estimado nos próximos 12 meses:',
    font: fontBold,
    fontSize: 7.8,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page2, pageHeight, {
    x: contentX + fatLabelW,
    y: y2,
    w: contentW - fatLabelW,
    h: 20.0,
    text: params.infoProfissional.faturamentoDepois,
    font: fontRegular,
    fontSize: 7.8,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y2 += 28.0;

  // Áreas de Atuação
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'ÁREAS DE ATUAÇÃO PROFISSIONAL', fontBold, colorGrayHeader, colorBorder);

  page2.drawText('Favor indicar à atuação do Profissional nas áreas abaixo:', {
    x: contentX + 4.0,
    y: pageHeight - y2 - 10.0,
    size: 8.2,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });
  y2 += 18.0;

  // 12 áreas em grid de 3 colunas x 4 linhas
  const areasConfig = [
    { key: 'civil', label: 'Civil' },
    { key: 'direitoInternacional', label: 'Direito Internacional' },
    { key: 'propriedadeIndustrial', label: 'Propriedade Industrial' },
    { key: 'fusoesAquisicoes', label: 'Fusões e Aquisições' },
    { key: 'bancarioFinanceiro', label: 'Bancário Financeiro' },
    { key: 'direitoEmpresarial', label: 'Direito Empresarial' },
    { key: 'criminal', label: 'Criminal' },
    { key: 'trabalhista', label: 'Trabalhista' },
    { key: 'tributaria', label: 'Tributário' },
    { key: 'societario', label: 'Societário' },
    { key: 'previdenciario', label: 'Previdenciário' },
    { key: 'outros', label: 'Outros' },
  ];

  const gridColW = contentW / 3;
  const gridRowH = 18.0;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const area = areasConfig[idx];
      const isChecked = params.areasAtuacao.includes(area.key);
      const mark = isChecked ? '[X]' : '[  ]';
      const cellText = `${mark}  ${area.label}`;

      drawCell(page2, pageHeight, {
        x: contentX + col * gridColW,
        y: y2,
        w: gridColW,
        h: gridRowH,
        text: cellText,
        font: isChecked ? fontBold : fontRegular,
        fontSize: 7.8,
        bgColor: isChecked ? rgb(0.94, 0.97, 0.98) : colorWhite,
        borderColor: colorBorder,
        paddingX: 8,
      });
    }
    y2 += gridRowH;
  }
  y2 += 12.0;

  // PPE - Pessoa Politicamente Exposta
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'PPE – PESSOA POLITICAMENTE EXPOSTA', fontBold, colorGrayHeader, colorBorder);

  const textoSusepPpe =
    'Conforme o Art. 4º da Circular SUSEP 612/20, consideram-se expostas politicamente as pessoas naturais que ocupem ou tenham ocupado, nos 5 (cinco) anos anteriores, empregos ou funções públicas relevantes, assim como funções relevantes em organizações internacionais, para fins de classificação, conforme o Art. 23, também serão consideradas expostas politicamente os representantes legais, familiares ou estreitos colaboradores dessas pessoas.';

  y2 = drawTextCard(
    page2,
    pageHeight,
    contentX,
    y2,
    contentW,
    58.0,
    textoSusepPpe,
    fontRegular,
    7.0,
    10.5,
    rgb(0.97, 0.97, 0.97),
    colorBorder,
    rgb(0.2, 0.2, 0.2)
  );

  // Perguntas PPE (2 colunas)
  const ppeColW = contentW / 2;
  const ppeBoxH = 50.0;

  // Coluna 1
  drawCell(page2, pageHeight, {
    x: contentX,
    y: y2,
    w: ppeColW,
    h: 32.0,
    text: 'Desempenha ou já desempenhou algum dos cargos relacionados a PPE, nos últimos 5 anos?',
    font: fontBold,
    fontSize: 7.2,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page2, pageHeight, {
    x: contentX,
    y: y2 + 32.0,
    w: ppeColW,
    h: 18.0,
    text: params.ppe.ppeCargos,
    font: fontRegular,
    fontSize: 7.8,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });

  // Coluna 2
  drawCell(page2, pageHeight, {
    x: contentX + ppeColW,
    y: y2,
    w: ppeColW,
    h: 32.0,
    text: 'É representante legal, familiar ou estreito colaborador de ocupante de algum cargo relacionado a PPE, nos últimos 5 anos?',
    font: fontBold,
    fontSize: 7.2,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page2, pageHeight, {
    x: contentX + ppeColW,
    y: y2 + 32.0,
    w: ppeColW,
    h: 18.0,
    text: params.ppe.ppeRepresenta,
    font: fontRegular,
    fontSize: 7.8,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y2 += ppeBoxH + 6.0;

  // Cargos PPE selecionados
  drawCell(page2, pageHeight, {
    x: contentX,
    y: y2,
    w: 140.0,
    h: 20.0,
    text: 'Cargos PPE selecionados:',
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page2, pageHeight, {
    x: contentX + 140.0,
    y: y2,
    w: contentW - 140.0,
    h: 20.0,
    text: params.ppe.ppeCargoSelect,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });

  // --- PÁGINA 3: Seguro Anterior nos últimos 2 anos e Histórico de Reclamações ---
  const page3 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page3, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y3 = 88.0;
  y3 = drawSectionHeader(page3, pageHeight, contentX, y3, contentW, 'SOBRE RESPONSABILIDADE CIVIL NOS ÚLTIMOS 2 ANOS', fontBold, colorGrayHeader, colorBorder);
  y3 = drawSeguroAnterior(page3, pageHeight, contentX, y3, contentW, params.seguroAnterior, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  // Recusa de proposta
  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: contentW - 80.0,
    h: 18.0,
    text: 'Foi recusada alguma proposta para seguro semelhante feita pelo profissional?',
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + contentW - 80.0,
    y: y3,
    w: 80.0,
    h: 18.0,
    text: params.questionario.propostaRecusada,
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y3 += 18.0;

  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: 130.0,
    h: 18.0,
    text: 'Se afirmativo, informar detalhes:',
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + 130.0,
    y: y3,
    w: contentW - 130.0,
    h: 18.0,
    text: params.questionario.propostaDetalhe,
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y3 += 26.0;

  // Histórico de Reclamação
  y3 = drawSectionHeader(page3, pageHeight, contentX, y3, contentW, 'INFORMAR HISTÓRICO DE RECLAMAÇÃO', fontBold, colorGrayHeader, colorBorder);

  // Pergunta 1: Reclamações contra o profissional
  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: contentW - 80.0,
    h: 22.0,
    text: 'Existem reclamações contra o profissional por danos causados pela prestação de seus serviços?',
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + contentW - 80.0,
    y: y3,
    w: 80.0,
    h: 22.0,
    text: params.questionario.reclamacaoProfissional,
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y3 += 22.0;

  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: 130.0,
    h: 18.0,
    text: 'Se afirmativo, informar detalhes:',
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + 130.0,
    y: y3,
    w: contentW - 130.0,
    h: 18.0,
    text: params.questionario.reclamacaoDetalhe,
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y3 += 24.0;

  // Pergunta 2: Ação disciplinar ou investigações
  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: contentW - 80.0,
    h: 22.0,
    text: 'O profissional sofreu reclamação(ões), ação disciplinar ou investigações por autoridade fiscal, conselhos (ex: OAB/TED) e instituições?',
    font: fontBold,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + contentW - 80.0,
    y: y3,
    w: 80.0,
    h: 22.0,
    text: params.questionario.investigacaoAutoridade,
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y3 += 22.0;

  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: 130.0,
    h: 18.0,
    text: 'Se afirmativo, informar detalhes:',
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + 130.0,
    y: y3,
    w: contentW - 130.0,
    h: 18.0,
    text: params.questionario.investigacaoDetalhe,
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y3 += 24.0;

  // Pergunta 3: Conhecimento de fatos ou circunstâncias
  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: contentW - 80.0,
    h: 22.0,
    text: 'O profissional tem conhecimento de algum fato ou circunstância que possa gerar reclamação de terceiros?',
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + contentW - 80.0,
    y: y3,
    w: 80.0,
    h: 22.0,
    text: params.questionario.fatoTerceiros,
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y3 += 22.0;

  drawCell(page3, pageHeight, {
    x: contentX,
    y: y3,
    w: 130.0,
    h: 18.0,
    text: 'Se afirmativo, informar detalhes:',
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page3, pageHeight, {
    x: contentX + 130.0,
    y: y3,
    w: contentW - 130.0,
    h: 18.0,
    text: params.questionario.fatoDetalhe,
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y3 += 24.0;

  // Pergunta 4 (chamada de rodapé da pág 3)
  page3.drawText('O profissional alguma vez pagou por uma reclamação com fundos próprios? (Continuação na pág. 4)', {
    x: contentX + 4.0,
    y: pageHeight - y3 - 12.0,
    size: 7.8,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  // --- PÁGINA 4: Pagamento com Fundos Próprios, Declaração, Comercialização e Assinaturas ---
  const page4 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page4, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y4 = 88.0;

  // Continuação Pergunta 4
  drawCell(page4, pageHeight, {
    x: contentX,
    y: y4,
    w: contentW - 80.0,
    h: 20.0,
    text: 'O profissional alguma vez pagou por uma reclamação com fundos próprios?',
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page4, pageHeight, {
    x: contentX + contentW - 80.0,
    y: y4,
    w: 80.0,
    h: 20.0,
    text: params.questionario.pagouReclamacao,
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y4 += 20.0;

  drawCell(page4, pageHeight, {
    x: contentX,
    y: y4,
    w: 130.0,
    h: 18.0,
    text: 'Se afirmativo, informar detalhes:',
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page4, pageHeight, {
    x: contentX + 130.0,
    y: y4,
    w: contentW - 130.0,
    h: 18.0,
    text: params.questionario.pagouDetalhe,
    font: fontRegular,
    fontSize: 7.4,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y4 += 24.0;

  // Declaração de Veracidade e Risco
  y4 = drawSectionHeader(page4, pageHeight, contentX, y4, contentW, 'DECLARAÇÃO DE VERACIDADE E RISCO', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracaoOficial =
    'O Proponente, declara que todas as informações aqui apresentadas são a expressão da verdade e que nenhum fato ou acontecimento que se relacione com a sua responsabilidade legal foi omitido. Declara, também, seu compromisso em informar, antes da finalização dos procedimentos para contratação da Apólice, quaisquer alterações nos dados e informações aqui expressas. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância em que este Questionário sirva de base para análise e aceitação do risco de sua empresa, para fixação do Prêmio da Apólice, e que, emitida a Apólice, este Questionário passe a integrá-la como se a ela pertencesse. As Condições Gerais do seguro de Responsabilidade Civil para Advogados ora em contratação está disponível no site que originou a presente Proposta e o proponente abaixo assinado declara ter lido e aceito.';

  y4 = drawTextCard(
    page4,
    pageHeight,
    contentX,
    y4,
    contentW,
    110.0,
    textoDeclaracaoOficial,
    fontRegular,
    7.5,
    11.5,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  // Condições de Comercialização
  y4 = drawSectionHeader(page4, pageHeight, contentX, y4, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y4 = drawCondicoesComercializacao(page4, pageHeight, contentX, y4, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y4 += 25.0;
  drawAssinaturas(
    page4,
    pageWidth,
    pageHeight,
    y4,
    params.condicoes.corretora,
    params.proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO
// =========================================================================
export async function renderContratoPdf(params: RenderContratoPdfParams): Promise<ContratoPdfResult> {
  const {
    cotacao,
    clientData,
    corretora,
    valorTotal,
    qtdParcelas,
    valorParcela,
  } = params;

  // Dimensões A4: 595.28 x 841.89 pt
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Cores do Modelo Oficial
  const colorGrayHeader = rgb(0.929, 0.929, 0.929); // #ECECEC
  const colorWhite = rgb(1, 1, 1);
  const colorBorder = rgb(0.75, 0.77, 0.77);

  // --- CARREGAMENTO DE ASSETS GRÁFICOS OFICIAIS ---
  let bgImage: any = null;
  let duolifeLogoImage: any = null;
  let kevLogoImage: any = null;
  let chevronLeftImage: any = null;
  let chevronRightImage: any = null;
  let corretoraLogoImage: any = null;

  const imagesDir = path.join(process.cwd(), 'public', 'images', 'contrato-kev');

  try {
    const bgBytes = await fs.readFile(path.join(imagesDir, 'kev-background.jpg'));
    bgImage = await pdfDoc.embedJpg(bgBytes);
  } catch (err) {
    logger.warn({ err }, 'pdf_generator.kev_bg_not_found');
  }

  try {
    const duoBytes = await fs.readFile(path.join(imagesDir, 'duolife-logo.jpg'));
    duolifeLogoImage = await pdfDoc.embedJpg(duoBytes);
  } catch (err) {
    logger.warn({ err }, 'pdf_generator.duolife_logo_not_found');
  }

  try {
    const kevBytes = await fs.readFile(path.join(imagesDir, 'kev-logo.jpg'));
    kevLogoImage = await pdfDoc.embedJpg(kevBytes);
  } catch (err) {
    logger.warn({ err }, 'pdf_generator.kev_logo_not_found');
  }

  try {
    const chLBytes = await fs.readFile(path.join(imagesDir, 'chevron-left.jpg'));
    chevronLeftImage = await pdfDoc.embedJpg(chLBytes);
  } catch (err) {
    // Seta esquerda opcional
  }

  try {
    const chRBytes = await fs.readFile(path.join(imagesDir, 'chevron-right.jpg'));
    chevronRightImage = await pdfDoc.embedJpg(chRBytes);
  } catch (err) {
    // Seta direita opcional
  }

  // Carrega logotipo da corretora se disponível no banco
  if (corretora.logoBuffer) {
    try {
      if (corretora.logoMimeType === 'image/jpeg') {
        corretoraLogoImage = await pdfDoc.embedJpg(corretora.logoBuffer);
      } else {
        corretoraLogoImage = await pdfDoc.embedPng(corretora.logoBuffer);
      }
    } catch (err) {
      logger.warn({ err }, 'pdf_generator.corretora_logo_embed_error');
    }
  }

  const assets: LoadedAssets = {
    bgImage,
    duolifeLogoImage,
    kevLogoImage,
    chevronLeftImage,
    chevronRightImage,
    corretoraLogoImage,
  };

  // --- TRATAMENTO DINÂMICO DE DADOS ---
  const hoje = new Date();
  const mesAtualMin = MESES_PT_MIN[hoje.getMonth()];
  const diaHoje = hoje.getDate();
  const anoHoje = hoje.getFullYear();

  const cidadeCorretora = corretora.cidade || 'Florianópolis';
  const cidadeDataStr = `${cidadeCorretora}, ${diaHoje} de ${mesAtualMin} de ${anoHoje}`;

  // Endereço completo formatado
  const enderecoParts = [
    clientData.logradouro || clientData.endereco,
    clientData.numero ? `nº ${clientData.numero}` : null,
    clientData.complemento || null,
    clientData.bairro ? `Bairro ${clientData.bairro}` : null,
    clientData.cidade && clientData.uf ? `${clientData.cidade}/${clientData.uf}` : (clientData.cidade || clientData.uf),
    clientData.cep ? `CEP: ${clientData.cep}` : null,
  ].filter(Boolean);
  const enderecoCompleto = enderecoParts.length > 0 ? enderecoParts.join(', ') : 'Não informado';

  // Início Profissional
  const inicioProfissional = formatData(
    clientData.dataAtividade || clientData.inicioProfissional || clientData.inicioAtividade
  ) || 'Não informado';

  // Proponente
  const proponenteData = {
    nome: cotacao.client_name,
    email: cotacao.client_email || clientData.email || 'Não informado',
    celular: cotacao.client_phone || clientData.celular || clientData.telefone || 'Não informado',
    cpf: formatCpf(cotacao.client_cpf_cnpj || clientData.cpf),
    oab: String(clientData.oab || clientData.registroProfissionalNumero || 'Não informado'),
    dataNascto: formatData(clientData.dataNascto || clientData.nascimento) || 'Não informado',
    enderecoCompleto,
    inicioProfissional,
    lgpdConcorda: true,
  };

  // Importância Segurada (LMI)
  let coberturaStr = String(
    clientData.valorCobertura || clientData.cobertura || clientData.lmi || cotacao.importancia_segurada || '100.000,00'
  ).trim();
  if (/^\d+(\.\d+)?$/.test(coberturaStr)) {
    coberturaStr = formatMoeda(Number(coberturaStr));
  } else if (!coberturaStr.startsWith('R$')) {
    coberturaStr = `R$ ${coberturaStr}`;
  }

  // Franquia
  let franquiaStr = String(clientData.planoFranquia || clientData.franquia || '1.000,00').trim();
  if (/^\d+(\.\d+)?$/.test(franquiaStr)) {
    franquiaStr = formatMoeda(Number(franquiaStr));
  } else if (!franquiaStr.startsWith('R$')) {
    franquiaStr = `R$ ${franquiaStr}`;
  }

  // Parcelamento e Pagamento
  const parcelasQtd = qtdParcelas > 0 ? qtdParcelas : (Number(clientData.parcela) || 1);
  const parcelaValor = valorParcela > 0 ? valorParcela : (valorTotal / parcelasQtd);
  const formaPagamentoTexto = parcelasQtd > 1
    ? `${parcelasQtd} parcelas de ${formatMoeda(parcelaValor)}`
    : `1 parcela de ${formatMoeda(valorTotal)} à vista`;

  // Condições de Comercialização
  const condicoes = {
    importanciaSegurada: coberturaStr,
    valorPremio: formatMoeda(valorTotal),
    vigencia: '1 ano',
    corretora: corretora.nomeFantasia || corretora.razaoSocial,
    franquia: franquiaStr,
    formaPagamento: formaPagamentoTexto,
    estipulante: 'Duolife Plataforma de Negócios',
    seguradora: 'Kev Seguradora',
  };

  // Seguro Anterior (Últimos 2 anos)
  const seguroAnterior = {
    seguradora: clientData.seguradora || 'Não informada',
    limite: clientData.limite || clientData.lmiAnterior || coberturaStr,
    vigencia: formatData(clientData.vigencia) || 'Não informada',
    dataRetroativa: formatData(clientData.dataRetroativa || clientData.retroatividade) || formatData(hoje),
  };

  // --- SELEÇÃO DO MODELO DE CONTRATO ---
  const tipoContrato = determinarTipoContrato(clientData, cotacao);

  if (tipoContrato === '100k') {
    renderProposta100kNovo(
      pdfDoc,
      pageWidth,
      pageHeight,
      assets,
      {
        cotacao,
        clientData,
        corretora,
        condicoes,
        cidadeDataStr,
        proponenteData,
      },
      fontRegular,
      fontBold,
      colorGrayHeader,
      colorWhite,
      colorBorder
    );
  } else if (tipoContrato === '100k_renovacao') {
    renderProposta100kRenovacao(
      pdfDoc,
      pageWidth,
      pageHeight,
      assets,
      {
        cotacao,
        clientData,
        corretora,
        condicoes,
        cidadeDataStr,
        proponenteData,
        seguroAnterior,
      },
      fontRegular,
      fontBold,
      colorGrayHeader,
      colorWhite,
      colorBorder
    );
  } else {
    // OFICIAL: 300k, 500k, 1mi, 1,5mi, 2mi, 3mi ou superior (4 Páginas)
    const areasAtuacao = parseAtuacaoList(clientData.atuacao || clientData.especialidades);

    // Resolução de descrição de cargos PPE
    let ppeDescricao = 'Nenhum';
    if (clientData.ppeCargoSelect) {
      if (Array.isArray(clientData.ppeCargoSelect)) {
        ppeDescricao = clientData.ppeCargoSelect.join(', ');
      } else {
        ppeDescricao = String(clientData.ppeCargoSelect);
      }
    }

    renderPropostaOficial(
      pdfDoc,
      pageWidth,
      pageHeight,
      assets,
      {
        cotacao,
        clientData,
        corretora,
        condicoes,
        cidadeDataStr,
        proponenteData,
        seguroAnterior,
        infoProfissional: {
          escritorio: clientData.escritorioAssociado || clientData.escritorio || 'Não associado',
          titularidade: clientData.titularidade || 'Não possui',
          faturamentoAntes: clientData.faturamentoAntes || 'Não informado',
          faturamentoDepois: clientData.faturamentoDepois || 'Não informado',
        },
        areasAtuacao,
        ppe: {
          ppeCargos: clientData.ppeCargos === 'Sim' || clientData.ppeCargos === true ? 'Sim' : 'Não',
          ppeRepresenta: clientData.ppeRepresenta === 'Sim' || clientData.ppeRepresenta === true ? 'Sim' : 'Não',
          ppeCargoSelect: ppeDescricao,
        },
        questionario: {
          propostaRecusada: clientData.propostaRecusada === 'Sim' ? 'Sim' : 'Não',
          propostaDetalhe: clientData.propostaDetalhe || 'Não se aplica',
          reclamacaoProfissional: clientData.reclamacaoProfissional === 'Sim' ? 'Sim' : 'Não',
          reclamacaoDetalhe: clientData.reclamacaoDetalhe || 'Não se aplica',
          investigacaoAutoridade: clientData.investigacaoAutoridade === 'Sim' ? 'Sim' : 'Não',
          investigacaoDetalhe: clientData.investigacaoDetalhe || 'Não se aplica',
          fatoTerceiros: clientData.fatoTerceiros === 'Sim' ? 'Sim' : 'Não',
          fatoDetalhe: clientData.fatoDetalhe || 'Não se aplica',
          pagouReclamacao: clientData.pagouReclamacao === 'Sim' ? 'Sim' : 'Não',
          pagouDetalhe: clientData.pagouDetalhe || 'Não se aplica',
        },
      },
      fontRegular,
      fontBold,
      colorGrayHeader,
      colorWhite,
      colorBorder
    );
  }

  // --- GERAÇÃO FINAL DO BUFFER E BASE64 ---
  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  const base64 = buffer.toString('base64');

  const cleanClientName = (cotacao.client_name || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
  const idCurto = cotacao.id.slice(0, 8).toUpperCase();
  const tipoDocSufixo = tipoContrato === '100k'
    ? '100k'
    : tipoContrato === '100k_renovacao'
      ? '100k_Renovacao'
      : 'Oficial';

  const docName = `Proposta_RC_${tipoDocSufixo}_${corretora.nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}_${cleanClientName}_${idCurto}.pdf`;

  return {
    buffer,
    base64,
    docName,
    tipoContrato,
    signatario: {
      nome: cotacao.client_name,
      email: cotacao.client_email || 'suporte@duolife.net.br',
      phone: cotacao.client_phone || '',
      cpfCnpj: cotacao.client_cpf_cnpj,
    },
  };
}

/**
 * Busca a cotação no banco, resolve a corretora vinculada, calcula valores e gera o PDF do contrato.
 */
export async function gerarContratoPdfBuffer(cotacaoId: string): Promise<ContratoPdfResult> {
  const [cotacao] = await sql<any[]>`
    SELECT * FROM cotacoes WHERE id = ${cotacaoId} LIMIT 1
  `;
  if (!cotacao) {
    throw new Error(`Cotação não encontrada para o ID ${cotacaoId}`);
  }

  const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

  // Resolve Corretora e Logomarca
  const corretora = await getCorretoraParaContrato(cotacao.id);

  // Recalcula valores de plano e parcelamento com segurança no servidor
  const preco = await calcularPrecoServidor({
    tipoDePlano: clientData.tipo || clientData.tipoDePlano || null,
    qtdParcelasSolicitada: Number(clientData.parcela) || 1,
    cupomCodigo: clientData.cupomCodigo || null,
    descontoManualPercent: Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0,
  });

  const valorTotal = preco?.valorTotal ?? Number(cotacao.premio_final || cotacao.premio_calculado || 0);
  const qtdParcelas = preco?.qtdParcelas ?? 1;
  const valorParcela = preco?.valorParcela ?? valorTotal;
  const valorTotalComJuros = qtdParcelas > 1 ? valorParcela * qtdParcelas : valorTotal;

  return renderContratoPdf({
    cotacao,
    clientData,
    corretora,
    valorTotal,
    qtdParcelas,
    valorParcela,
    valorTotalComJuros,
  });
}
