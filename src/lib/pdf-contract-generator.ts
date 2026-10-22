import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, Color } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { getCorretoraParaContrato, CorretoraContratoInfo } from './corretora-resolver';
import { parseAtuacaoList } from './atuacao';
import { logger } from './logger';
import { getRamoConfig, rcAdvogadosConfig, rcMedicosConfig, GRUPOS_TARIFARIOS_SAUDE, type RamoConfig } from './product-schemas';

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
  signatarioCorretora?: {
    nome: string;
    email: string;
    phone?: string;
  };
  signatarioProponente?: {
    nome: string;
    email: string;
    phone?: string;
    cpfCnpj?: string;
  };
}

export type TipoContratoPdf = '100k' | '100k_renovacao' | 'oficial' | 'termo_saude';

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
 * Quebra também palavras individuais que excedam a largura máxima da célula.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  const paragraphs = String(text).split('\n');

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
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        // Se uma única palavra exceder maxWidth, particiona caractere a caractere
        const wordWidth = font.widthOfTextAtSize(sanitizeForPdf(word), fontSize);
        if (wordWidth > maxWidth) {
          let chunk = '';
          for (const char of word) {
            if (font.widthOfTextAtSize(sanitizeForPdf(chunk + char), fontSize) <= maxWidth) {
              chunk += char;
            } else {
              if (chunk) lines.push(chunk);
              chunk = char;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
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
    Boolean(clientData.isRenewal) ||
    Boolean(cotacao?.is_renewal);

  const tipoRaw = String(
    clientData.tipo || clientData.tipoDePlano || clientData.plano || clientData.nomePlano || ''
  ).toLowerCase().trim();

  const coberturaStr = String(
    clientData.cobertura || clientData.lmi || clientData.valorCobertura || cotacao?.importancia_segurada || ''
  );
  const coberturaDigits = coberturaStr.replace(/\D/g, '');

  const isMedico =
    clientData.flowKey === 'rc_medicos_v1' ||
    clientData.flowKey === 'rc-medicos' ||
    (cotacao as any)?.flow_key === 'rc_medicos_v1' ||
    (cotacao as any)?.flow_key === 'rc-medicos' ||
    (cotacao as any)?.product_id === 'prod-rc-med-001' ||
    Boolean(clientData.grupoTarifario);

  if (isMedico) {
    return 'termo_saude';
  }

  const is100k =
    tipoRaw.includes('100k') ||
    tipoRaw.includes('100 mil') ||
    tipoRaw === '100' ||
    coberturaStr.includes('100.000') ||
    coberturaDigits === '100000' ||
    coberturaDigits === '10000000' ||
    coberturaDigits === '1000000';

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
  valign?: 'top' | 'middle';
  paddingX?: number;
  paddingY?: number;
  lineHeight?: number;
}

/**
 * Helper para desenhar célula com borda, preenchimento e suporte automático
 * a multi-line auto-wrapping de textos longos.
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

  // Texto com auto-wrap inteligente de múltiplas linhas
  if (c.text !== undefined && c.font && c.fontSize) {
    const padX = c.paddingX ?? 4;
    const padY = c.paddingY ?? 3;
    const maxTextW = Math.max(10, c.w - padX * 2);
    const align = c.align ?? 'left';

    const lines = wrapText(c.text, c.font, c.fontSize, maxTextW);
    if (lines.length === 0) return;

    const lineHeight = c.lineHeight ?? (c.fontSize * 1.25);
    const totalTextHeight = (lines.length - 1) * lineHeight + c.fontSize * 0.75;

    // Alinhamento vertical
    let startY: number;
    if (c.valign === 'top' || totalTextHeight >= c.h - padY * 2) {
      startY = (pageHeight - c.y) - padY - (c.fontSize * 0.75);
    } else {
      // Middle vertical
      const freeSpace = c.h - totalTextHeight;
      startY = yBottom + freeSpace / 2 + totalTextHeight - (c.fontSize * 0.75);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sanitized = sanitizeForPdf(line);
      const textWidth = c.font.widthOfTextAtSize(sanitized, c.fontSize);

      let textX = c.x + padX;
      if (align === 'center') {
        textX = c.x + (c.w - textWidth) / 2;
      } else if (align === 'right') {
        textX = c.x + c.w - textWidth - padX;
      }

      const currentLineY = startY - i * lineHeight;

      // Não deixa desenhar fora do limite inferior da célula
      if (currentLineY >= yBottom + 1) {
        page.drawText(sanitized, {
          x: textX,
          y: currentLineY,
          size: c.fontSize,
          font: c.font,
          color: c.textColor ?? rgb(0.08, 0.08, 0.08),
        });
      }
    }
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
function drawTitleBlock(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  yTop: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  ramoConfig?: RamoConfig | null,
  subtipo?: string | null
): number {
  const isMed = ramoConfig?.ramoId === 'rc-medicos';
  let t1 = 'Seguro de Responsabilidade Civil para Advogado';
  let t2 = 'Termo de Adesão por parte do Advogado';
  if (isMed) {
    if (subtipo === 'G2') {
      t1 = 'Seguro de Responsabilidade Civil para Dentistas';
      t2 = 'Termo de Adesão por parte do Dentista';
    } else if (subtipo === 'G1') {
      t1 = 'Seguro de Responsabilidade Civil — Área da Saúde';
      t2 = 'Termo de Adesão por parte do Profissional da Saúde';
    } else {
      t1 = 'Seguro de Responsabilidade Civil para Médicos';
      t2 = 'Termo de Adesão por parte do Médico';
    }
  }
  const t1W = fontBold.widthOfTextAtSize(t1, 11.5);
  page.drawText(t1, {
    x: (pageWidth - t1W) / 2,
    y: pageHeight - yTop - 11.5,
    size: 11.5,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

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
    lgpdConcorda?: boolean;
    registroLabel?: string;
    registroValor?: string;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
): number {
  let currY = yTop;
  const colLabelW = 85.0;
  const colValW = w - colLabelW;
  const rowH = 16.5;

  // Linha 1: Nome
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Nome:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: colValW, h: rowH, text: data.nome, font: fontBold, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 2: Nascimento & CPF
  const halfW = w / 2;
  const c2LabelW = 48.0;
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Nascimento:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: halfW - colLabelW, h: rowH, text: data.dataNascto, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW, y: currY, w: c2LabelW, h: rowH, text: 'CPF:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW + c2LabelW, y: currY, w: halfW - c2LabelW, h: rowH, text: data.cpf, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 3: E-mail & Celular
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'E-mail:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: halfW - colLabelW, h: rowH, text: data.email, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW, y: currY, w: c2LabelW, h: rowH, text: 'Celular:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW + c2LabelW, y: currY, w: halfW - c2LabelW, h: rowH, text: data.celular, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 4: Endereço
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Endereço:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: colValW, h: rowH, text: data.enderecoCompleto, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 5: Início Profissional & OAB/CRM
  const regLabel = data.registroLabel || 'OAB:';
  const regValor = data.registroValor || data.oab || 'Não informado';
  drawCell(page, pageHeight, { x, y: currY, w: colLabelW, h: rowH, text: 'Início profissional:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colLabelW, y: currY, w: halfW - colLabelW, h: rowH, text: data.inicioProfissional, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW, y: currY, w: c2LabelW, h: rowH, text: regLabel, font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + halfW + c2LabelW, y: currY, w: halfW - c2LabelW, h: rowH, text: regValor, font: fontRegular, fontSize: 7.7, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  return currY + 6.0;
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
  minH: number,
  text: string,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  bgColor: Color,
  borderColor: Color,
  textColor: Color
): number {
  const wrapped = wrapText(text, font, fontSize, w - 16);
  const padTop = 8.0;
  const padBottom = 8.0;
  const contentHeight = (wrapped.length - 1) * lineHeight + fontSize + padTop + padBottom;
  const actualH = Math.max(minH, contentHeight);

  drawCell(page, pageHeight, {
    x,
    y: yTop,
    w,
    h: actualH,
    bgColor,
    borderColor,
    borderWidth: 0.6,
  });

  let textY = pageHeight - yTop - padTop - fontSize;

  for (const line of wrapped) {
    page.drawText(sanitizeForPdf(line), {
      x: x + 8.0,
      y: textY,
      size: fontSize,
      font,
      color: textColor,
    });
    textY -= lineHeight;
  }

  return yTop + actualH + 6.0;
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
  const rowH = 16.0;

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

  return currY + 6.0;
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
  const dateW = fontRegular.widthOfTextAtSize(cidadeDataStr, 8.5);
  page.drawText(sanitizeForPdf(cidadeDataStr), {
    x: (pageWidth - dateW) / 2,
    y: pageHeight - yTop,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.12, 0.12, 0.12),
  });

  const signLineY = pageHeight - yTop - 46.0;
  const colSignW = 210.0;

  // 1. Assinatura da Corretora (Esquerda) - com Âncora ZapSign
  const leftX = 40.0;

  // Âncora textual em tom quase invisível para a ZapSign identificar o signatário 1 (Corretora)
  page.drawText('{{assinatura_corretora}}', {
    x: leftX + 15.0,
    y: signLineY + 6.0,
    size: 7.0,
    font: fontRegular,
    color: rgb(0.98, 0.98, 0.98),
  });

  page.drawLine({
    start: { x: leftX, y: signLineY },
    end: { x: leftX + colSignW, y: signLineY },
    thickness: 0.8,
    color: rgb(0.1, 0.1, 0.1),
  });

  const corNameSanitized = sanitizeForPdf(corretoraNome);
  const corNameW = fontBold.widthOfTextAtSize(corNameSanitized, 8.2);
  page.drawText(corNameSanitized, {
    x: leftX + Math.max(0, (colSignW - corNameW) / 2),
    y: signLineY - 12.0,
    size: 8.2,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const lblCor = 'Corretora';
  const lblCorW = fontRegular.widthOfTextAtSize(lblCor, 8.0);
  page.drawText(lblCor, {
    x: leftX + (colSignW - lblCorW) / 2,
    y: signLineY - 23.0,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // 2. Assinatura do Proponente (Direita) - com Âncora ZapSign
  const rightX = pageWidth - 40.0 - colSignW;

  // Âncora textual em tom quase invisível para o ZapSign (signatário 2: Proponente)
  page.drawText('{{assinatura_proponente}}', {
    x: rightX + 15.0,
    y: signLineY + 6.0,
    size: 7.0,
    font: fontRegular,
    color: rgb(0.98, 0.98, 0.98),
  });

  page.drawLine({
    start: { x: rightX, y: signLineY },
    end: { x: rightX + colSignW, y: signLineY },
    thickness: 0.8,
    color: rgb(0.1, 0.1, 0.1),
  });

  const propNameSanitized = sanitizeForPdf(proponenteNome);
  const propNameW = fontBold.widthOfTextAtSize(propNameSanitized, 8.2);
  page.drawText(propNameSanitized, {
    x: rightX + Math.max(0, (colSignW - propNameW) / 2),
    y: signLineY - 12.0,
    size: 8.2,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const lblProp = 'Proponente';
  const lblPropW = fontRegular.widthOfTextAtSize(lblProp, 8.0);
  page.drawText(lblProp, {
    x: rightX + (colSignW - lblPropW) / 2,
    y: signLineY - 23.0,
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
  const rowH = 16.0;

  // Linha 1: Seguradora & Limites Segurados
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Seguradora:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: data.seguradora, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Limites Segurados:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: data.limite, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  // Linha 2: Vigência apólice atual & Data de retroatividade
  drawCell(page, pageHeight, { x, y: currY, w: labelW, h: rowH, text: 'Vigência apólice atual:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + labelW, y: currY, w: valW, h: rowH, text: data.vigencia, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW, y: currY, w: labelW, h: rowH, text: 'Data de retroatividade:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page, pageHeight, { x: x + colW + labelW, y: currY, w: valW, h: rowH, text: data.dataRetroativa, font: fontRegular, fontSize: 7.8, bgColor: colorWhite, borderColor: colorBorder });
  currY += rowH;

  return currY + 6.0;
}

// =========================================================================
// RENDERIZADOR 1: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k (1 PÁGINA)
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

  // --- PÁGINA ÚNICA (1 PÁGINA) ---
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y = 86.0;
  y = drawTitleBlock(page, pageWidth, pageHeight, y, fontRegular, fontBold);
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y = drawProponenteBlock(page, pageHeight, contentX, y, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 6.0;
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracao100k =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  y = drawTextCard(
    page,
    pageHeight,
    contentX,
    y,
    contentW,
    66.0,
    textoDeclaracao100k,
    fontRegular,
    7.6,
    11.2,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  y += 6.0;
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y = drawCondicoesComercializacao(page, pageHeight, contentX, y, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 18.0;
  drawAssinaturas(
    page,
    pageWidth,
    pageHeight,
    y,
    params.condicoes.corretora,
    params.proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// RENDERIZADOR 2: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - 100k RENOVACAO (1 PÁGINA)
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
  const contentW = pageWidth - 80.0; // 515.28 pt

  // --- PÁGINA ÚNICA (1 PÁGINA) ---
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y = 86.0;
  y = drawTitleBlock(page, pageWidth, pageHeight, y, fontRegular, fontBold);
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y = drawProponenteBlock(page, pageHeight, contentX, y, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 4.0;
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'INFORMAÇÕES DO SEGURO DE RESPONSABILIDADE CIVIL ANTERIOR', fontBold, colorGrayHeader, colorBorder);
  y = drawSeguroAnterior(page, pageHeight, contentX, y, contentW, params.seguroAnterior, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 4.0;
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracao100k =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  y = drawTextCard(
    page,
    pageHeight,
    contentX,
    y,
    contentW,
    64.0,
    textoDeclaracao100k,
    fontRegular,
    7.5,
    11.0,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  y += 4.0;
  y = drawSectionHeader(page, pageHeight, contentX, y, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y = drawCondicoesComercializacao(page, pageHeight, contentX, y, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y += 16.0;
  drawAssinaturas(
    page,
    pageWidth,
    pageHeight,
    y,
    params.condicoes.corretora,
    params.proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// RENDERIZADOR: SEGURO RC PROFISSIONAIS DE SAÚDE - TERMO DE ADESÃO (2 PÁGINAS)
// Modelo Oficial KEV / DuoLife para Médicos e Profissionais da Saúde
// =========================================================================
function renderTermoSaude(
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
    ramoConfig?: RamoConfig | null;
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
) {
  const contentX = 40.0;
  const contentW = pageWidth - 80.0; // 515.28 pt

  const { clientData, cotacao, corretora, condicoes, proponenteData, seguroAnterior } = params;

  // Resolução de campos de Processos Internos
  const assinam = clientData.assinamConsentimento === 'Não' ? 'Não' : 'Sim';
  const domicilio = clientData.prestacaoDomicilio === 'Sim' ? 'Sim' : 'Não';
  const proprioRisco = clientData.auditoriaRisco === 'Não' ? 'Não' : 'Sim';
  const atendimentosMensais = String(clientData.atendimentosMensais || clientData.volumeAtendimentos || '80 atendimentos/mês');
  const arquivosProntuarios = String(clientData.arquivamentoProntuarios || 'Digital / Prontuário Eletrônico em Nuvem');

  // Especialidade e Categoria
  const grupoCodigo = String(clientData.grupoTarifario || clientData.grupo || '').toUpperCase();
  const grupoDef = GRUPOS_TARIFARIOS_SAUDE.find((g) => g.id === grupoCodigo || g.codigo === grupoCodigo.toLowerCase());
  const espSelecionada = clientData.especialidadeMedica || clientData.especialidade || '';
  const especialidadeTexto = grupoDef
    ? `${grupoDef.label}${espSelecionada ? ` — ${espSelecionada}` : ''}`
    : espSelecionada || 'Profissional da Saúde / Especialidades Clínicas e Cirúrgicas';

  // Informações de Renovação
  const isRenovacao =
    clientData.isRenovacao === 'Sim' ||
    clientData.renovacao === true ||
    clientData.renovacao === 'true' ||
    clientData.renovacao === 'Sim' ||
    Boolean(cotacao.is_renewal);

  // Histórico de Reclamações (Página 1)
  const questionarioRisco = (clientData.questionarioRisco && typeof clientData.questionarioRisco === 'object'
    ? clientData.questionarioRisco
    : {}) as Record<string, any>;

  const resolveSimNao = (...candidates: any[]): 'Sim' | 'Não' => {
    for (const raw of candidates) {
      if (raw === undefined || raw === null || raw === '') continue;
      if (raw === true || raw === 1) return 'Sim';
      if (raw === false || raw === 0) return 'Não';
      const norm = String(raw).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!norm) continue;
      if (['sim', 's', 'true', '1', 'yes', 'y'].includes(norm)) return 'Sim';
      if (['nao', 'n', 'false', '0', 'no'].includes(norm)) return 'Não';
    }
    return 'Não';
  };

  const houveReclamacao = resolveSimNao(
    clientData.houveReclamacao,
    clientData.reclamacaoErroMedico,
    clientData.reclamacaoProfissional,
    questionarioRisco.reclamacaoErroMedico,
    questionarioRisco.reclamacaoProfissional
  );

  const dataOcorrencia = houveReclamacao === 'Sim'
    ? (clientData.dataOcorrenciaReclamacao || formatData(clientData.dataOcorrencia) || 'Não informada')
    : 'Não se aplica';
  const dataReclamacao = houveReclamacao === 'Sim'
    ? (clientData.dataReclamacao || 'Não informada')
    : 'Não se aplica';
  const detalhesReclamacao = houveReclamacao === 'Sim'
    ? (clientData.detalhesReclamacao || clientData.reclamacaoErroMedicoDetalhe || clientData.reclamacaoDetalhe || 'Não informado')
    : 'Sem histórico de reclamações';
  const valorIndenizado = houveReclamacao === 'Sim'
    ? (clientData.valorIndenizado ? (String(clientData.valorIndenizado).startsWith('R$') ? clientData.valorIndenizado : formatMoeda(clientData.valorIndenizado)) : 'R$ 0,00')
    : 'R$ 0,00';
  const statusAtualReclamacao = houveReclamacao === 'Sim'
    ? (clientData.statusReclamacao || 'Regular')
    : 'Regular';

  // Histórico de Fatos Conhecidos (Página 2)
  const conhecimentoFato = resolveSimNao(
    clientData.conhecimentoFato,
    clientData.fatoPotencial,
    clientData.fatoTerceiros,
    questionarioRisco.fatoPotencial,
    questionarioRisco.fatoTerceiros
  );

  const dataFato = conhecimentoFato === 'Sim'
    ? (clientData.dataOcorrenciaFato || 'Não informada')
    : 'Não se aplica';
  const dataReclamacaoFato = conhecimentoFato === 'Sim'
    ? (clientData.dataReclamacaoFato || 'Não informada')
    : 'Não se aplica';
  const detalhesFato = conhecimentoFato === 'Sim'
    ? (clientData.detalhesFato || clientData.fatoPotencialDetalhe || clientData.fatoDetalhe || 'Não informado')
    : 'Sem fatos conhecidos';
  const valorEstimadoFato = conhecimentoFato === 'Sim'
    ? (clientData.valorEstimadoFato ? (String(clientData.valorEstimadoFato).startsWith('R$') ? clientData.valorEstimadoFato : formatMoeda(clientData.valorEstimadoFato)) : 'R$ 0,00')
    : 'R$ 0,00';
  const statusAtualFato = conhecimentoFato === 'Sim'
    ? (clientData.statusFato || 'Regular')
    : 'Regular';

  // =======================================================================
  // --- PÁGINA 1: CABEÇALHO, PROPONENTE, PROCESSOS, ESPECIALIDADE, RENOVAÇÃO, RECLAMAÇÃO ---
  // =======================================================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page1, pageWidth, pageHeight, assets, corretora, fontRegular, fontBold);

  let y1 = 78.0;

  // Títulos Oficiais do Termo de Adesão da Saúde
  const t1 = 'Seguro de Responsabilidade Civil para Profissionais de Saúde';
  const t1W = fontBold.widthOfTextAtSize(t1, 11.5);
  page1.drawText(t1, {
    x: (pageWidth - t1W) / 2,
    y: pageHeight - y1 - 11.5,
    size: 11.5,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  const t2 = 'Termo de Adesão por parte do Profissional de Saúde';
  const t2W = fontRegular.widthOfTextAtSize(t2, 10.0);
  page1.drawText(t2, {
    x: (pageWidth - t2W) / 2,
    y: pageHeight - y1 - 27.0,
    size: 10.0,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });
  y1 += 38.0;

  // 1. PROPONENTE
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const rowH = 16.0;
  // Linha 1: Nome, Website, CNPJ/CPF
  const wNomeLbl = 45.0;
  const wNomeVal = 185.0;
  const wWebLbl = 55.0;
  const wWebVal = 105.0;
  const wCpfLbl = 60.0;
  const wCpfVal = contentW - (wNomeLbl + wNomeVal + wWebLbl + wWebVal + wCpfLbl);

  drawCell(page1, pageHeight, { x: contentX, y: y1, w: wNomeLbl, h: rowH, text: 'Nome:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wNomeLbl, y: y1, w: wNomeVal, h: rowH, text: proponenteData.nome, font: fontBold, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wNomeLbl + wNomeVal, y: y1, w: wWebLbl, h: rowH, text: 'Website:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wNomeLbl + wNomeVal + wWebLbl, y: y1, w: wWebVal, h: rowH, text: clientData.website || clientData.site || 'Não informado', font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wNomeLbl + wNomeVal + wWebLbl + wWebVal, y: y1, w: wCpfLbl, h: rowH, text: 'CNPJ/CPF:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wNomeLbl + wNomeVal + wWebLbl + wWebVal + wCpfLbl, y: y1, w: wCpfVal, h: rowH, text: proponenteData.cpf, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Linha 2: Endereço Completo
  const wEndLbl = 60.0;
  const wEndVal = contentW - wEndLbl;
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: wEndLbl, h: rowH, text: 'Endereço:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wEndLbl, y: y1, w: wEndVal, h: rowH, text: proponenteData.enderecoCompleto, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Linha 3: Início das atividades e Reg. Profissional
  const wAtivLbl = 110.0;
  const wAtivVal = 145.0;
  const wRegLbl = 100.0;
  const wRegVal = contentW - (wAtivLbl + wAtivVal + wRegLbl);
  const regProfissionalTexto = proponenteData.registroValor || clientData.crm || clientData.cro || clientData.registroProfissionalNumero || 'Não informado';

  drawCell(page1, pageHeight, { x: contentX, y: y1, w: wAtivLbl, h: rowH, text: 'Início das atividades:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wAtivLbl, y: y1, w: wAtivVal, h: rowH, text: proponenteData.inicioProfissional, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wAtivLbl + wAtivVal, y: y1, w: wRegLbl, h: rowH, text: 'Reg. Profissional:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wAtivLbl + wAtivVal + wRegLbl, y: y1, w: wRegVal, h: rowH, text: regProfissionalTexto, font: fontRegular, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH + 6.0;

  // 2. PROCESSOS INTERNOS E ATENDIMENTO
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'PROCESSOS INTERNOS E ATENDIMENTO', fontBold, colorGrayHeader, colorBorder);

  const procLblW = 390.0;
  const procValW = contentW - procLblW; // 125.28

  // Pergunta 1: Consentimento
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: procLblW, h: rowH, text: 'Pacientes assinam termo de consentimento em procedimentos invasivos?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + procLblW, y: y1, w: procValW, h: rowH, text: `Sim ( ${assinam === 'Sim' ? 'X' : ' '} )   |   Não ( ${assinam === 'Não' ? 'X' : ' '} )`, font: fontBold, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Pergunta 2: Domicílio
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: procLblW, h: rowH, text: 'Há prestação de serviço em domicílio?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + procLblW, y: y1, w: procValW, h: rowH, text: `Sim ( ${domicilio === 'Sim' ? 'X' : ' '} )   |   Não ( ${domicilio === 'Não' ? 'X' : ' '} )`, font: fontBold, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Pergunta 3: Gestão de risco
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: procLblW, h: rowH, text: 'Realiza auditorias e possui procedimentos para gerenciamento do próprio risco?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + procLblW, y: y1, w: procValW, h: rowH, text: `Sim ( ${proprioRisco === 'Sim' ? 'X' : ' '} )   |   Não ( ${proprioRisco === 'Não' ? 'X' : ' '} )`, font: fontBold, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Pergunta 4: Média atendimentos
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: procLblW, h: rowH, text: 'Qual o número médio de atendimentos mensais?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + procLblW, y: y1, w: procValW, h: rowH, text: atendimentosMensais, font: fontRegular, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Pergunta 5: Arquivamento prontuários
  const prontLblW = 240.0;
  const prontValW = contentW - prontLblW;
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: prontLblW, h: rowH, text: 'Como são arquivadas as fichas e prontuários dos pacientes?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + prontLblW, y: y1, w: prontValW, h: rowH, text: arquivosProntuarios, font: fontRegular, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH + 6.0;

  // 3. ESPECIALIDADES EXERCIDAS OBJETO DE COBERTA
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'ESPECIALIDADES EXERCIDAS OBJETO DE COBERTA', fontBold, colorGrayHeader, colorBorder);
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: contentW, h: 18.0, text: especialidadeTexto, font: fontBold, fontSize: 7.6, bgColor: colorWhite, borderColor: colorBorder, paddingX: 8 });
  y1 += 24.0;

  // 4. INFORMAÇÕES DE RENOVAÇÃO DO SEGURO
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'INFORMAÇÕES DE RENOVAÇÃO DO SEGURO', fontBold, colorGrayHeader, colorBorder);

  // Linha 1 Renovação: Sim / Não
  const renLblW = 85.0;
  const renValW = contentW - renLblW;
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: renLblW, h: rowH, text: 'É renovação:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + renLblW, y: y1, w: renValW, h: rowH, text: `SIM ( ${isRenovacao ? 'X' : ' '} )   |   NÃO ( ${!isRenovacao ? 'X' : ' '} )`, font: fontBold, fontSize: 7.5, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Linha 2 Renovação: Seguradora, Prêmio, Vigência, Retroatividade
  const wSegLbl = 65.0;
  const wSegVal = 85.0;
  const wPremLbl = 45.0;
  const wPremVal = 65.0;
  const wVigLbl = 50.0;
  const wVigVal = 70.0;
  const wRetLbl = 70.0;
  const wRetVal = contentW - (wSegLbl + wSegVal + wPremLbl + wPremVal + wVigLbl + wVigVal + wRetLbl); // 65.28

  const premioRenovacaoStr = clientData.premioAnterior || clientData.premio
    ? (String(clientData.premioAnterior || clientData.premio).startsWith('R$') ? String(clientData.premioAnterior || clientData.premio) : formatMoeda(clientData.premioAnterior || clientData.premio))
    : (isRenovacao ? seguroAnterior.limite : 'Não informado');

  drawCell(page1, pageHeight, { x: contentX, y: y1, w: wSegLbl, h: rowH, text: 'Seguradora:', font: fontBold, fontSize: 7.5, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl, y: y1, w: wSegVal, h: rowH, text: isRenovacao ? seguroAnterior.seguradora : 'Não se aplica', font: fontRegular, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal, y: y1, w: wPremLbl, h: rowH, text: 'Prêmio:', font: fontBold, fontSize: 7.5, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal + wPremLbl, y: y1, w: wPremVal, h: rowH, text: isRenovacao ? premioRenovacaoStr : 'Não se aplica', font: fontRegular, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal + wPremLbl + wPremVal, y: y1, w: wVigLbl, h: rowH, text: 'Vigência:', font: fontBold, fontSize: 7.5, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal + wPremLbl + wPremVal + wVigLbl, y: y1, w: wVigVal, h: rowH, text: isRenovacao ? seguroAnterior.vigencia : 'Não se aplica', font: fontRegular, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal + wPremLbl + wPremVal + wVigLbl + wVigVal, y: y1, w: wRetLbl, h: rowH, text: 'Retroatividade:', font: fontBold, fontSize: 7.5, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + wSegLbl + wSegVal + wPremLbl + wPremVal + wVigLbl + wVigVal + wRetLbl, y: y1, w: wRetVal, h: rowH, text: isRenovacao ? seguroAnterior.dataRetroativa : 'Não se aplica', font: fontRegular, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH + 6.0;

  // 5. HISTÓRICO DE RECLAMAÇÕES E FATOS CONHECIDOS (PÁGINA 1)
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'HISTÓRICO DE RECLAMAÇÕES E FATOS CONHECIDOS', fontBold, colorGrayHeader, colorBorder);

  // Pergunta 1: Reclamação
  const recLblW = 390.0;
  const recValW = contentW - recLblW;
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: recLblW, h: rowH, text: 'Conhecimento de reclamação, falha na prestação dos serviços ou processo administrativo?', font: fontBold, fontSize: 7.1, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + recLblW, y: y1, w: recValW, h: rowH, text: `SIM ( ${houveReclamacao === 'Sim' ? 'X' : ' '} )   |   NÃO ( ${houveReclamacao === 'Não' ? 'X' : ' '} )`, font: fontBold, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y1 += rowH;

  // Subtítulo da Tabela
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: contentW, h: 14.0, text: 'Detalhes da Reclamação:', font: fontBold, fontSize: 7.2, bgColor: rgb(0.97, 0.97, 0.97), borderColor: colorBorder });
  y1 += 14.0;

  // Header da Tabela (5 Colunas)
  const colRec1 = 75.0;  // Data Ocorrência
  const colRec2 = 75.0;  // Data Reclamação
  const colRec3 = 215.28; // Detalhes
  const colRec4 = 80.0;  // Valor Indenizado
  const colRec5 = 70.0;  // Status Atual
  const tblHeaderH = 15.0;

  drawCell(page1, pageHeight, { x: contentX, y: y1, w: colRec1, h: tblHeaderH, text: 'Data Ocorrência', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1, y: y1, w: colRec2, h: tblHeaderH, text: 'Data Reclamação', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2, y: y1, w: colRec3, h: tblHeaderH, text: 'Detalhes da Reclamação', font: fontBold, fontSize: 6.9, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2 + colRec3, y: y1, w: colRec4, h: tblHeaderH, text: 'Valor Indenizado', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2 + colRec3 + colRec4, y: y1, w: colRec5, h: tblHeaderH, text: 'Status Atual', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  y1 += tblHeaderH;

  // Dados da Tabela
  const tblRowH = 18.0;
  drawCell(page1, pageHeight, { x: contentX, y: y1, w: colRec1, h: tblRowH, text: dataOcorrencia, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1, y: y1, w: colRec2, h: tblRowH, text: dataReclamacao, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2, y: y1, w: colRec3, h: tblRowH, text: detalhesReclamacao, font: fontRegular, fontSize: 7.0, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2 + colRec3, y: y1, w: colRec4, h: tblRowH, text: valorIndenizado, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page1, pageHeight, { x: contentX + colRec1 + colRec2 + colRec3 + colRec4, y: y1, w: colRec5, h: tblRowH, text: statusAtualReclamacao, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });

  // =======================================================================
  // --- PÁGINA 2: FATOS CONHECIDOS, DECLARAÇÃO, CONDIÇÕES E ASSINATURAS ---
  // =======================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page2, pageWidth, pageHeight, assets, corretora, fontRegular, fontBold);

  let y2 = 78.0;

  // 1. HISTÓRICO DE RECLAMAÇÕES E FATOS CONHECIDOS (CONTINUAÇÃO)
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'HISTÓRICO DE RECLAMAÇÕES E FATOS CONHECIDOS', fontBold, colorGrayHeader, colorBorder);

  // Pergunta 2: Fato gerador futuro
  drawCell(page2, pageHeight, { x: contentX, y: y2, w: recLblW, h: rowH, text: 'Conhecimento de fato que possa gerar reclamação futura?', font: fontBold, fontSize: 7.3, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + recLblW, y: y2, w: recValW, h: rowH, text: `SIM ( ${conhecimentoFato === 'Sim' ? 'X' : ' '} )   |   NÃO ( ${conhecimentoFato === 'Não' ? 'X' : ' '} )`, font: fontBold, fontSize: 7.4, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y2 += rowH;

  // Subtítulo da Tabela
  drawCell(page2, pageHeight, { x: contentX, y: y2, w: contentW, h: 14.0, text: 'Detalhes de Fato Gerador:', font: fontBold, fontSize: 7.2, bgColor: rgb(0.97, 0.97, 0.97), borderColor: colorBorder });
  y2 += 14.0;

  // Header da Tabela (5 Colunas)
  const colFat1 = 85.0;  // Data Ocorrência / Conhecimento
  const colFat2 = 75.0;  // Data Reclamação
  const colFat3 = 205.28; // Detalhes do Fato
  const colFat4 = 80.0;  // Valor Estimado
  const colFat5 = 70.0;  // Status Atual

  drawCell(page2, pageHeight, { x: contentX, y: y2, w: colFat1, h: tblHeaderH, text: 'Data Ocorrência / Conhecimento', font: fontBold, fontSize: 6.7, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1, y: y2, w: colFat2, h: tblHeaderH, text: 'Data Reclamação', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2, y: y2, w: colFat3, h: tblHeaderH, text: 'Detalhes de Fato Gerador', font: fontBold, fontSize: 6.9, bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2 + colFat3, y: y2, w: colFat4, h: tblHeaderH, text: 'Valor Estimado', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2 + colFat3 + colFat4, y: y2, w: colFat5, h: tblHeaderH, text: 'Status Atual', font: fontBold, fontSize: 6.9, align: 'center', bgColor: colorGrayHeader, borderColor: colorBorder });
  y2 += tblHeaderH;

  // Dados da Tabela
  drawCell(page2, pageHeight, { x: contentX, y: y2, w: colFat1, h: tblRowH, text: dataFato, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1, y: y2, w: colFat2, h: tblRowH, text: dataReclamacaoFato, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2, y: y2, w: colFat3, h: tblRowH, text: detalhesFato, font: fontRegular, fontSize: 7.0, bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2 + colFat3, y: y2, w: colFat4, h: tblRowH, text: valorEstimadoFato, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  drawCell(page2, pageHeight, { x: contentX + colFat1 + colFat2 + colFat3 + colFat4, y: y2, w: colFat5, h: tblRowH, text: statusAtualFato, font: fontRegular, fontSize: 7.0, align: 'center', bgColor: colorWhite, borderColor: colorBorder });
  y2 += tblRowH + 8.0;

  // 2. DECLARAÇÃO DO PROPONENTE
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracaoSaude =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  y2 = drawTextCard(
    page2,
    pageHeight,
    contentX,
    y2,
    contentW,
    64.0,
    textoDeclaracaoSaude,
    fontRegular,
    7.6,
    11.2,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );
  y2 += 6.0;

  // 3. CONDIÇÕES DE COMERCIALIZAÇÃO
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y2 = drawCondicoesComercializacao(page2, pageHeight, contentX, y2, contentW, condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);
  y2 += 22.0;

  // 4. ASSINATURAS COM ÂNCORAS ZAPSIGN
  drawAssinaturas(
    page2,
    pageWidth,
    pageHeight,
    y2,
    condicoes.corretora,
    proponenteData.nome,
    params.cidadeDataStr,
    fontRegular,
    fontBold
  );
}

// =========================================================================
// RENDERIZADOR 3: PROPOSTA RC ADVOGADO FACILITIES - SITE RC - OFICIAL (2 PÁGINAS)
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
    ramoConfig?: RamoConfig | null;
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
      processoConselho?: string;
      processoConselhoDetalhe?: string;
      reclamacaoErroMedico?: string;
      reclamacaoErroMedicoDetalhe?: string;
      complicacoesCirurgicas?: string;
      complicacoesCirurgicasDetalhe?: string;
      fatoPotencial?: string;
      fatoPotencialDetalhe?: string;
      pagamentoIndenizacao?: string;
      pagamentoIndenizacaoDetalhe?: string;
    };
  },
  fontRegular: PDFFont,
  fontBold: PDFFont,
  colorGrayHeader: Color,
  colorWhite: Color,
  colorBorder: Color
) {
  const isMedico =
    params.ramoConfig?.ramoId === 'rc-medicos' ||
    params.cotacao?.product_id === 'prod-rc-med-001' ||
    params.clientData?.flowKey === 'rc-medicos' ||
    params.clientData?.flowKey === 'rc_medicos_v1';

  const contentX = 40.0;
  const contentW = pageWidth - 80.0; // 515.28 pt

  // =======================================================================
  // --- PÁGINA 1: PROPONENTE, INFORMAÇÕES PROFISSIONAIS, ATUAÇÕES, PPE ---
  // =======================================================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page1, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  const grupoTarifarioStr = String(params.clientData?.grupoTarifario || params.clientData?.grupo || '').toUpperCase();
  const isDentistaProf = grupoTarifarioStr === 'G2' || Boolean(params.clientData?.cro);
  const isOutroSaudeProf = grupoTarifarioStr === 'G1';
  const grupoTarifarioLabel = String(params.clientData?.grupoTarifarioLabel || '');

  let y1 = 86.0;
  y1 = drawTitleBlock(page1, pageWidth, pageHeight, y1, fontRegular, fontBold, params.ramoConfig, grupoTarifarioStr);
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'PROPONENTE', fontBold, colorGrayHeader, colorBorder);
  y1 = drawProponenteBlock(page1, pageHeight, contentX, y1, contentW, params.proponenteData, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y1 += 4.0;
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'INFORMAÇÕES PROFISSIONAIS', fontBold, colorGrayHeader, colorBorder);

  // Pergunta 1: Escritório associado / Clínica associada
  const profLabelW = 230.0;
  const profValW = contentW - profLabelW;
  const profRowH = 15.5;

  const perguntaAssociacao = isMedico
    ? (isDentistaProf
        ? 'O dentista atua em clínica ou consultório associado?'
        : isOutroSaudeProf
          ? 'O profissional atua em clínica, consultório ou hospital associado?'
          : 'O médico atua em clínica, consultório ou hospital associado?')
    : 'O profissional é associado a algum escritório?';

  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: profLabelW,
    h: profRowH,
    text: perguntaAssociacao,
    font: fontBold,
    fontSize: 7.5,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + profLabelW,
    y: y1,
    w: profValW,
    h: profRowH,
    text: params.infoProfissional.escritorio,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y1 += profRowH;

  // Linha 2: Faturamento Antes
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: profLabelW,
    h: profRowH,
    text: isMedico
      ? (isDentistaProf || isOutroSaudeProf
          ? 'Faturamento Bruto de honorários profissionais nos últimos 12 meses:'
          : 'Faturamento Bruto de honorários médicos nos últimos 12 meses:')
      : 'Faturamento Bruto referente aos últimos 12 meses:',
    font: fontBold,
    fontSize: 7.3,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + profLabelW,
    y: y1,
    w: profValW,
    h: profRowH,
    text: params.infoProfissional.faturamentoAntes,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y1 += profRowH;

  // Linha 3: Faturamento Depois
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: profLabelW,
    h: profRowH,
    text: isMedico
      ? (isDentistaProf || isOutroSaudeProf
          ? 'Faturamento Bruto estimado para os próximos 12 meses:'
          : 'Faturamento Bruto estimado para os próximos 12 meses:')
      : 'Faturamento Bruto Estimado nos próximos 12 meses:',
    font: fontBold,
    fontSize: 7.3,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + profLabelW,
    y: y1,
    w: profValW,
    h: profRowH,
    text: params.infoProfissional.faturamentoDepois,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });
  y1 += profRowH;

  // Linha Categoria / Titularidade
  if (params.infoProfissional.titularidade || grupoTarifarioLabel) {
    const infoCat = [grupoTarifarioLabel, params.infoProfissional.titularidade].filter(Boolean).join(' • ');
    drawCell(page1, pageHeight, {
      x: contentX,
      y: y1,
      w: profLabelW,
      h: profRowH,
      text: isMedico ? 'Categoria / Titulação:' : 'Titularidade / Cargo:',
      font: fontBold,
      fontSize: 7.3,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page1, pageHeight, {
      x: contentX + profLabelW,
      y: y1,
      w: profValW,
      h: profRowH,
      text: infoCat,
      font: fontRegular,
      fontSize: 7.7,
      bgColor: colorWhite,
      borderColor: colorBorder,
    });
    y1 += profRowH;
  }
  y1 += 6.0;

  // Áreas de Atuação / Especialidades Médicas
  const secTitle = isMedico ? 'ESPECIALIDADES MÉDICAS' : 'ATUAÇÕES PROFISSIONAIS';
  const secSub = isMedico
    ? 'Favor indicar as especialidades de atuação médica do profissional:'
    : 'Favor indicar à atuação do Profissional nas áreas abaixo:';

  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, secTitle, fontBold, colorGrayHeader, colorBorder);

  page1.drawText(secSub, {
    x: contentX + 4.0,
    y: pageHeight - y1 - 9.0,
    size: 7.8,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });
  y1 += 14.0;

  const areasConfig = isMedico
    ? (rcMedicosConfig.especialidades || []).map((e) => ({ key: e.key, label: e.label }))
    : [
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

  const gridCols = 3;
  const gridRows = Math.ceil(areasConfig.length / gridCols);
  const gridColW = contentW / gridCols;
  const gridRowH = isMedico ? 13.5 : 14.5;
  const fontSizeGrid = isMedico ? 6.7 : 7.7;

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const idx = row * gridCols + col;
      if (idx >= areasConfig.length) {
        drawCell(page1, pageHeight, {
          x: contentX + col * gridColW,
          y: y1,
          w: gridColW,
          h: gridRowH,
          text: '',
          font: fontRegular,
          fontSize: fontSizeGrid,
          bgColor: colorWhite,
          borderColor: colorBorder,
        });
        continue;
      }
      const area = areasConfig[idx];
      const isChecked = params.areasAtuacao.includes(area.key);
      const mark = isChecked ? '(X)' : '(  )';
      const cellText = `${mark}  ${area.label}`;

      drawCell(page1, pageHeight, {
        x: contentX + col * gridColW,
        y: y1,
        w: gridColW,
        h: gridRowH,
        text: cellText,
        font: isChecked ? fontBold : fontRegular,
        fontSize: fontSizeGrid,
        bgColor: isChecked ? rgb(0.94, 0.97, 0.98) : colorWhite,
        borderColor: colorBorder,
        paddingX: 4,
      });
    }
    y1 += gridRowH;
  }
  y1 += 6.0;

  // PPE - Pessoa Politicamente Exposta
  y1 = drawSectionHeader(page1, pageHeight, contentX, y1, contentW, 'PPE – PESSOA POLITICAMENTE EXPOSTA', fontBold, colorGrayHeader, colorBorder);

  const textoSusepPpe =
    'Conforme o Art. 4º da Circular SUSEP 612/20, consideram-se expostas politicamente as pessoas naturais que ocupem ou tenham ocupado, nos 5 (cinco) anos anteriores, empregos ou funções públicas relevantes, assim como funções relevantes em organizações internacionais, para fins de classificação, conforme o Art. 23, também serão consideradas expostas politicamente os representantes legais, familiares ou estreitos colaboradores dessas pessoas.';

  y1 = drawTextCard(
    page1,
    pageHeight,
    contentX,
    y1,
    contentW,
    44.0,
    textoSusepPpe,
    fontRegular,
    6.8,
    9.5,
    rgb(0.97, 0.97, 0.97),
    colorBorder,
    rgb(0.2, 0.2, 0.2)
  );

  // Perguntas PPE (2 colunas)
  const ppeColW = contentW / 2;
  const ppeHeaderH = 24.0;
  const ppeValH = 15.0;

  // Coluna 1
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: ppeColW,
    h: ppeHeaderH,
    text: 'Desempenha ou já desempenhou algum dos cargos relacionados a PPE, nos últimos 5 anos?',
    font: fontBold,
    fontSize: 6.9,
    lineHeight: 8.5,
    paddingX: 6,
    paddingY: 3,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1 + ppeHeaderH,
    w: ppeColW,
    h: ppeValH,
    text: params.ppe.ppeCargos,
    font: fontRegular,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });

  // Coluna 2
  drawCell(page1, pageHeight, {
    x: contentX + ppeColW,
    y: y1,
    w: ppeColW,
    h: ppeHeaderH,
    text: 'É representante legal, familiar ou estreito colaborador de ocupante de algum cargo relacionado a PPE, nos últimos 5 anos?',
    font: fontBold,
    fontSize: 6.9,
    lineHeight: 8.5,
    paddingX: 6,
    paddingY: 3,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + ppeColW,
    y: y1 + ppeHeaderH,
    w: ppeColW,
    h: ppeValH,
    text: params.ppe.ppeRepresenta,
    font: fontRegular,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y1 += ppeHeaderH + ppeValH + 4.0;

  // Cargos PPE selecionados
  drawCell(page1, pageHeight, {
    x: contentX,
    y: y1,
    w: 130.0,
    h: 16.0,
    text: 'Cargos PPE selecionados:',
    font: fontBold,
    fontSize: 7.7,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page1, pageHeight, {
    x: contentX + 130.0,
    y: y1,
    w: contentW - 130.0,
    h: 16.0,
    text: params.ppe.ppeCargoSelect,
    font: fontRegular,
    fontSize: 7.7,
    bgColor: colorWhite,
    borderColor: colorBorder,
  });

  // =======================================================================
  // --- PÁGINA 2: SEGURO ANTERIOR, HISTÓRICO, DECLARAÇÃO, CONDIÇÕES, ASSINATURAS ---
  // =======================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderTimbradoHeaderAndFooter(page2, pageWidth, pageHeight, assets, params.corretora, fontRegular, fontBold);

  let y2 = 86.0;
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'INFORMAÇÕES DO SEGURO DE RESPONSABILIDADE CIVIL ANTERIOR', fontBold, colorGrayHeader, colorBorder);
  y2 = drawSeguroAnterior(page2, pageHeight, contentX, y2, contentW, params.seguroAnterior, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  // Recusa de proposta
  const recusaValW = 65.0;
  const recusaLabelW = contentW - recusaValW;
  const textoRecusa = isMedico
    ? 'Já teve proposta de seguro de RC Médico recusada, cancelada ou não renovada por seguradora?'
    : 'Foi recusada alguma proposta para seguro semelhante feita pelo profissional?';

  drawCell(page2, pageHeight, {
    x: contentX,
    y: y2,
    w: recusaLabelW,
    h: 15.5,
    text: textoRecusa,
    font: fontBold,
    fontSize: 7.4,
    bgColor: colorGrayHeader,
    borderColor: colorBorder,
  });
  drawCell(page2, pageHeight, {
    x: contentX + recusaLabelW,
    y: y2,
    w: recusaValW,
    h: 15.5,
    text: params.questionario.propostaRecusada,
    font: fontBold,
    fontSize: 7.6,
    bgColor: colorWhite,
    borderColor: colorBorder,
    align: 'center',
  });
  y2 += 15.5;

  if (params.questionario.propostaRecusada === 'Sim') {
    drawCell(page2, pageHeight, {
      x: contentX,
      y: y2,
      w: 120.0,
      h: 15.5,
      text: 'Se afirmativo, detalhes:',
      font: fontRegular,
      fontSize: 7.4,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page2, pageHeight, {
      x: contentX + 120.0,
      y: y2,
      w: contentW - 120.0,
      h: 15.5,
      text: params.questionario.propostaDetalhe,
      font: fontRegular,
      fontSize: 7.4,
      bgColor: colorWhite,
      borderColor: colorBorder,
    });
    y2 += 15.5;
  }
  y2 += 4.0;

  // Histórico de Reclamação / Questionário de Risco
  const questValW = 65.0;
  const questLabelW = contentW - questValW;

  if (isMedico) {
    y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'QUESTIONÁRIO DE RISCO MÉDICO (UNDERWRITING)', fontBold, colorGrayHeader, colorBorder);

    const perguntasMedicas = [
      {
        pergunta: 'Já foi intimado, respondeu ou responde a sindicância ou Processo Ético (PEP) no CRM, CRO ou Conselho Profissional?',
        resp: params.questionario.processoConselho || 'Não',
        detalhe: params.questionario.processoConselhoDetalhe,
      },
      {
        pergunta: 'Sofreu reclamação formal, processo cível de indenização ou inquérito por alegado erro profissional (5 anos)?',
        resp: params.questionario.reclamacaoErroMedico || 'Não',
        detalhe: params.questionario.reclamacaoErroMedicoDetalhe,
      },
      {
        pergunta: 'Nos últimos 3 anos vivenciou evento adverso grave em procedimentos (óbito perioperatório, infecção complexa)?',
        resp: params.questionario.complicacoesCirurgicas || 'Não',
        detalhe: params.questionario.complicacoesCirurgicasDetalhe,
      },
      {
        pergunta: 'Tem ciência de notificação extrajudicial ou reclamação em ouvidoria que possa originar processo indenizatório?',
        resp: params.questionario.fatoPotencial || 'Não',
        detalhe: params.questionario.fatoPotencialDetalhe,
      },
      {
        pergunta: 'Já realizou algum pagamento particular de indenização ou acordo direto com paciente por alegado erro profissional?',
        resp: params.questionario.pagamentoIndenizacao || 'Não',
        detalhe: params.questionario.pagamentoIndenizacaoDetalhe,
      },
    ];

    for (const q of perguntasMedicas) {
      drawCell(page2, pageHeight, {
        x: contentX,
        y: y2,
        w: questLabelW,
        h: 15.5,
        text: q.pergunta,
        font: fontBold,
        fontSize: 7.1,
        bgColor: colorGrayHeader,
        borderColor: colorBorder,
      });
      drawCell(page2, pageHeight, {
        x: contentX + questLabelW,
        y: y2,
        w: questValW,
        h: 15.5,
        text: q.resp,
        font: fontBold,
        fontSize: 7.4,
        bgColor: colorWhite,
        borderColor: colorBorder,
        align: 'center',
      });
      y2 += 15.5;

      if (q.resp === 'Sim' && q.detalhe && q.detalhe !== 'Não se aplica') {
        drawCell(page2, pageHeight, {
          x: contentX,
          y: y2,
          w: 120.0,
          h: 14.5,
          text: 'Se afirmativo, detalhes:',
          font: fontRegular,
          fontSize: 7.2,
          bgColor: colorGrayHeader,
          borderColor: colorBorder,
        });
        drawCell(page2, pageHeight, {
          x: contentX + 120.0,
          y: y2,
          w: contentW - 120.0,
          h: 14.5,
          text: q.detalhe,
          font: fontRegular,
          fontSize: 7.2,
          bgColor: colorWhite,
          borderColor: colorBorder,
        });
        y2 += 14.5;
      }
    }
    y2 += 4.0;
  } else {
    // Advogados (Original)
    y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'HISTÓRICO DE RECLAMAÇÃO', fontBold, colorGrayHeader, colorBorder);

    // Pergunta 1: Reclamações contra o profissional
    drawCell(page2, pageHeight, {
      x: contentX,
      y: y2,
      w: questLabelW,
      h: 16.0,
      text: 'Existem reclamações contra o profissional por danos causados pela prestação de seus serviços?',
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page2, pageHeight, {
      x: contentX + questLabelW,
      y: y2,
      w: questValW,
      h: 16.0,
      text: params.questionario.reclamacaoProfissional,
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorWhite,
      borderColor: colorBorder,
      align: 'center',
    });
    y2 += 16.0;

    // Pergunta 2: Ação disciplinar ou investigações
    drawCell(page2, pageHeight, {
      x: contentX,
      y: y2,
      w: questLabelW,
      h: 17.0,
      text: 'O profissional sofreu reclamação(ões), ação disciplinar ou investigações por qualquer autoridade fiscal de órgão oficial, conselhos e instituições?',
      font: fontBold,
      fontSize: 7.1,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page2, pageHeight, {
      x: contentX + questLabelW,
      y: y2,
      w: questValW,
      h: 17.0,
      text: params.questionario.investigacaoAutoridade,
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorWhite,
      borderColor: colorBorder,
      align: 'center',
    });
    y2 += 17.0;

    // Pergunta 3: Conhecimento de fatos ou circunstâncias
    drawCell(page2, pageHeight, {
      x: contentX,
      y: y2,
      w: questLabelW,
      h: 16.0,
      text: 'O profissional tem conhecimento de algum fato ou circunstância que possa gerar reclamação de terceiros?',
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page2, pageHeight, {
      x: contentX + questLabelW,
      y: y2,
      w: questValW,
      h: 16.0,
      text: params.questionario.fatoTerceiros,
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorWhite,
      borderColor: colorBorder,
      align: 'center',
    });
    y2 += 16.0;

    // Pergunta 4: Pagamento com Fundos Próprios
    drawCell(page2, pageHeight, {
      x: contentX,
      y: y2,
      w: questLabelW,
      h: 16.0,
      text: 'O profissional alguma vez pagou por uma reclamação com fundos próprios?',
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorGrayHeader,
      borderColor: colorBorder,
    });
    drawCell(page2, pageHeight, {
      x: contentX + questLabelW,
      y: y2,
      w: questValW,
      h: 16.0,
      text: params.questionario.pagouReclamacao,
      font: fontBold,
      fontSize: 7.4,
      bgColor: colorWhite,
      borderColor: colorBorder,
      align: 'center',
    });
    y2 += 16.0 + 4.0;
  }

  // Declaração do Proponente
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'DECLARAÇÃO DO PROPONENTE', fontBold, colorGrayHeader, colorBorder);

  const textoDeclaracaoOficial =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  y2 = drawTextCard(
    page2,
    pageHeight,
    contentX,
    y2,
    contentW,
    64.0,
    textoDeclaracaoOficial,
    fontRegular,
    7.5,
    11.0,
    colorWhite,
    colorBorder,
    rgb(0.12, 0.12, 0.12)
  );

  y2 += 4.0;
  // Condições de Comercialização
  y2 = drawSectionHeader(page2, pageHeight, contentX, y2, contentW, 'CONDIÇÕES DE COMERCIALIZAÇÃO', fontBold, colorGrayHeader, colorBorder);
  y2 = drawCondicoesComercializacao(page2, pageHeight, contentX, y2, contentW, params.condicoes, fontRegular, fontBold, colorGrayHeader, colorWhite, colorBorder);

  y2 += 16.0;
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

  // Resolução declarativa do Ramo do Produto
  const flowKey = clientData.flowKey || (cotacao as any).flow_key || null;
  const productId = clientData.productId || (cotacao as any).product_id || null;
  const ramoConfig = getRamoConfig(productId || flowKey || 'rc-advogados') || rcAdvogadosConfig;
  const isMedico =
    ramoConfig.ramoId === 'rc-medicos' ||
    (ramoConfig as any).key === 'rc-medicos' ||
    productId === 'prod-rc-med-001' ||
    flowKey === 'rc-medicos' ||
    flowKey === 'rc_medicos_v1';

  const grupoTarifario = String(clientData.grupoTarifario || clientData.grupo || '').toUpperCase();
  const isDentista = grupoTarifario === 'G2' || (!grupoTarifario && Boolean(clientData.cro));
  const isOutrosSaude = grupoTarifario === 'G1';
  let registroLabel = 'OAB:';
  let registroValor = String(clientData.oab || clientData.registroProfissionalNumero || 'Não informado');

  if (isMedico) {
    if (isDentista) {
      const croUfVal = clientData.croUf || clientData.registroProfissionalUf || clientData.crmUf || 'SP';
      registroLabel = 'CRO:';
      const num = clientData.cro || clientData.registroProfissionalNumero || '';
      registroValor = num ? `${num}/${croUfVal}` : 'Não informado';
    } else if (isOutrosSaude) {
      const ufVal = clientData.registroProfissionalUf || clientData.crmUf || '';
      const ufStr = ufVal ? `/${ufVal}` : '';
      registroLabel = 'Conselho:';
      const num = clientData.registroProfissionalNumero || '';
      registroValor = num ? `${num}${ufStr}` : 'Não informado';
    } else {
      const crmUf = clientData.crmUf ? `/${clientData.crmUf}` : '';
      const crmStr = clientData.crm ? `${clientData.crm}${crmUf}` : '';
      const rqeStr = clientData.rqe ? ` (RQE: ${clientData.rqe})` : '';
      registroLabel = 'CRM:';
      registroValor = crmStr
        ? `${crmStr}${rqeStr}`
        : (clientData.registroProfissionalNumero ? `${clientData.registroProfissionalNumero}${rqeStr}` : 'Não informado');
    }
  }

  // Proponente
  const proponenteData = {
    nome: cotacao.client_name,
    email: cotacao.client_email || clientData.email || 'Não informado',
    celular: cotacao.client_phone || clientData.celular || clientData.telefone || 'Não informado',
    cpf: formatCpf(cotacao.client_cpf_cnpj || clientData.cpf),
    oab: registroValor,
    registroLabel,
    registroValor,
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

  if (tipoContrato === 'termo_saude') {
    renderTermoSaude(
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
        ramoConfig,
      },
      fontRegular,
      fontBold,
      colorGrayHeader,
      colorWhite,
      colorBorder
    );
  } else if (tipoContrato === '100k') {
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

    const questionarioRisco = (clientData.questionarioRisco && typeof clientData.questionarioRisco === 'object'
      ? clientData.questionarioRisco
      : {}) as Record<string, any>;

    const resolveSimNaoPdf = (...candidates: any[]): 'Sim' | 'Não' => {
      for (const raw of candidates) {
        if (raw === undefined || raw === null || raw === '') continue;
        if (raw === true || raw === 1) return 'Sim';
        if (raw === false || raw === 0) return 'Não';
        const norm = String(raw)
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (!norm) continue;
        if (norm === 'sim' || norm === 's' || norm === 'true' || norm === '1' || norm === 'yes' || norm === 'y') {
          return 'Sim';
        }
        if (norm === 'nao' || norm === 'n' || norm === 'false' || norm === '0' || norm === 'no') {
          return 'Não';
        }
      }
      return 'Não';
    };

    const resolveDetalhePdf = (...candidates: any[]): string => {
      for (const raw of candidates) {
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return String(raw).trim();
        }
      }
      return 'Não se aplica';
    };

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
        ramoConfig,
        infoProfissional: {
          escritorio: isMedico
            ? (clientData.associadoClinica === 'Sim' || clientData.associadoEscritorio === 'Sim'
                ? (clientData.nomeClinica || clientData.nomeHospital || clientData.nomeEscritorio || clientData.escritorioAssociado || 'Sim (Associado a clínica/hospital)')
                : 'Não associado')
            : (clientData.associadoEscritorio === 'Sim'
                ? (clientData.nomeEscritorio || clientData.escritorioAssociado || clientData.escritorio || 'Sim (Associado a escritório)')
                : (clientData.escritorioAssociado && clientData.escritorioAssociado !== 'Não associado' && clientData.escritorioAssociado !== 'Não'
                    ? clientData.escritorioAssociado
                    : 'Não associado')),
          titularidade: clientData.titularidade || 'Não possui',
          faturamentoAntes: clientData.faturamentoAntes || 'Não informado',
          faturamentoDepois: clientData.faturamentoDepois || 'Não informado',
        },
        areasAtuacao,
        ppe: {
          ppeCargos: resolveSimNaoPdf(clientData.ppeCargos, clientData.ppe),
          ppeRepresenta: resolveSimNaoPdf(clientData.ppeRepresenta, clientData.ppeRelacionado),
          ppeCargoSelect: ppeDescricao,
        },
        questionario: {
          propostaRecusada: resolveSimNaoPdf(clientData.propostaRecusada, questionarioRisco.propostaRecusada),
          propostaDetalhe: resolveDetalhePdf(clientData.propostaDetalhe, questionarioRisco.propostaDetalhe),
          reclamacaoProfissional: resolveSimNaoPdf(clientData.reclamacaoProfissional, questionarioRisco.reclamacaoProfissional),
          reclamacaoDetalhe: resolveDetalhePdf(clientData.reclamacaoDetalhe, questionarioRisco.reclamacaoDetalhe),
          investigacaoAutoridade: resolveSimNaoPdf(clientData.investigacaoAutoridade, questionarioRisco.investigacaoAutoridade),
          investigacaoDetalhe: resolveDetalhePdf(clientData.investigacaoDetalhe, questionarioRisco.investigacaoDetalhe),
          fatoTerceiros: resolveSimNaoPdf(clientData.fatoTerceiros, questionarioRisco.fatoTerceiros),
          fatoDetalhe: resolveDetalhePdf(clientData.fatoDetalhe, questionarioRisco.fatoDetalhe),
          pagouReclamacao: resolveSimNaoPdf(clientData.pagouReclamacao, questionarioRisco.pagouReclamacao),
          pagouDetalhe: resolveDetalhePdf(clientData.pagouDetalhe, questionarioRisco.pagouDetalhe),
          processoConselho: resolveSimNaoPdf(clientData.processoConselho, questionarioRisco.processoConselho),
          processoConselhoDetalhe: resolveDetalhePdf(clientData.processoConselhoDetalhe, questionarioRisco.processoConselhoDetalhe),
          reclamacaoErroMedico: resolveSimNaoPdf(clientData.reclamacaoErroMedico, questionarioRisco.reclamacaoErroMedico),
          reclamacaoErroMedicoDetalhe: resolveDetalhePdf(clientData.reclamacaoErroMedicoDetalhe, questionarioRisco.reclamacaoErroMedicoDetalhe),
          complicacoesCirurgicas: resolveSimNaoPdf(clientData.complicacoesCirurgicas, questionarioRisco.complicacoesCirurgicas),
          complicacoesCirurgicasDetalhe: resolveDetalhePdf(clientData.complicacoesCirurgicasDetalhe, questionarioRisco.complicacoesCirurgicasDetalhe),
          fatoPotencial: resolveSimNaoPdf(clientData.fatoPotencial, questionarioRisco.fatoPotencial),
          fatoPotencialDetalhe: resolveDetalhePdf(clientData.fatoPotencialDetalhe, questionarioRisco.fatoPotencialDetalhe),
          pagamentoIndenizacao: resolveSimNaoPdf(clientData.pagamentoIndenizacao, questionarioRisco.pagamentoIndenizacao),
          pagamentoIndenizacaoDetalhe: resolveDetalhePdf(clientData.pagamentoIndenizacaoDetalhe, questionarioRisco.pagamentoIndenizacaoDetalhe),
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
  const tipoDocSufixo = tipoContrato === 'termo_saude'
    ? 'Saude_TermoAdesao'
    : isMedico
      ? 'Medico_Oficial'
      : tipoContrato === '100k'
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
    signatarioCorretora: {
      nome: corretora.nomeFantasia || corretora.razaoSocial,
      email: corretora.email || 'contato@net4life.com.br',
      phone: corretora.phone,
    },
    signatarioProponente: {
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
  const flowKey = clientData.flowKey || cotacao.flow_key || null;
  const productId = clientData.productId || cotacao.product_id || null;

  const grupoTarifario = String(clientData.grupoTarifario || clientData.grupo || '') || null;

  const preco = await calcularPrecoServidor({
    tipoDePlano: clientData.tipo || clientData.tipoDePlano || null,
    qtdParcelasSolicitada: Number(clientData.parcela) || 1,
    cupomCodigo: clientData.cupomCodigo || null,
    descontoManualPercent: Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0,
    flowKey,
    productId,
    grupoTarifario,
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
