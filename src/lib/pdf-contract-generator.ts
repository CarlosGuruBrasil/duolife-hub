import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, Color } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { getCorretoraParaContrato, CorretoraContratoInfo } from './corretora-resolver';
import { logger } from './logger';

export interface ContratoPdfResult {
  buffer: Buffer;
  base64: string;
  docName: string;
  signatario: {
    nome: string;
    email: string;
    phone: string;
    cpfCnpj: string;
  };
}

export interface RenderContratoPdfParams {
  cotacao: {
    id: string;
    client_name: string;
    client_cpf_cnpj: string;
    client_email?: string | null;
    client_phone?: string | null;
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

const MESES_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

const MESES_PT_MIN = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

interface CellConfig {
  x: number;
  y: number; // Y do topo da célula (top-down ou invertido)
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
 * Helper para desenhar célula com borda e preenchimento no sistema bottom-up do pdf-lib.
 * yTop é a coordenada Y do topo da célula (0 no topo da página, 841 na base).
 */
function drawCell(page: PDFPage, pageHeight: number, c: CellConfig) {
  const yBottom = pageHeight - c.y - c.h;
  const borderWidth = c.borderWidth ?? 0.55;
  const borderColor = c.borderColor ?? rgb(0.08, 0.08, 0.08);

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
  if (c.text && c.font && c.fontSize) {
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
      color: c.textColor ?? rgb(0, 0, 0),
    });
  }
}

/**
 * Renderiza o PDF oficial do contrato KEV Seguros + DuoLife + Corretora em 2 páginas A4 idênticas ao modelo.
 */
export async function renderContratoPdf(params: RenderContratoPdfParams): Promise<ContratoPdfResult> {
  const {
    cotacao,
    clientData,
    corretora,
    valorTotal,
    qtdParcelas,
    valorParcela,
    valorTotalComJuros,
  } = params;

  // Dimensões A4: 595.28 x 841.89 pt
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Paleta de Cores do Modelo Oficial KEV / DuoLife
  const colorGrayHeader = rgb(0.929, 0.929, 0.929); // #ECECEC (Rótulos e cabeçalhos de tabela)
  const colorWhite = rgb(1, 1, 1);
  const colorBlack = rgb(0, 0, 0);
  const colorBorder = rgb(0.08, 0.08, 0.08); // #141414
  const colorGreenBar = rgb(0.733, 0.878, 0.494); // #BBE07E (Barra "OPÇÕES DE CONTRATAÇÃO")
  const colorGrayCols = rgb(0.859, 0.859, 0.859); // #DBDBDB (Cabeçalho de colunas de cobertura)
  const colorMuted = rgb(0.35, 0.35, 0.35);

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
    // Seta esquerda
  }

  try {
    const chRBytes = await fs.readFile(path.join(imagesDir, 'chevron-right.jpg'));
    chevronRightImage = await pdfDoc.embedJpg(chRBytes);
  } catch (err) {
    // Seta direita
  }

  // Carrega logo da corretora se disponível no banco
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

  // --- TRATAMENTO DINÂMICO DE DADOS ---
  const hoje = new Date();
  const mesAtualNome = MESES_PT[hoje.getMonth()];
  const mesAtualMin = MESES_PT_MIN[hoje.getMonth()];
  const diaHoje = hoje.getDate();
  const anoHoje = hoje.getFullYear();

  // Atividade do segurado (maiúsculo)
  const atividade = (
    clientData.profissao ||
    clientData.atividade ||
    clientData.tipoDePlano ||
    clientData.especialidade ||
    'ADVOGADO'
  ).toUpperCase();

  const atividadeObjetoRaw = (
    clientData.profissao ||
    clientData.atividade ||
    clientData.tipoDePlano ||
    clientData.especialidade ||
    'Advocacia'
  );

  let atividadeObjeto = atividadeObjetoRaw;
  if (/advogad/i.test(atividadeObjetoRaw)) atividadeObjeto = 'Advocacia';
  else if (/m[eé]dic/i.test(atividadeObjetoRaw)) atividadeObjeto = 'Medicina';
  else if (/dentist|odonto/i.test(atividadeObjetoRaw)) atividadeObjeto = 'Odontologia';
  else if (/engenheir/i.test(atividadeObjetoRaw)) atividadeObjeto = 'Engenharia';
  else if (/contador|cont[aá]bil/i.test(atividadeObjetoRaw)) atividadeObjeto = 'Contabilidade';

  // Vigência do Certificado: início hoje ou data informada, fim = +1 ano
  const dataInicioStr = clientData.dataInicio
    ? formatData(clientData.dataInicio)
    : formatData(hoje);

  let dataFimStr = '';
  if (dataInicioStr && dataInicioStr.includes('/')) {
    const [d, m, a] = dataInicioStr.split('/');
    dataFimStr = `${d}/${m}/${Number(a) + 1}`;
  } else {
    dataFimStr = formatData(new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate()));
  }

  // Retroatividade: se contratada ou informada, ou 1 ano antes
  let dataRetroatividadeStr = clientData.retroatividade || clientData.dataRetroatividade;
  if (dataRetroatividadeStr) {
    dataRetroatividadeStr = formatData(dataRetroatividadeStr);
  } else if (dataInicioStr && dataInicioStr.includes('/')) {
    const [d, m, a] = dataInicioStr.split('/');
    dataRetroatividadeStr = `${d}/${m}/${Number(a) - 1}`;
  } else {
    dataRetroatividadeStr = dataInicioStr;
  }

  // Limite individual (LMI)
  let limiteIndividual = clientData.cobertura || clientData.lmi || '500.000,00';
  if (typeof limiteIndividual === 'number') {
    limiteIndividual = Number(limiteIndividual).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } else {
    limiteIndividual = String(limiteIndividual).replace(/^[R$\s]+/, '');
  }

  // Franquia
  let franquiaValor = clientData.franquia || '3.000,00';
  if (typeof franquiaValor === 'number') {
    franquiaValor = Number(franquiaValor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } else {
    franquiaValor = String(franquiaValor).replace(/^[R$\s]+/, '');
  }

  // Valores Financeiros
  // No modelo KEV: Prêmio Total = Prêmio Líquido + IOF (7.38% ou fixado)
  const total = valorTotalComJuros > 0 ? valorTotalComJuros : (valorTotal > 0 ? valorTotal : 871.0);
  const premioLiquidoNum = clientData.premioLiquido != null
    ? Number(clientData.premioLiquido)
    : Number((total / 1.0738).toFixed(2));
  const iofNum = clientData.iof != null
    ? Number(clientData.iof)
    : Number((total - premioLiquidoNum).toFixed(2));

  const premioLiquidoStr = formatMoeda(premioLiquidoNum);
  const iofStr = formatMoeda(iofNum);
  const premioTotalStr = formatMoeda(total);

  // Parcelamento
  const parcelasQtd = qtdParcelas > 0 ? qtdParcelas : (Number(clientData.parcela) || 1);
  const parcelaValor = valorParcela > 0 ? valorParcela : (total / parcelasQtd);
  const parcelaValorStr = formatMoeda(parcelaValor);
  const formaPagamentoStr = clientData.formaPagamento || clientData.metodoPagamento || 'Boleto bancário';

  // Data 1ª parcela (vencimento do boleto ou hoje)
  const data1ParcelaStr = clientData.dataPrimeiraParcela
    ? formatData(clientData.dataPrimeiraParcela)
    : dataInicioStr;

  // Dados Corretora
  const corretoraNome = corretora.razaoSocial || 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA';
  const corretoraTel = corretora.phone || '(48) 99139-4912';
  const corretoraEmail = corretora.email || 'contato@net4life.com.br';
  const corretoraEndereco = corretora.endereco || 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05';
  const corretoraCep = corretora.cep || '88050-000';
  const corretoraBairro = corretora.bairro || 'Santo Antônio de Lisboa';
  const corretoraCidade = corretora.cidade || 'Florianópolis';
  const corretoraUf = corretora.uf || 'SC';

  // Helper para renderizar cabeçalho superior e rodapé comum a ambas as páginas
  const renderHeaderAndFooter = (page: PDFPage) => {
    // 1. Background de página inteira
    if (bgImage) {
      page.drawImage(bgImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    }

    // 2. Logos do topo
    // Corretora (Esquerda)
    if (corretoraLogoImage) {
      const imgDims = corretoraLogoImage.scale(1);
      const maxW = 85;
      const maxH = 50;
      const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
      const w = imgDims.width * scale;
      const h = imgDims.height * scale;
      page.drawImage(corretoraLogoImage, {
        x: 43.0,
        y: pageHeight - 65 + (maxH - h) / 2,
        width: w,
        height: h,
      });
    } else {
      // Se a corretora não tiver cadastrado nenhum logo, apenas escrever o nome da Corretora
      const nomeCorretora = sanitizeForPdf(corretora.nomeFantasia || corretora.razaoSocial).toUpperCase();
      const maxTextWidth = 150;
      const words = nomeCorretora.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (fontBold.widthOfTextAtSize(testLine, 9.5) <= maxTextWidth) {
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
          x: 43.0,
          y: startY - i * 11.0,
          size: 9.5,
          font: fontBold,
          color: colorBlack,
        });
      }
    }

    // DuoLife (Centro)
    if (duolifeLogoImage) {
      const imgDims = duolifeLogoImage.scale(1);
      const maxW = 90;
      const maxH = 50;
      const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
      const w = imgDims.width * scale;
      const h = imgDims.height * scale;
      page.drawImage(duolifeLogoImage, {
        x: 350.0,
        y: pageHeight - 65 + (maxH - h) / 2,
        width: w,
        height: h,
      });
    }

    // KEV Seguros (Direita)
    if (kevLogoImage) {
      const imgDims = kevLogoImage.scale(1);
      const maxW = 105;
      const maxH = 26;
      const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
      const w = imgDims.width * scale;
      const h = imgDims.height * scale;
      page.drawImage(kevLogoImage, {
        x: 445.0,
        y: pageHeight - 52 + (maxH - h) / 2,
        width: w,
        height: h,
      });
    }

    // 3. Rodapé Oficial KEV
    // Seta esquerda
    if (chevronLeftImage) {
      page.drawImage(chevronLeftImage, {
        x: 91.4,
        y: 35.0,
        width: 8.7,
        height: 12.7,
      });
    }

    // Seta direita
    if (chevronRightImage) {
      page.drawImage(chevronRightImage, {
        x: 487.9,
        y: 35.0,
        width: 8.7,
        height: 12.7,
      });
    }

    // Endereço KEV
    const rodapeLinha1 = 'Avenida Brigadeiro Faria Lima, 3477, Torre B, 2º andar. Itaim Bibi, São Paulo - SP, 04538-133';
    const w1 = fontRegular.widthOfTextAtSize(rodapeLinha1, 8.2);
    page.drawText(rodapeLinha1, {
      x: (pageWidth - w1) / 2,
      y: 42.0,
      size: 8.2,
      font: fontRegular,
      color: colorBlack,
    });

    const rodapeLinha2 = 'kevseguros.com.br';
    const w2 = fontBold.widthOfTextAtSize(rodapeLinha2, 8.5);
    page.drawText(rodapeLinha2, {
      x: (pageWidth - w2) / 2,
      y: 30.5,
      size: 8.5,
      font: fontBold,
      color: colorBlack,
    });
  };

  // =========================================================================
  // PÁGINA 1: RESPONSABILIDADE CIVIL PROFISSIONAL — ESPECIFICAÇÕES DA APÓLICE COLETIVA
  // =========================================================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderHeaderAndFooter(page1);

  // Título Centralizado
  const t1 = 'RESPONSABILIDADE CIVIL PROFISSIONAL';
  const t1W = fontBold.widthOfTextAtSize(t1, 9.8);
  page1.drawText(t1, {
    x: (pageWidth - t1W) / 2,
    y: pageHeight - 152.0,
    size: 9.8,
    font: fontBold,
    color: colorBlack,
  });

  const t2 = 'ESPECIFICAÇÕES DA APÓLICE COLETIVA';
  const t2W = fontBold.widthOfTextAtSize(t2, 9.4);
  page1.drawText(t2, {
    x: (pageWidth - t2W) / 2,
    y: pageHeight - 168.0,
    size: 9.4,
    font: fontBold,
    color: colorBlack,
  });

  // --- SEÇÃO 1: DADOS DO ESTIPULANTE ---
  page1.drawText('DADOS DO ESTIPULANTE:', {
    x: 36.0,
    y: pageHeight - 198.0,
    size: 9.5,
    font: fontBold,
    color: colorBlack,
  });

  const tableX = 36.0;
  const colLabelW = 96.0;
  const colValW = 427.0; // 523 - 96

  // Linha 1: Nome
  drawCell(page1, pageHeight, { x: tableX, y: 210.9, w: colLabelW, h: 18.0, text: 'Nome:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 210.9, w: colValW, h: 18.0, text: 'DUOLIFE PLATAFORMA DE NEGÓCIOS LTDA', font: fontBold, fontSize: 8.0, bgColor: colorWhite });

  // Linha 2: CNPJ
  drawCell(page1, pageHeight, { x: tableX, y: 228.9, w: colLabelW, h: 18.0, text: 'CNPJ:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 228.9, w: colValW, h: 18.0, text: '00.698.913/0001-23', font: fontBold, fontSize: 8.0, bgColor: colorWhite });

  // Linha 3: Endereço
  drawCell(page1, pageHeight, { x: tableX, y: 246.9, w: colLabelW, h: 18.0, text: 'Endereço:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 246.9, w: colValW, h: 18.0, text: 'Av. Aluísio Pires Condeixa, 2550, Sala 29', font: fontBold, fontSize: 8.0, bgColor: colorWhite });

  // Linha 4: CEP | Bairro | Cidade | UF
  drawCell(page1, pageHeight, { x: 36.0, y: 264.9, w: 96.0, h: 18.0, text: 'CEP:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 264.9, w: 66.0, h: 18.0, text: '89221-750', font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 198.0, y: 264.9, w: 46.0, h: 18.0, text: 'Bairro:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 244.0, y: 264.9, w: 120.0, h: 18.0, text: 'Saguaçu', font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 364.0, y: 264.9, w: 48.0, h: 18.0, text: 'Cidade:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 412.0, y: 264.9, w: 80.0, h: 18.0, text: 'Joinville', font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 492.0, y: 264.9, w: 26.0, h: 18.0, text: 'UF:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 518.0, y: 264.9, w: 41.0, h: 18.0, text: 'SC', font: fontRegular, fontSize: 7.8, bgColor: colorWhite, align: 'center' });

  // --- SEÇÃO 2: DADOS DO CORRETOR ---
  page1.drawText('DADOS DO CORRETOR:', {
    x: 36.0,
    y: pageHeight - 303.0,
    size: 9.5,
    font: fontBold,
    color: colorBlack,
  });

  // Linha 1: Nome Corretor
  drawCell(page1, pageHeight, { x: tableX, y: 315.9, w: colLabelW, h: 18.0, text: 'Nome:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 315.9, w: colValW, h: 18.0, text: sanitizeForPdf(corretoraNome), font: fontBold, fontSize: 7.5, bgColor: colorWhite });

  // Linha 2: Telefone
  drawCell(page1, pageHeight, { x: tableX, y: 333.9, w: colLabelW, h: 18.0, text: 'Telefone:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 333.9, w: colValW, h: 18.0, text: sanitizeForPdf(corretoraTel), font: fontRegular, fontSize: 8.0, bgColor: colorWhite });

  // Linha 3: E-mail
  drawCell(page1, pageHeight, { x: tableX, y: 351.9, w: colLabelW, h: 18.0, text: 'E-mail:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 351.9, w: colValW, h: 18.0, text: sanitizeForPdf(corretoraEmail), font: fontRegular, fontSize: 8.0, bgColor: colorWhite });

  // Linha 4: Endereço
  drawCell(page1, pageHeight, { x: tableX, y: 369.9, w: colLabelW, h: 18.0, text: 'Endereço:', font: fontBold, fontSize: 8.0, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: tableX + colLabelW, y: 369.9, w: colValW, h: 18.0, text: sanitizeForPdf(corretoraEndereco), font: fontRegular, fontSize: 8.0, bgColor: colorWhite });

  // Linha 5: CEP | Bairro | Cidade | UF
  drawCell(page1, pageHeight, { x: 36.0, y: 387.9, w: 96.0, h: 18.0, text: 'CEP:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 387.9, w: 66.0, h: 18.0, text: sanitizeForPdf(corretoraCep), font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 198.0, y: 387.9, w: 46.0, h: 18.0, text: 'Bairro:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 244.0, y: 387.9, w: 120.0, h: 18.0, text: sanitizeForPdf(corretoraBairro), font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 364.0, y: 387.9, w: 48.0, h: 18.0, text: 'Cidade:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 412.0, y: 387.9, w: 80.0, h: 18.0, text: sanitizeForPdf(corretoraCidade), font: fontRegular, fontSize: 7.8, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 492.0, y: 387.9, w: 26.0, h: 18.0, text: 'UF:', font: fontBold, fontSize: 7.8, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 518.0, y: 387.9, w: 41.0, h: 18.0, text: sanitizeForPdf(corretoraUf), font: fontRegular, fontSize: 7.8, bgColor: colorWhite, align: 'center' });

  // --- SEÇÃO 3: DADOS DO OBJETO ---
  page1.drawText('DADOS DO OBJETO:', {
    x: 36.0,
    y: pageHeight - 426.0,
    size: 9.5,
    font: fontBold,
    color: colorBlack,
  });

  // Caixa retangular de Dados do Objeto
  drawCell(page1, pageHeight, {
    x: 36.0,
    y: 438.9,
    w: 523.0,
    h: 118.0,
    bgColor: colorWhite,
  });

  // Texto legal justificado dentro da caixa
  const textoLegalP1 = [
    'A cobertura desta Apólice é limitada às quantias pelas quais o Segurado vier a ser responsável civilmente, em sentença judicial transitada em',
    'julgado ou em acordo autorizado de modo expresso pela Seguradora, resultante de Reclamações de Terceiros, feitas pela primeira vez contra o',
    'Segurado durante o Período de Vigência da Apólice ou durante o Período Adicional de Reclamações (Prazo Complementar, se expressamente',
    'contratado), resultante da Prática de um Ato Danoso, exclusivamente decorrente de conduta profissional do Segurado, ocorrido durante a',
    'Vigência da Apólice.',
    '',
    'Durante o período de Vigência desta Apólice, o Tomador do Seguro e/ou Segurado deverá notificar a Seguradora sobre a ocorrência de quaisquer',
    'atos, fatos ou circunstâncias que possam originar uma Reclamação.'
  ];

  let legalY = pageHeight - 450.0;
  for (const linha of textoLegalP1) {
    if (linha) {
      page1.drawText(sanitizeForPdf(linha), {
        x: 42.0,
        y: legalY,
        size: 6.8,
        font: fontRegular,
        color: colorBlack,
      });
    }
    legalY -= 8.5;
  }

  // Atividade do seguro
  const textoAtividade = `Este seguro tem como objeto a atividade: ${atividadeObjeto}.`;
  const ativW = fontBold.widthOfTextAtSize(textoAtividade, 9.2);
  page1.drawText(sanitizeForPdf(textoAtividade), {
    x: (pageWidth - ativW) / 2,
    y: pageHeight - 520.0,
    size: 9.2,
    font: fontBold,
    color: colorBlack,
  });

  // Link das condições gerais
  const textoCond = 'CONDIÇÕES GERAIS ESTÃO DISPONÍVEIS NO SITE WWW.DUOLIFE.COM.BR';
  const condW = fontBold.widthOfTextAtSize(textoCond, 8.6);
  page1.drawText(textoCond, {
    x: (pageWidth - condW) / 2,
    y: pageHeight - 542.0,
    size: 8.6,
    font: fontBold,
    color: colorBlack,
  });

  // --- SEÇÃO 4: TERMOS E CONDIÇÕES ---
  page1.drawText('TERMOS E CONDIÇÕES:', {
    x: 36.0,
    y: pageHeight - 579.0,
    size: 9.5,
    font: fontBold,
    color: colorBlack,
  });

  // Linha 1: Âmbito
  drawCell(page1, pageHeight, { x: 36.0, y: 591.9, w: 96.0, h: 16.0, text: 'Âmbito de Cobertura:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 591.9, w: 427.0, h: 16.0, text: 'Cobertura de âmbito Nacional', font: fontRegular, fontSize: 7.7, bgColor: colorWhite });

  // Linha 2: Vigência do Certificado
  drawCell(page1, pageHeight, { x: 36.0, y: 607.9, w: 96.0, h: 16.0, text: 'Vigência do Certificado:', font: fontBold, fontSize: 7.3, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 607.9, w: 140.0, h: 16.0, text: 'Início: às 24h00 do dia:', font: fontRegular, fontSize: 7.3, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 272.0, y: 607.9, w: 58.0, h: 16.0, text: dataInicioStr, font: fontRegular, fontSize: 7.3, bgColor: colorWhite, align: 'center' });
  drawCell(page1, pageHeight, { x: 330.0, y: 607.9, w: 145.0, h: 16.0, text: 'Vencimento: às 24h00 do dia:', font: fontRegular, fontSize: 7.3, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 475.0, y: 607.9, w: 84.0, h: 16.0, text: dataFimStr, font: fontRegular, fontSize: 7.3, bgColor: colorWhite, align: 'center' });

  // Linha 3: Vigência do Endosso
  drawCell(page1, pageHeight, { x: 36.0, y: 623.9, w: 96.0, h: 16.0, text: 'Vigência do Endosso:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 623.9, w: 427.0, h: 16.0, text: 'Não se aplica', font: fontRegular, fontSize: 7.7, bgColor: colorWhite });

  // Linha 4: Prazo Complementar
  drawCell(page1, pageHeight, { x: 36.0, y: 639.9, w: 96.0, h: 16.0, text: 'Prazo Complementar:', font: fontBold, fontSize: 7.7, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 639.9, w: 427.0, h: 16.0, text: '12 Meses', font: fontRegular, fontSize: 7.7, bgColor: colorWhite });

  // Tabela Financeira 1 - Valores de Prêmio
  // Cabeçalho
  drawCell(page1, pageHeight, { x: 36.0, y: 665.9, w: 96.0, h: 18.0, text: 'Prêmio:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 665.9, w: 173.0, h: 18.0, text: 'Adicional de Fracionamento:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 305.0, y: 665.9, w: 86.0, h: 18.0, text: 'Custo Emissão:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 391.0, y: 665.9, w: 102.0, h: 18.0, text: 'IOF:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 493.0, y: 665.9, w: 66.0, h: 18.0, text: 'Prêmio Total:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });

  // Valores
  drawCell(page1, pageHeight, { x: 36.0, y: 683.9, w: 96.0, h: 18.0, text: sanitizeForPdf(premioLiquidoStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 132.0, y: 683.9, w: 173.0, h: 18.0, text: '-', font: fontRegular, fontSize: 7.6, bgColor: colorWhite, align: 'center' });
  drawCell(page1, pageHeight, { x: 305.0, y: 683.9, w: 86.0, h: 18.0, text: '-', font: fontRegular, fontSize: 7.6, bgColor: colorWhite, align: 'center' });
  drawCell(page1, pageHeight, { x: 391.0, y: 683.9, w: 102.0, h: 18.0, text: sanitizeForPdf(iofStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 493.0, y: 683.9, w: 66.0, h: 18.0, text: sanitizeForPdf(premioTotalStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });

  // Tabela Financeira 2 - Parcelamento e Pagamento
  // Cabeçalho
  drawCell(page1, pageHeight, { x: 36.0, y: 701.9, w: 96.0, h: 18.0, text: 'Forma de pagamento:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 132.0, y: 701.9, w: 173.0, h: 18.0, text: 'Data 1ª parcela:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 305.0, y: 701.9, w: 86.0, h: 18.0, text: 'Valor 1ª parcela:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 391.0, y: 701.9, w: 102.0, h: 18.0, text: 'Valor demais parcelas:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });
  drawCell(page1, pageHeight, { x: 493.0, y: 701.9, w: 66.0, h: 18.0, text: 'Qtd. parcelas:', font: fontBold, fontSize: 7.6, bgColor: colorGrayHeader });

  // Valores
  drawCell(page1, pageHeight, { x: 36.0, y: 719.9, w: 96.0, h: 18.0, text: sanitizeForPdf(formaPagamentoStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 132.0, y: 719.9, w: 173.0, h: 18.0, text: sanitizeForPdf(data1ParcelaStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 305.0, y: 719.9, w: 86.0, h: 18.0, text: sanitizeForPdf(parcelaValorStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 391.0, y: 719.9, w: 102.0, h: 18.0, text: sanitizeForPdf(parcelaValorStr), font: fontRegular, fontSize: 7.6, bgColor: colorWhite });
  drawCell(page1, pageHeight, { x: 493.0, y: 719.9, w: 66.0, h: 18.0, text: String(parcelasQtd), font: fontRegular, fontSize: 7.6, bgColor: colorWhite, align: 'center' });

  // =========================================================================
  // PÁGINA 2: CERTIFICADO DE SEGURO
  // =========================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  renderHeaderAndFooter(page2);

  // Título Centralizado
  const certTitulo = 'CERTIFICADO DE SEGURO';
  const certTituloW = fontBold.widthOfTextAtSize(certTitulo, 11.0);
  page2.drawText(certTitulo, {
    x: (pageWidth - certTituloW) / 2,
    y: pageHeight - 110.0,
    size: 11.0,
    font: fontBold,
    color: colorBlack,
  });

  // --- SEÇÃO: DADOS DO TOMADOR ---
  page2.drawText('DADOS DO TOMADOR', {
    x: 35.5,
    y: pageHeight - 132.0,
    size: 11.0,
    font: fontBold,
    color: colorBlack,
  });

  const p2TableX = 35.5;
  const p2ColLabelW = 169.8;
  const p2ColValW = 340.7; // 510.5 - 169.8
  const p2RowH = 13.9;

  const dadosTomador = [
    { label: 'APOLICE NÚMERO', val: '1007800004009' },
    { label: 'INÍCIO DE VIGÊNCIA DA APÓLICE', val: '01/12/2025' },
    { label: 'FINAL DE VIGÊNCIA DA APÓLICE', val: '01/12/2027' },
    { label: 'RAZÃO SOCIAL (Tomador)', val: 'Duolife Plataforma de Negócios Ltda' },
    { label: 'CNPJ', val: '00.698.913/0001-23' },
    { label: 'DECLARAÇÃO', val: '1' },
    { label: 'ADESÃO', val: mesAtualNome },
  ];

  let tomadorY = 144.2;
  for (const d of dadosTomador) {
    drawCell(page2, pageHeight, { x: p2TableX, y: tomadorY, w: p2ColLabelW, h: p2RowH, text: d.label, font: fontBold, fontSize: 8.5, bgColor: colorGrayHeader });
    drawCell(page2, pageHeight, { x: p2TableX + p2ColLabelW, y: tomadorY, w: p2ColValW, h: p2RowH, text: d.val, font: fontRegular, fontSize: 8.5, bgColor: colorWhite });
    tomadorY += p2RowH;
  }

  // --- TEXTO LEGAL DECLARAÇÃO ---
  const textoLegalDeclaracao = [
    'DECLARA-SE PARA DEVIDOS FINS E EFEITOS QUE O TOMADOR ACIMA IDENTIFICADO, CONTRATOU APÓLICE DE',
    'SEGUROS, CONFORME DADOS ABAIXO. A APÓLICE IRÁ GARANTIR OS RISCOS DE ACORDO AOS TERMOS E CONDIÇÕES',
    'NELA DESCRITOS.'
  ];

  let declY = pageHeight - 275.0;
  for (const linha of textoLegalDeclaracao) {
    page2.drawText(sanitizeForPdf(linha), {
      x: 35.5,
      y: declY,
      size: 7.8,
      font: fontBold,
      color: colorBlack,
    });
    declY -= 11.0;
  }

  // --- SEÇÃO: DADOS DO SEGURO ---
  page2.drawText('DADOS DO SEGURO', {
    x: 35.5,
    y: pageHeight - 326.0,
    size: 11.0,
    font: fontBold,
    color: colorBlack,
  });

  const dadosSeguro = [
    { label: 'NOME', val: sanitizeForPdf(cotacao.client_name), h: 14.0 },
    { label: 'CPF', val: formatCpf(cotacao.client_cpf_cnpj), h: 14.0 },
    { label: 'DATA DE INGRESSO DO\nSEGURADO NA APÓLICE', val: dataInicioStr, h: 27.0, isMultiLine: true },
    { label: 'ATIVIDADE DO SEGURADO', val: sanitizeForPdf(atividade), h: 14.0 },
    { label: 'TIPO DE APÓLICE', val: 'SEGURO A BASE DE RECLAMAÇÃO COM NOTIFICAÇÃO', h: 14.0 },
    { label: 'DATA DE RETROATIVIDADE', val: dataRetroatividadeStr, h: 14.0 },
    { label: 'ÂMBITO DE COBERTURA', val: 'NACIONAL, COM JURISDIÇÃO LOCAL', h: 14.0 },
  ];

  let seguroY = 338.6;
  for (const d of dadosSeguro) {
    if (d.isMultiLine) {
      // Célula com rótulo em 2 linhas
      drawCell(page2, pageHeight, { x: p2TableX, y: seguroY, w: p2ColLabelW, h: d.h, bgColor: colorGrayHeader });
      page2.drawText('DATA DE INGRESSO DO', {
        x: p2TableX + 4.0,
        y: pageHeight - seguroY - 12.0,
        size: 8.5,
        font: fontBold,
        color: colorBlack,
      });
      page2.drawText('SEGURADO NA APÓLICE', {
        x: p2TableX + 4.0,
        y: pageHeight - seguroY - 22.5,
        size: 8.5,
        font: fontBold,
        color: colorBlack,
      });
      drawCell(page2, pageHeight, { x: p2TableX + p2ColLabelW, y: seguroY, w: p2ColValW, h: d.h, text: d.val, font: fontRegular, fontSize: 8.5, bgColor: colorWhite });
    } else {
      drawCell(page2, pageHeight, { x: p2TableX, y: seguroY, w: p2ColLabelW, h: d.h, text: d.label, font: fontBold, fontSize: 8.5, bgColor: colorGrayHeader });
      drawCell(page2, pageHeight, { x: p2TableX + p2ColLabelW, y: seguroY, w: p2ColValW, h: d.h, text: d.val, font: fontRegular, fontSize: 8.5, bgColor: colorWhite });
    }
    seguroY += d.h;
  }

  // --- SEÇÃO: OPÇÕES DE CONTRATAÇÃO ---
  // Linha 1: Barra Verde Claro
  drawCell(page2, pageHeight, {
    x: 35.5,
    y: 464.6,
    w: 510.5,
    h: 22.0,
    text: 'OPÇÕES DE CONTRATAÇÃO',
    font: fontBold,
    fontSize: 9.0,
    bgColor: colorGreenBar,
    align: 'center',
  });

  // Linha 2: Cabeçalho Cinza Claro
  const colCobW = 184.0;
  const colLimW = 141.0;
  const colFranqW = 185.5;

  drawCell(page2, pageHeight, { x: 35.5, y: 486.6, w: colCobW, h: 21.0, text: 'COBERTURAS', font: fontBold, fontSize: 8.5, bgColor: colorGrayCols, align: 'center' });
  drawCell(page2, pageHeight, { x: 35.5 + colCobW, y: 486.6, w: colLimW, h: 21.0, text: 'LIMITE INDIVIDUAL', font: fontBold, fontSize: 8.5, bgColor: colorGrayCols, align: 'center' });
  drawCell(page2, pageHeight, { x: 35.5 + colCobW + colLimW, y: 486.6, w: colFranqW, h: 21.0, text: 'FRANQUIA', font: fontBold, fontSize: 8.5, bgColor: colorGrayCols, align: 'center' });

  // Linha 3: Valores das Coberturas (altura 60 pt)
  const dadosCobY = 507.6;
  const dadosCobH = 60.0;

  drawCell(page2, pageHeight, { x: 35.5, y: dadosCobY, w: colCobW, h: dadosCobH, bgColor: colorWhite });
  drawCell(page2, pageHeight, { x: 35.5 + colCobW, y: dadosCobY, w: colLimW, h: dadosCobH, bgColor: colorWhite });
  drawCell(page2, pageHeight, { x: 35.5 + colCobW + colLimW, y: dadosCobY, w: colFranqW, h: dadosCobH, bgColor: colorWhite });

  // Textos internos da Linha 3
  // Coluna 1
  const cobL1 = 'RESPONSABILIDADE CIVIL PROFISSIONAL';
  const cobL2 = '(COBERTURA BÁSICA)';
  const cobL1W = fontRegular.widthOfTextAtSize(cobL1, 8.2);
  const cobL2W = fontRegular.widthOfTextAtSize(cobL2, 8.2);
  page2.drawText(cobL1, {
    x: 35.5 + (colCobW - cobL1W) / 2,
    y: pageHeight - dadosCobY - 26.0,
    size: 8.2,
    font: fontRegular,
    color: colorBlack,
  });
  page2.drawText(cobL2, {
    x: 35.5 + (colCobW - cobL2W) / 2,
    y: pageHeight - dadosCobY - 38.0,
    size: 8.2,
    font: fontRegular,
    color: colorBlack,
  });

  // Coluna 2
  const limL1 = `R$ ${limiteIndividual} por segurado e`;
  const limL2 = 'R$ 10.000.000,00 no agregado';
  const limL1W = fontRegular.widthOfTextAtSize(limL1, 8.2);
  const limL2W = fontRegular.widthOfTextAtSize(limL2, 8.2);
  page2.drawText(limL1, {
    x: 35.5 + colCobW + (colLimW - limL1W) / 2,
    y: pageHeight - dadosCobY - 26.0,
    size: 8.2,
    font: fontRegular,
    color: colorBlack,
  });
  page2.drawText(limL2, {
    x: 35.5 + colCobW + (colLimW - limL2W) / 2,
    y: pageHeight - dadosCobY - 38.0,
    size: 8.2,
    font: fontRegular,
    color: colorBlack,
  });

  // Coluna 3
  const franqTxt = `R$ ${franquiaValor}`;
  const franqW = fontRegular.widthOfTextAtSize(franqTxt, 8.5);
  page2.drawText(franqTxt, {
    x: 35.5 + colCobW + colLimW + (colFranqW - franqW) / 2,
    y: pageHeight - dadosCobY - 32.0,
    size: 8.5,
    font: fontRegular,
    color: colorBlack,
  });

  // Texto SUSEP
  const susepTexto = 'CNPJ: 42.366.302/0001-28 - SAC: 4007 1790 - Ouvidoria: 0800 606 232 - Processo SUSEP: 5414.672822/2025-69';
  const susepW = fontRegular.widthOfTextAtSize(susepTexto, 7.5);
  page2.drawText(susepTexto, {
    x: (pageWidth - susepW) / 2,
    y: pageHeight - 582.0,
    size: 7.5,
    font: fontRegular,
    color: colorBlack,
  });

  // Cidade e Data
  const cidadeDataTexto = `São Paulo, ${diaHoje} de ${mesAtualMin} de ${anoHoje}`;
  page2.drawText(cidadeDataTexto, {
    x: 35.5,
    y: pageHeight - 608.0,
    size: 9.0,
    font: fontRegular,
    color: colorBlack,
  });

  // --- BLOCO DE ASSINATURAS (KEV Seguros à esquerda + Segurado com ZapSign à direita) ---
  const signY = pageHeight - 650.0;
  const colSignW = 240.0;

  // 1. Assinatura KEV Seguros (Esquerda)
  page2.drawLine({
    start: { x: 35.5, y: signY },
    end: { x: 35.5 + colSignW, y: signY },
    thickness: 0.8,
    color: colorBlack,
  });

  const kevLinhas = [
    { text: 'Rodrigo Rocha', font: fontBold, size: 9.5 },
    { text: 'Financial Lines', font: fontRegular, size: 8.2 },
    { text: 'rodrigo.rocha@kevseguros.com.br', font: fontRegular, size: 8.0 },
    { text: 'Avenida Brigadeiro Faria Lima, 3477', font: fontRegular, size: 8.0 },
    { text: 'Torre B - 2º andar - Itaim Bibi', font: fontRegular, size: 8.0 },
    { text: 'São Paulo - SP - CEP: 04538-133', font: fontRegular, size: 8.0 },
    { text: 'Acesse o site: www.kevseguros.com.br', font: fontRegular, size: 8.0 },
  ];

  let kevTextY = signY - 14.0;
  for (const l of kevLinhas) {
    page2.drawText(sanitizeForPdf(l.text), {
      x: 35.5,
      y: kevTextY,
      size: l.size,
      font: l.font,
      color: colorBlack,
    });
    kevTextY -= 11.5;
  }

  // 2. Assinatura do Segurado (Direita) - com Âncora ZapSign
  const segX = 305.0;
  page2.drawLine({
    start: { x: segX, y: signY },
    end: { x: segX + colSignW, y: signY },
    thickness: 0.8,
    color: colorBlack,
  });

  // Âncora textual que o ZapSign reconhece para aplicar a assinatura digital ICP-Brasil
  page2.drawText('{{ASSINATURA_SEGURADO}}', {
    x: segX,
    y: signY + 6.0,
    size: 8.0,
    font: fontRegular,
    color: rgb(0.98, 0.98, 0.98), // Quase invisível para humanos, perfeitamente legível pelo parser OCR do ZapSign
  });

  const segLinhas = [
    { text: sanitizeForPdf(cotacao.client_name), font: fontBold, size: 9.5 },
    { text: `CPF: ${formatCpf(cotacao.client_cpf_cnpj)}`, font: fontRegular, size: 8.2 },
    { text: 'Segurado / Proponente Aderente', font: fontRegular, size: 8.0 },
    { text: `Assinatura digital via ZapSign (ICP-Brasil)`, font: fontRegular, size: 8.0 },
    { text: `Intermediação: ${sanitizeForPdf(corretora.nomeFantasia)}`, font: fontRegular, size: 8.0 },
  ];

  let segTextY = signY - 14.0;
  for (const l of segLinhas) {
    page2.drawText(sanitizeForPdf(l.text), {
      x: segX,
      y: segTextY,
      size: l.size,
      font: l.font,
      color: colorBlack,
    });
    segTextY -= 11.5;
  }

  // --- 5. GERAÇÃO FINAL DO BUFFER E BASE64 ---
  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  const base64 = buffer.toString('base64');

  const cleanClientName = (cotacao.client_name || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
  const idCurto = cotacao.id.slice(0, 8).toUpperCase();
  const docName = `Proposta_KEV_${corretora.nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}_${cleanClientName}_${idCurto}.pdf`;

  return {
    buffer,
    base64,
    docName,
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
