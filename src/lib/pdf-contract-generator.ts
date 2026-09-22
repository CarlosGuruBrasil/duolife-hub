import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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

/**
 * Sanitiza textos para o charset padrão do PDF (WinAnsi/Latin-1)
 * evitando caracteres que quebram o encoder do pdf-lib.
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

function formatData(val: any): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
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
 * Renderiza o PDF do contrato com base nos parâmetros já resolvidos.
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

  // Inicializa o documento PDF (A4)
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Paleta de Cores
  const primaryColor = rgb(0.055, 0.29, 0.35); // #0e4a5a (Petrol Blue DuoLife)
  const secondaryColor = rgb(0.0, 0.40, 0.60); // Tom secundário
  const textDark = rgb(0.12, 0.15, 0.18);
  const textMuted = rgb(0.40, 0.45, 0.50);
  const borderLight = rgb(0.85, 0.88, 0.90);
  const bgCard = rgb(0.97, 0.98, 0.99);
  const white = rgb(1, 1, 1);

  // Dimensões A4: 595.28 x 841.89 pt
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Carrega Logo DuoLife Oficial
  let duoLifeLogoImage = null;
  try {
    const duoLifeLogoBytes = await fs.readFile(path.join(process.cwd(), 'public', 'logo-horizontal.png'));
    duoLifeLogoImage = await pdfDoc.embedPng(duoLifeLogoBytes);
  } catch (err) {
    logger.warn({ err }, 'pdf_generator.duolife_logo_load_error');
  }

  // Carrega Logo da Corretora
  let corretoraLogoImage = null;
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

  // ==========================================
  // PÁGINA 1: Cabeçalho, Segurado, Coberturas e Parcelamento
  // ==========================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // --- CABEÇALHO SUPERIOR ---
  // Background sutil do cabeçalho
  page1.drawRectangle({
    x: margin,
    y: y - 72,
    width: contentWidth,
    height: 72,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  // Logo da Corretora (Esquerda)
  if (corretoraLogoImage) {
    const imgDims = corretoraLogoImage.scale(1);
    const maxImgWidth = 140;
    const maxImgHeight = 44;
    const scale = Math.min(maxImgWidth / imgDims.width, maxImgHeight / imgDims.height);
    const renderW = imgDims.width * scale;
    const renderH = imgDims.height * scale;
    page1.drawImage(corretoraLogoImage, {
      x: margin + 12,
      y: y - 58 + (maxImgHeight - renderH) / 2,
      width: renderW,
      height: renderH,
    });
  } else {
    page1.drawText(sanitizeForPdf(corretora.nomeFantasia.toUpperCase()), {
      x: margin + 12,
      y: y - 35,
      size: 13,
      font: fontBold,
      color: primaryColor,
    });
  }

  // Logo DuoLife (Direita)
  if (duoLifeLogoImage) {
    const imgDims = duoLifeLogoImage.scale(1);
    const maxImgWidth = 110;
    const maxImgHeight = 36;
    const scale = Math.min(maxImgWidth / imgDims.width, maxImgHeight / imgDims.height);
    const renderW = imgDims.width * scale;
    const renderH = imgDims.height * scale;
    page1.drawImage(duoLifeLogoImage, {
      x: margin + contentWidth - renderW - 12,
      y: y - 54 + (maxImgHeight - renderH) / 2,
      width: renderW,
      height: renderH,
    });
  }

  // Texto central com dados institucionais da Corretora
  const centerTextX = margin + 165;
  page1.drawText(sanitizeForPdf(corretora.razaoSocial), {
    x: centerTextX,
    y: y - 24,
    size: 8.5,
    font: fontBold,
    color: textDark,
  });
  page1.drawText(sanitizeForPdf(`CNPJ: ${corretora.cnpj} | SUSEP: ${corretora.susep || 'Cadastrada'}`), {
    x: centerTextX,
    y: y - 36,
    size: 7.5,
    font: fontRegular,
    color: textMuted,
  });
  page1.drawText(sanitizeForPdf(`Contato: ${corretora.phone} | ${corretora.email}`), {
    x: centerTextX,
    y: y - 47,
    size: 7.5,
    font: fontRegular,
    color: textMuted,
  });
  page1.drawText(sanitizeForPdf(corretora.enderecoFormatado), {
    x: centerTextX,
    y: y - 58,
    size: 7,
    font: fontRegular,
    color: textMuted,
  });

  y -= 88;

  // --- TÍTULO DO CONTRATO ---
  page1.drawRectangle({
    x: margin,
    y: y - 32,
    width: contentWidth,
    height: 32,
    color: primaryColor,
  });

  page1.drawText('PROPOSTA DE ADESÃO E CONTRATO DE SEGURO', {
    x: margin + 16,
    y: y - 18,
    size: 11,
    font: fontBold,
    color: white,
  });

  const hoje = new Date();
  const idCurto = cotacao.id.slice(0, 8).toUpperCase();
  page1.drawText(`Proposta Nº: ${idCurto} | Emissão: ${formatData(hoje)}`, {
    x: margin + contentWidth - 190,
    y: y - 18,
    size: 8.5,
    font: fontRegular,
    color: white,
  });

  y -= 44;

  // Helper para desenhar títulos de seção
  const drawSectionHeader = (titulo: string) => {
    page1.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 18,
      color: rgb(0.92, 0.95, 0.96),
    });
    page1.drawRectangle({
      x: margin,
      y: y - 18,
      width: 4,
      height: 18,
      color: primaryColor,
    });
    page1.drawText(sanitizeForPdf(titulo.toUpperCase()), {
      x: margin + 12,
      y: y - 13,
      size: 9,
      font: fontBold,
      color: primaryColor,
    });
    y -= 24;
  };

  // Helper para desenhar campos em grid
  const drawField = (label: string, value: string, xPos: number, yPos: number, w: number) => {
    page1.drawText(sanitizeForPdf(label.toUpperCase()), {
      x: xPos,
      y: yPos,
      size: 7,
      font: fontBold,
      color: textMuted,
    });
    page1.drawText(sanitizeForPdf(value || '-'), {
      x: xPos,
      y: yPos - 12,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
  };

  // --- SEÇÃO 1: DADOS DO SEGURADO (PROPONENTE) ---
  drawSectionHeader('1. Dados do Segurado (Proponente)');

  const colWidth4 = contentWidth / 4;
  const colWidth2 = contentWidth / 2;

  // Linha 1: Nome (50%), CPF (25%), Data Nasc (25%)
  drawField('Nome Completo', cotacao.client_name, margin + 8, y, colWidth2 - 10);
  drawField('CPF / CNPJ', cotacao.client_cpf_cnpj, margin + colWidth2 + 8, y, colWidth4 - 10);
  drawField('Data de Nascimento', formatData(clientData.dataNascto), margin + colWidth2 + colWidth4 + 8, y, colWidth4 - 10);
  y -= 26;

  // Linha 2: E-mail (50%), Celular / WhatsApp (25%), Registro Profissional (25%)
  drawField('E-mail Principal', cotacao.client_email || 'Não informado', margin + 8, y, colWidth2 - 10);
  drawField('Telefone / WhatsApp', cotacao.client_phone || 'Não informado', margin + colWidth2 + 8, y, colWidth4 - 10);
  drawField('Registro Profissional (OAB/CRM/etc)', clientData.oab || clientData.registroProfissional || 'N/A', margin + colWidth2 + colWidth4 + 8, y, colWidth4 - 10);
  y -= 26;

  // Linha 3: Endereço Residencial/Comercial Completo
  const enderecoCliente = [
    clientData.logradouro,
    clientData.numero ? `nº ${clientData.numero}` : null,
    clientData.complemento,
    clientData.bairro,
    clientData.cidade && clientData.uf ? `${clientData.cidade}/${clientData.uf}` : null,
    clientData.cep ? `CEP: ${clientData.cep}` : null,
  ].filter(Boolean).join(', ');

  drawField('Endereço Completo do Proponente', enderecoCliente || 'Não informado', margin + 8, y, contentWidth - 16);
  y -= 34;

  // --- SEÇÃO 2: DADOS PROFISSIONAIS & HISTÓRICO ---
  drawSectionHeader('2. Dados Profissionais & Atuação');

  const colWidth3 = contentWidth / 3;
  drawField('Início da Atividade', formatData(clientData.dataAtividade), margin + 8, y, colWidth3 - 10);
  drawField('Titularidade', clientData.titularidade || 'Titular', margin + colWidth3 + 8, y, colWidth3 - 10);
  drawField('Pessoa Politicamente Exposta (PPE)', (clientData.ppeCargos === 'Sim' || clientData.ppeCargos === true) ? 'Sim' : 'Não', margin + colWidth3 * 2 + 8, y, colWidth3 - 10);
  y -= 26;

  drawField('Escritório Associado / Sociedade de Advocacia', clientData.escritorioAssociado || 'Individual / Próprio', margin + 8, y, contentWidth - 16);
  y -= 26;

  const atuacoes = Array.isArray(clientData.atuacao)
    ? clientData.atuacao.join(', ')
    : String(clientData.atuacao || 'Conforme declaração de proposta');
  drawField('Áreas de Atuação Cobertas', atuacoes, margin + 8, y, contentWidth - 16);
  y -= 26;

  const seguroAnterior = clientData.seguradora
    ? `Seguradora Anterior: ${clientData.seguradora} | Retroatividade: ${clientData.dataRetroativa ? formatData(clientData.dataRetroativa) : 'Início de Vigência'}`
    : 'Sem seguro anterior informado (Início de vigência na data de emissão)';
  drawField('Histórico de Seguro Anterior / Retroatividade', seguroAnterior, margin + 8, y, contentWidth - 16);
  y -= 34;

  // --- SEÇÃO 3: COBERTURAS DO PLANO & CONDIÇÕES FINANCEIRAS ---
  drawSectionHeader('3. Plano Contratado & Condições Financeiras');

  // Caixa de destaque do plano
  page1.drawRectangle({
    x: margin,
    y: y - 56,
    width: contentWidth,
    height: 56,
    color: bgCard,
    borderColor: primaryColor,
    borderWidth: 1,
  });

  const planoNome = String(clientData.valorCobertura || clientData.tipoDePlano || 'Plano Oficial RC Profissional');
  page1.drawText('PLANO CONTRATADO & COBERTURA', {
    x: margin + 14,
    y: y - 16,
    size: 7.5,
    font: fontBold,
    color: textMuted,
  });
  page1.drawText(sanitizeForPdf(planoNome.toUpperCase()), {
    x: margin + 14,
    y: y - 30,
    size: 9.5,
    font: fontBold,
    color: primaryColor,
  });
  page1.drawText(sanitizeForPdf(`Franquia / POS: ${clientData.planoFranquia || 'Conforme Apólice'}`), {
    x: margin + 14,
    y: y - 44,
    size: 8,
    font: fontRegular,
    color: textDark,
  });

  // Divisor vertical
  page1.drawLine({
    start: { x: margin + contentWidth * 0.58, y: y - 8 },
    end: { x: margin + contentWidth * 0.58, y: y - 48 },
    thickness: 1,
    color: borderLight,
  });

  // Condição de Pagamento e Valor
  const colPagtoX = margin + contentWidth * 0.58 + 16;
  page1.drawText('CONDIÇÃO DE PAGAMENTO', {
    x: colPagtoX,
    y: y - 16,
    size: 7.5,
    font: fontBold,
    color: textMuted,
  });

  const condicaoTexto = qtdParcelas > 1
    ? `${qtdParcelas}x de ${formatMoeda(valorParcela)}`
    : `1x à vista de ${formatMoeda(valorTotal)}`;

  page1.drawText(sanitizeForPdf(condicaoTexto), {
    x: colPagtoX,
    y: y - 30,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.45, 0.25), // Tom verde elegante
  });

  const totalTexto = qtdParcelas > 1 ? `Prêmio Total com Juros: ${formatMoeda(valorTotalComJuros)}` : 'Pagamento Único';
  page1.drawText(sanitizeForPdf(totalTexto), {
    x: colPagtoX,
    y: y - 44,
    size: 7.5,
    font: fontRegular,
    color: textMuted,
  });

  y -= 70;

  // --- SEÇÃO 4: DECLARAÇÕES DE ADESÃO E TERMOS LEGAIS ---
  drawSectionHeader('4. Declarações do Segurado & LGPD');

  const clausulas = [
    '1. Declaro que todas as informações acima prestadas são a expressão fiel da verdade e que nada ocultei ou omiti que pudesse influir na aceitação desta proposta de seguro ou na taxação do risco.',
    '2. Estou ciente de que a inexatidão ou a omissão de dados relevantes poderá acarretar a perda do direito à indenização securitária, conforme preceitua o Código Civil Brasileiro.',
    '3. Autorizo expressamente o tratamento e o compartilhamento dos meus dados pessoais para fins exclusivos de subscrição, faturamento, emissão e operacionalização do seguro, nos termos da Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).',
    '4. Concordo com as Condições Gerais e Especiais da apólice contratada e confirmo minha adesão aos termos e coberturas pactuados.'
  ];

  for (const c of clausulas) {
    page1.drawText(sanitizeForPdf(c), {
      x: margin + 8,
      y: y - 8,
      size: 7,
      font: fontRegular,
      color: textDark,
      maxWidth: contentWidth - 16,
      lineHeight: 9.5,
    });
    y -= 21;
  }

  y -= 14;

  // --- SEÇÃO 5: ASSINATURA DIGITAL ---
  drawSectionHeader('5. Formalização e Assinatura Digital');

  const dataExtenso = `${hoje.getDate()} de ${hoje.toLocaleString('pt-BR', { month: 'long' })} de ${hoje.getFullYear()}`;
  page1.drawText(sanitizeForPdf(`Local e Data: Florianópolis/SC, ${dataExtenso}.`), {
    x: margin + 8,
    y: y - 8,
    size: 8,
    font: fontOblique,
    color: textMuted,
  });

  y -= 28;

  // Quadro de Assinatura do Segurado
  const boxW = (contentWidth - 20) / 2;
  page1.drawRectangle({
    x: margin,
    y: y - 72,
    width: boxW,
    height: 72,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page1.drawLine({
    start: { x: margin + 16, y: y - 48 },
    end: { x: margin + boxW - 16, y: y - 48 },
    thickness: 1,
    color: borderLight,
  });

  // Texto âncora invisível ou sutil para ZapSign identificar se necessário
  page1.drawText('{{ASSINATURA_SEGURADO}}', {
    x: margin + 16,
    y: y - 42,
    size: 6,
    font: fontRegular,
    color: rgb(0.85, 0.85, 0.85),
  });

  page1.drawText(sanitizeForPdf(cotacao.client_name), {
    x: margin + 16,
    y: y - 59,
    size: 8,
    font: fontBold,
    color: textDark,
  });
  page1.drawText(sanitizeForPdf(`CPF: ${cotacao.client_cpf_cnpj} (Proponente / Segurado)`), {
    x: margin + 16,
    y: y - 68,
    size: 6.8,
    font: fontRegular,
    color: textMuted,
  });

  // Quadro da Corretora Intermediadora
  page1.drawRectangle({
    x: margin + boxW + 20,
    y: y - 72,
    width: boxW,
    height: 72,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page1.drawLine({
    start: { x: margin + boxW + 36, y: y - 48 },
    end: { x: margin + boxW * 2 + 4, y: y - 48 },
    thickness: 1,
    color: borderLight,
  });

  page1.drawText(sanitizeForPdf(corretora.razaoSocial), {
    x: margin + boxW + 36,
    y: y - 59,
    size: 8,
    font: fontBold,
    color: textDark,
  });
  page1.drawText(sanitizeForPdf(`CNPJ: ${corretora.cnpj} | SUSEP: ${corretora.susep || 'Cadastrada'}`), {
    x: margin + boxW + 36,
    y: y - 68,
    size: 6.8,
    font: fontRegular,
    color: textMuted,
  });

  // Rodapé Oficial
  page1.drawText(
    sanitizeForPdf(`Documento gerado eletronicamente por DuoLife Hub sob autorização de ${corretora.nomeFantasia}. Certificado para assinatura digital ICP-Brasil via ZapSign.`),
    {
      x: margin,
      y: margin - 14,
      size: 6.5,
      font: fontRegular,
      color: textMuted,
    }
  );

  // 5. Salva o PDF gerado em Buffer e Base64
  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  const base64 = buffer.toString('base64');
  const cleanClientName = (cotacao.client_name || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
  const docName = `Contrato_${corretora.nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}_${cleanClientName}_${idCurto}.pdf`;

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

