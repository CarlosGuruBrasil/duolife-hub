import {
  EmailDesign,
  EmailSection,
  EmailColumn,
  EmailBlock,
  BlockType,
  SectionType,
  TextBlockContent,
  ButtonBlockContent,
  ImageBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  TableBlockContent,
  HtmlBlockContent,
  EmailDesignGlobalStyles
} from './types';
import { createBlankDesign } from './defaultTemplates';

// ============================================================================
// UTILITÁRIOS DE PARSING DE ESTILOS E CORES
// ============================================================================

/**
 * Converte qualquer representação de cor (rgb, rgba, hex curto, hex longo, nomes de cores)
 * para um formato hexadecimal limpo (#rrggbb ou #rrggbbaa) ou string CSS válida.
 */
export function parseColor(color?: string | null): string | undefined {
  if (!color) return undefined;
  const c = color.trim().toLowerCase();
  if (
    c === '' ||
    c === 'transparent' ||
    c === 'inherit' ||
    c === 'initial' ||
    c === 'unset' ||
    c === 'none'
  ) {
    return undefined;
  }

  // rgb(r, g, b) ou rgba(r, g, b, a)
  const rgbMatch = c.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)));
    const toHex = (n: number) => n.toString(16).padStart(2, '0');

    if (rgbMatch[4] !== undefined) {
      const alpha = parseFloat(rgbMatch[4]);
      if (alpha === 0) return 'transparent';
      if (alpha < 1) {
        const a = Math.min(255, Math.max(0, Math.round(alpha * 255)));
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
      }
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Hex curto #abc -> #aabbcc
  if (/^#([0-9a-f]{3})$/i.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }

  // Hex longo #abcdef
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) {
    return c;
  }

  // Nomes de cores comuns no HTML
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#10b981',
    gray: '#6b7280',
    grey: '#6b7280'
  };
  if (namedColors[c]) {
    return namedColors[c];
  }

  return c;
}

/**
 * Converte valores como "18px", " 24px ", "1.5", 20 em número em pixels.
 */
export function parsePx(val?: string | number | null): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const trimmed = val.trim();
  const match = trimmed.match(/^([-+]?[0-9]*\.?[0-9]+)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  return isNaN(num) ? undefined : Math.round(num * 100) / 100;
}

/**
 * Extrai estilos CSS inline de uma string ou atributo style em um dicionário normalizado.
 */
export function parseInlineStyleString(styleStr?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;

  const rules = styleStr.split(';');
  for (const rule of rules) {
    const colonIdx = rule.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = rule.slice(0, colonIdx).trim().toLowerCase();
    const val = rule.slice(colonIdx + 1).trim();
    if (prop && val) {
      result[prop] = val;
    }
  }
  return result;
}

/**
 * Analisa e extrai padding individual e shorthand.
 */
export function parsePadding(elementOrStyle: Element | string | null): {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
} {
  const styles = typeof elementOrStyle === 'string'
    ? parseInlineStyleString(elementOrStyle)
    : elementOrStyle
      ? parseInlineStyleString(elementOrStyle.getAttribute('style'))
      : {};

  const res: {
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
  } = {};

  // Propriedades individuais
  if (styles['padding-top']) res.paddingTop = parsePx(styles['padding-top']);
  if (styles['padding-right']) res.paddingRight = parsePx(styles['padding-right']);
  if (styles['padding-bottom']) res.paddingBottom = parsePx(styles['padding-bottom']);
  if (styles['padding-left']) res.paddingLeft = parsePx(styles['padding-left']);

  // Shorthand padding
  if (styles['padding']) {
    const parts = styles['padding'].split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      const v = parsePx(parts[0]);
      if (v !== undefined) {
        if (res.paddingTop === undefined) res.paddingTop = v;
        if (res.paddingRight === undefined) res.paddingRight = v;
        if (res.paddingBottom === undefined) res.paddingBottom = v;
        if (res.paddingLeft === undefined) res.paddingLeft = v;
      }
    } else if (parts.length === 2) {
      const vY = parsePx(parts[0]);
      const vX = parsePx(parts[1]);
      if (res.paddingTop === undefined) res.paddingTop = vY;
      if (res.paddingBottom === undefined) res.paddingBottom = vY;
      if (res.paddingRight === undefined) res.paddingRight = vX;
      if (res.paddingLeft === undefined) res.paddingLeft = vX;
    } else if (parts.length === 3) {
      const vT = parsePx(parts[0]);
      const vX = parsePx(parts[1]);
      const vB = parsePx(parts[2]);
      if (res.paddingTop === undefined) res.paddingTop = vT;
      if (res.paddingRight === undefined) res.paddingRight = vX;
      if (res.paddingLeft === undefined) res.paddingLeft = vX;
      if (res.paddingBottom === undefined) res.paddingBottom = vB;
    } else if (parts.length >= 4) {
      if (res.paddingTop === undefined) res.paddingTop = parsePx(parts[0]);
      if (res.paddingRight === undefined) res.paddingRight = parsePx(parts[1]);
      if (res.paddingBottom === undefined) res.paddingBottom = parsePx(parts[2]);
      if (res.paddingLeft === undefined) res.paddingLeft = parsePx(parts[3]);
    }
  }

  return res;
}

/**
 * Extrai border-radius, incluindo suporte a 4 cantos independentes.
 */
export function parseBorderRadius(elementOrStyle: Element | string | null): {
  borderRadius?: number;
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomRight?: number;
  borderRadiusBottomLeft?: number;
  useCustomCorners?: boolean;
} {
  const styles = typeof elementOrStyle === 'string'
    ? parseInlineStyleString(elementOrStyle)
    : elementOrStyle
      ? parseInlineStyleString(elementOrStyle.getAttribute('style'))
      : {};

  const brStr = styles['border-radius'] || styles['-webkit-border-radius'] || styles['-moz-border-radius'];
  if (!brStr) return {};

  const parts = brStr.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const val = parsePx(parts[0]);
    return val !== undefined ? { borderRadius: val, useCustomCorners: false } : {};
  } else if (parts.length === 4) {
    const tl = parsePx(parts[0]) ?? 0;
    const tr = parsePx(parts[1]) ?? 0;
    const br = parsePx(parts[2]) ?? 0;
    const bl = parsePx(parts[3]) ?? 0;
    if (tl === tr && tr === br && br === bl) {
      return { borderRadius: tl, useCustomCorners: false };
    }
    return {
      borderRadiusTopLeft: tl,
      borderRadiusTopRight: tr,
      borderRadiusBottomRight: br,
      borderRadiusBottomLeft: bl,
      useCustomCorners: true
    };
  }

  const val = parsePx(parts[0]);
  return val !== undefined ? { borderRadius: val } : {};
}

/**
 * Extrai propriedades de borda (largura, estilo e cor).
 */
export function parseBorder(elementOrStyle: Element | string | null): {
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
} {
  const styles = typeof elementOrStyle === 'string'
    ? parseInlineStyleString(elementOrStyle)
    : elementOrStyle
      ? parseInlineStyleString(elementOrStyle.getAttribute('style'))
      : {};

  const res: {
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
  } = {};

  if (styles['border-width']) res.borderWidth = parsePx(styles['border-width']);
  if (styles['border-color']) res.borderColor = parseColor(styles['border-color']);
  if (styles['border-style']) {
    const st = styles['border-style'].toLowerCase();
    if (st === 'solid' || st === 'dashed' || st === 'dotted') {
      res.borderStyle = st;
    }
  }

  const borderStr = styles['border'] || styles['border-top'];
  if (borderStr) {
    const match = borderStr.match(/^([\d.]+px)?\s*(solid|dashed|dotted)?\s*(#[0-9a-fA-F]+|rgba?\([^)]+\)|[a-zA-Z]+)?/i);
    if (match) {
      if (res.borderWidth === undefined && match[1]) res.borderWidth = parsePx(match[1]);
      if (res.borderStyle === undefined && match[2]) {
        res.borderStyle = match[2].toLowerCase() as 'solid' | 'dashed' | 'dotted';
      }
      if (res.borderColor === undefined && match[3]) res.borderColor = parseColor(match[3]);
    }
  }

  return res;
}

/**
 * Gera IDs únicos para novas seções, colunas ou blocos.
 */
export function generateUniqueId(prefix: 'sec' | 'col' | 'blk'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

// ============================================================================
// PARSER DOM PRINCIPAL
// ============================================================================

/**
 * Converte uma string HTML em um Document DOM de forma segura.
 * Trata graciosamente caso execute no servidor ou sem DOMParser.
 */
function parseHtmlToDomDocument(html: string): Document | null {
  if (!html || typeof html !== 'string' || !html.trim()) {
    return null;
  }

  try {
    // 1. Ambiente Browser padrão
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
      return new window.DOMParser().parseFromString(html, 'text/html');
    }

    // 2. Ambiente global / Web Worker / Test runner com DOMParser injetado
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser().parseFromString(html, 'text/html');
    }
  } catch (err) {
    console.error('[emailHtmlParser] Erro crítico ao invocar DOMParser:', err);
  }

  return null;
}

/**
 * Extrai as regras CSS de tags <style> no <head> e aplica como estilos inline nos elementos correspondentes
 * para garantir que classes CSS de templates legados (.header, .btn, .card-info, .footer, .container, body)
 * sejam preservadas fielmente no Editor Visual.
 */
export function inlineStylesFromHead(doc: Document): void {
  const styleTags = Array.from(doc.querySelectorAll('style'));
  if (styleTags.length === 0) return;

  for (const styleTag of styleTags) {
    const cssText = styleTag.textContent || '';
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRegex.exec(cssText)) !== null) {
      const selectorRaw = match[1].trim();
      const styleBlock = match[2].trim();
      if (!selectorRaw || !styleBlock) continue;
      if (selectorRaw.startsWith('@')) continue;

      const selectors = selectorRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const parsedRules = parseInlineStyleString(styleBlock);

      for (const sel of selectors) {
        try {
          const elements = Array.from(doc.querySelectorAll(sel));
          for (const el of elements) {
            const currentStyles = parseInlineStyleString(el.getAttribute('style'));
            const merged = { ...parsedRules, ...currentStyles };
            const styleStr = Object.entries(merged)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ');
            el.setAttribute('style', styleStr);
          }
        } catch {
          // Ignora seletores não suportados
        }
      }
    }
  }
}

// ============================================================================
// EXTRAÇÃO DE ESTILOS GLOBAIS
// ============================================================================

function extractGlobalStyles(doc: Document, fallbackStyles?: EmailDesignGlobalStyles): EmailDesignGlobalStyles {
  const current: EmailDesignGlobalStyles = fallbackStyles ? { ...fallbackStyles } : {
    backgroundColor: '#f4f6f8',
    contentWidth: 600,
    contentBackgroundColor: '#ffffff',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial",
    textColor: '#333333',
    linkColor: '#0e4a5a'
  };

  const body = doc.body;
  if (body) {
    const bodyStyles = parseInlineStyleString(body.getAttribute('style'));
    const bodyBg = parseColor(bodyStyles['background-color']) || parseColor(bodyStyles['background']) || parseColor(body.getAttribute('bgcolor'));
    if (bodyBg) current.backgroundColor = bodyBg;

    if (bodyStyles['font-family']) {
      current.fontFamily = bodyStyles['font-family'];
    }

    const bodyColor = parseColor(bodyStyles['color']);
    if (bodyColor) current.textColor = bodyColor;
  }

  // Wrapper principal externo (primeira tabela width="100%")
  const outerTable = doc.querySelector('table[width="100%"]');
  if (outerTable) {
    const outerStyles = parseInlineStyleString(outerTable.getAttribute('style'));
    const outerBg = parseColor(outerStyles['background-color']) || parseColor(outerTable.getAttribute('bgcolor'));
    if (outerBg && !body?.getAttribute('style')?.includes('background-color')) {
      current.backgroundColor = outerBg;
    }
  }

  // Container Central de Conteúdo (tabela ou div com max-width / container)
  const container = doc.querySelector(
    'table[data-email-container="true"], table.email-container, table[style*="max-width"], div.container, div[class*="container"], div[style*="max-width"]'
  );
  if (container) {
    const containerStyles = parseInlineStyleString(container.getAttribute('style'));
    const contBg = parseColor(containerStyles['background-color']) || parseColor(containerStyles['background']) || parseColor(container.getAttribute('bgcolor'));
    if (contBg) current.contentBackgroundColor = contBg;

    // max-width ou width
    if (containerStyles['max-width']) {
      const mw = parsePx(containerStyles['max-width']);
      if (mw && mw >= 320 && mw <= 1200) current.contentWidth = mw;
    } else {
      const w = parsePx(container.getAttribute('width'));
      if (w && w >= 320 && w <= 1200) current.contentWidth = w;
    }
  }

  // Link Color
  const sampleLink = doc.querySelector('a:not([data-button-link]):not(.btn):not([class*="btn"])');
  if (sampleLink) {
    const lStyles = parseInlineStyleString(sampleLink.getAttribute('style'));
    const lColor = parseColor(lStyles['color']);
    if (lColor) current.linkColor = lColor;
  }

  return current;
}

// ============================================================================
// EXTRAÇÃO DE DADOS DE BLOCOS ESPECÍFICOS
// ============================================================================

/**
 * Atualiza ou constrói o bloco 'text'.
 */
function extractTextBlockData(
  blockEl: Element,
  existingData?: TextBlockContent
): TextBlockContent {
  const cell = blockEl.querySelector('[data-text-cell]') || blockEl.querySelector('td') || blockEl;
  const cellStyles = parseInlineStyleString(cell.getAttribute('style'));

  // Alinhamento
  let align: 'left' | 'center' | 'right' | 'justify' = existingData?.align || 'left';
  const rawAlign = (cellStyles['text-align'] || cell.getAttribute('align') || '').toLowerCase();
  if (rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right' || rawAlign === 'justify') {
    align = rawAlign;
  }

  // Cor do texto: prioriza tags filhas estilizadas (<h1-6>, <p>, <span>, <font>) se houver, ou a célula td
  let color: string | undefined = undefined;
  const coloredChild = cell.querySelector('[style*="color"], font[color]');
  if (coloredChild) {
    if (coloredChild.tagName.toLowerCase() === 'font') {
      color = parseColor(coloredChild.getAttribute('color'));
    } else {
      const childStyles = parseInlineStyleString(coloredChild.getAttribute('style'));
      color = parseColor(childStyles['color']);
    }
  }

  if (!color) {
    color = parseColor(cellStyles['color']) || existingData?.color;
  }

  // Tamanho e altura da linha
  const fontSize = parsePx(cellStyles['font-size']) || existingData?.fontSize;
  let lineHeight: number | undefined = existingData?.lineHeight;
  if (cellStyles['line-height']) {
    const lhNum = parseFloat(cellStyles['line-height']);
    if (!isNaN(lhNum)) {
      lineHeight = lhNum;
    }
  }

  // Conteúdo HTML
  const rawHtml = (cell.innerHTML || '').trim();
  const html = rawHtml.length > 0 ? rawHtml : (existingData?.html || '<p>Texto...</p>');

  return {
    html,
    align,
    color,
    fontSize,
    lineHeight
  };
}

/**
 * Atualiza ou constrói o bloco 'button'.
 */
function extractButtonBlockData(
  blockEl: Element,
  existingData?: ButtonBlockContent
): ButtonBlockContent {
  const a = blockEl.querySelector('a[data-button-link]') || (blockEl.tagName === 'A' ? blockEl : blockEl.querySelector('a'));
  const aStyles = parseInlineStyleString(a?.getAttribute('style'));

  // Texto e URL do link
  const text = a?.textContent?.trim() || existingData?.text || 'Clique Aqui';
  const url = a?.getAttribute('href') || existingData?.url || '#';

  // Cores
  const textColor = parseColor(aStyles['color']) || existingData?.textColor || '#ffffff';

  // Fundo do botão (pode estar em background-color ou background na tag <a> ou no container)
  const parentCell = a?.closest('td') || a?.parentElement;
  const parentStyles = parentCell ? parseInlineStyleString(parentCell.getAttribute('style')) : {};
  const buttonColor =
    parseColor(aStyles['background-color']) ||
    parseColor(aStyles['background']) ||
    parseColor(parentStyles['background-color']) ||
    parseColor(parentStyles['background']) ||
    parseColor(parentCell?.getAttribute('bgcolor')) ||
    existingData?.buttonColor ||
    '#0e4a5a';

  // Alinhamento
  let align: 'left' | 'center' | 'right' = existingData?.align || 'center';
  const alignContainer = blockEl.querySelector('td[align]') || blockEl.closest('div[style*="text-align"]') || blockEl;
  const containerStyles = parseInlineStyleString(alignContainer?.getAttribute('style'));
  const rawAlign = (alignContainer?.getAttribute('align') || containerStyles['text-align'] || aStyles['text-align'] || '').toLowerCase();
  if (rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right') {
    align = rawAlign;
  }

  // Padding
  const pad = parsePadding(a);
  const paddingX = pad.paddingRight ?? pad.paddingLeft ?? existingData?.paddingX ?? 24;
  const paddingY = pad.paddingTop ?? pad.paddingBottom ?? existingData?.paddingY ?? 12;

  // Border radius
  const brInfo = parseBorderRadius(a);
  const borderRadius = brInfo.borderRadius ?? existingData?.borderRadius ?? 6;

  // Fonte
  const fontSize = parsePx(aStyles['font-size']) ?? existingData?.fontSize ?? 16;
  const fontWeight = aStyles['font-weight'] || existingData?.fontWeight || '600';

  // Full Width
  const buttonTable = blockEl.querySelector('table table') || a?.closest('table');
  const isFullWidth =
    buttonTable?.getAttribute('width') === '100%' ||
    buttonTable?.getAttribute('style')?.includes('width: 100%') ||
    existingData?.fullWidth ||
    false;

  return {
    text,
    url,
    buttonColor,
    textColor,
    align,
    borderRadius,
    borderRadiusTopLeft: brInfo.borderRadiusTopLeft ?? existingData?.borderRadiusTopLeft,
    borderRadiusTopRight: brInfo.borderRadiusTopRight ?? existingData?.borderRadiusTopRight,
    borderRadiusBottomLeft: brInfo.borderRadiusBottomLeft ?? existingData?.borderRadiusBottomLeft,
    borderRadiusBottomRight: brInfo.borderRadiusBottomRight ?? existingData?.borderRadiusBottomRight,
    useCustomCorners: brInfo.useCustomCorners ?? existingData?.useCustomCorners,
    fontSize,
    fontWeight,
    paddingX,
    paddingY,
    fullWidth: isFullWidth
  };
}

/**
 * Atualiza ou constrói o bloco 'image'.
 */
function extractImageBlockData(
  blockEl: Element,
  existingData?: ImageBlockContent
): ImageBlockContent {
  const img = blockEl.querySelector('img[data-image-el]') || blockEl.querySelector('img');
  const imgStyles = parseInlineStyleString(img?.getAttribute('style'));

  const src = img?.getAttribute('src') || existingData?.src || 'https://via.placeholder.com/600x200?text=Imagem';
  const alt = img?.getAttribute('alt') ?? existingData?.alt ?? 'Imagem';

  // Largura
  let width: number | string | undefined = existingData?.width;
  const rawWidth = imgStyles['width'] || img?.getAttribute('width');
  if (rawWidth) {
    if (rawWidth.endsWith('%')) {
      width = rawWidth;
    } else {
      const numW = parsePx(rawWidth);
      width = numW !== undefined ? numW : rawWidth;
    }
  }

  // Link envoltório
  const linkEl = img?.closest('a') || blockEl.querySelector('a');
  const url = linkEl?.getAttribute('href') || existingData?.url;

  // Alinhamento
  let align: 'left' | 'center' | 'right' = existingData?.align || 'center';
  const alignCell = blockEl.querySelector('td[align]') || blockEl.querySelector('td');
  const rawAlign = (alignCell?.getAttribute('align') || imgStyles['text-align'] || '').toLowerCase();
  if (rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right') {
    align = rawAlign;
  }

  // Border radius
  const brInfo = parseBorderRadius(img);

  return {
    src,
    alt,
    url: url || undefined,
    width: width ?? '100%',
    align,
    borderRadius: brInfo.borderRadius ?? existingData?.borderRadius,
    borderRadiusTopLeft: brInfo.borderRadiusTopLeft ?? existingData?.borderRadiusTopLeft,
    borderRadiusTopRight: brInfo.borderRadiusTopRight ?? existingData?.borderRadiusTopRight,
    borderRadiusBottomLeft: brInfo.borderRadiusBottomLeft ?? existingData?.borderRadiusBottomLeft,
    borderRadiusBottomRight: brInfo.borderRadiusBottomRight ?? existingData?.borderRadiusBottomRight,
    useCustomCorners: brInfo.useCustomCorners ?? existingData?.useCustomCorners
  };
}

/**
 * Atualiza ou constrói o bloco 'divider'.
 */
function extractDividerBlockData(
  blockEl: Element,
  existingData?: DividerBlockContent
): DividerBlockContent {
  const lineCell = blockEl.querySelector('td[style*="border-top"], hr') || blockEl.querySelector('td td');
  const lineStyles = parseInlineStyleString(lineCell?.getAttribute('style'));

  // Cor
  let color = parseColor(lineStyles['border-top-color']);
  let height = parsePx(lineStyles['border-top-width']);
  let style: 'solid' | 'dashed' | 'dotted' = existingData?.style || 'solid';

  if (lineStyles['border-top']) {
    const bInfo = parseBorder(lineStyles['border-top']);
    if (bInfo.borderColor) color = bInfo.borderColor;
    if (bInfo.borderWidth) height = bInfo.borderWidth;
    if (bInfo.borderStyle) style = bInfo.borderStyle;
  }

  // Padding vertical da célula externa
  const padCell = blockEl.querySelector('td[style*="padding"]') || blockEl.querySelector('td');
  const padInfo = parsePadding(padCell);
  const paddingY = padInfo.paddingTop ?? padInfo.paddingBottom ?? existingData?.paddingY ?? 10;

  return {
    color: color || existingData?.color || '#e5e7eb',
    height: height || existingData?.height || 1,
    style: style || 'solid',
    paddingY
  };
}

/**
 * Atualiza ou constrói o bloco 'spacer'.
 */
function extractSpacerBlockData(
  blockEl: Element,
  existingData?: SpacerBlockContent
): SpacerBlockContent {
  const spacerCell = blockEl.querySelector('td[height], td[style*="height"]') || blockEl.querySelector('td');
  const cellStyles = parseInlineStyleString(spacerCell?.getAttribute('style'));

  const heightVal =
    parsePx(spacerCell?.getAttribute('height')) ||
    parsePx(cellStyles['height']) ||
    existingData?.height ||
    20;

  return {
    height: heightVal
  };
}

/**
 * Atualiza ou constrói o bloco 'table'.
 */
function extractTableBlockData(
  blockEl: Element,
  existingData?: TableBlockContent
): TableBlockContent {
  const tableEl = blockEl.querySelector('table');
  if (!tableEl) {
    return existingData || { headers: ['Item', 'Descrição'], rows: [['Item 1', 'Desc 1']] };
  }

  const thElements = Array.from(tableEl.querySelectorAll('th'));
  const headers = thElements.length > 0
    ? thElements.map((th) => th.textContent?.trim() || '')
    : (existingData?.headers || ['Item', 'Descrição', 'Valor']);

  const trElements = Array.from(tableEl.querySelectorAll('tbody tr, tr')).filter(
    (tr) => tr.querySelectorAll('td').length > 0
  );

  const rows: string[][] = trElements.map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.innerHTML.trim())
  );

  // Estilos de cabeçalho e borda
  const firstTh = thElements[0];
  const thStyles = parseInlineStyleString(firstTh?.getAttribute('style'));
  const headerBg = parseColor(thStyles['background-color']) || existingData?.headerBg;
  const headerColor = parseColor(thStyles['color']) || existingData?.headerColor;

  const tableStyles = parseInlineStyleString(tableEl.getAttribute('style'));
  const borderColor = parseColor(tableStyles['border-color']) || existingData?.borderColor;

  return {
    headers: headers.length > 0 ? headers : ['Item', 'Descrição'],
    rows: rows.length > 0 ? rows : [['Item 1', 'Exemplo']],
    headerBg,
    headerColor,
    borderColor,
    striped: existingData?.striped ?? true
  };
}

/**
 * Atualiza ou constrói o bloco 'html'.
 */
function extractHtmlBlockData(
  blockEl: Element,
  existingData?: HtmlBlockContent
): HtmlBlockContent {
  const rawHtml = blockEl.innerHTML.trim();
  return {
    rawHtml: rawHtml.length > 0 ? rawHtml : (existingData?.rawHtml || '<!-- HTML Personalizado -->')
  };
}

/**
 * Extrai estilos de wrapper do bloco (margens, fundo, padding).
 */
function extractBlockWrapperStyles(blockEl: Element) {
  const styles = parseInlineStyleString(blockEl.getAttribute('style'));
  const pad = parsePadding(blockEl);
  const br = parseBorderRadius(blockEl);
  const b = parseBorder(blockEl);

  return {
    marginTop: parsePx(styles['margin-top']),
    marginBottom: parsePx(styles['margin-bottom']),
    marginLeft: parsePx(styles['margin-left']),
    marginRight: parsePx(styles['margin-right']),
    backgroundColor: parseColor(styles['background-color']) || parseColor(styles['background']),
    padding: pad.paddingTop ?? parsePx(styles['padding']),
    borderRadius: br.borderRadius,
    borderWidth: b.borderWidth,
    borderColor: b.borderColor,
    borderStyle: b.borderStyle
  };
}

// ============================================================================
// IDENTIFICAÇÃO AUTOMÁTICA DE TIPO DE BLOCO (PARA BLOCOS NOVOS OU RAW HTML)
// ============================================================================

function detectBlockType(el: Element): BlockType {
  // 1. Botão: possui atributos semânticos ou link estilizado como botão
  if (el.hasAttribute('data-button-cell') || el.querySelector('[data-button-link]')) {
    return 'button';
  }

  const aTag = el.tagName === 'A' ? el : el.querySelector('a');
  if (aTag) {
    const aClasses = (aTag.className || '').toLowerCase();
    const isBtnClass = aClasses.includes('btn') || aClasses.includes('button');

    const aStyles = parseInlineStyleString(aTag.getAttribute('style'));
    const parentEl = aTag.parentElement;
    const parentStyles = parseInlineStyleString(parentEl?.getAttribute('style'));

    const hasBg = Boolean(
      aStyles['background-color'] ||
      aStyles['background'] ||
      parentStyles['background-color'] ||
      parentStyles['background'] ||
      parentEl?.getAttribute('bgcolor')
    );
    const hasPad = Boolean(aStyles['padding'] || aStyles['padding-top'] || parentStyles['padding']);

    // Se tem classe de botão ou se tem cor de fundo e padding
    if (isBtnClass || (hasBg && hasPad)) {
      return 'button';
    }
  }

  // 2. Imagem: possui <img> sem muito texto adicional ao redor
  if (el.querySelector('img')) {
    const textLen = (el.textContent || '').trim().length;
    if (textLen < 50) return 'image';
  }

  // 3. Divisor: célula com border-top ou tag <hr>
  if (el.tagName === 'HR' || el.querySelector('hr') || el.querySelector('td[style*="border-top"], td[data-divider-line]')) {
    return 'divider';
  }

  // 4. Espaçador: célula vazia ou &nbsp; com altura definida
  const td = el.tagName === 'TD' ? el : el.querySelector('td');
  if (td) {
    const text = (td.textContent || '').replace(/\u00a0/g, '').trim();
    const hasHeight = td.hasAttribute('height') || (td.getAttribute('style') || '').includes('height:');
    if (hasHeight && text.length === 0 && !td.querySelector('img, a, p, h1, h2, h3, table')) {
      return 'spacer';
    }
  }

  // 5. Tabela de dados
  const table = el.tagName === 'TABLE' ? el : el.querySelector('table');
  if (table && (table.querySelector('th') || table.querySelectorAll('tr').length > 1)) {
    return 'table';
  }

  // 6. Texto: parágrafos, cabeçalhos, listas, cards de texto
  if (
    el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, span, blockquote') ||
    el.hasAttribute('data-text-cell') ||
    ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE'].includes(el.tagName)
  ) {
    return 'text';
  }

  // 7. Se tem texto significativo
  if ((el.textContent || '').trim().length > 0) {
    return 'text';
  }

  return 'html';
}

/**
 * Cria um EmailBlock novo a partir de um elemento DOM desconhecido ou novo.
 */
function createBlockFromElement(el: Element, forcedType?: BlockType): EmailBlock {
  const type = forcedType || detectBlockType(el);
  const id = el.getAttribute('data-block-id') || generateUniqueId('blk');
  const wrapperStyles = extractBlockWrapperStyles(el);

  let content: EmailBlock['content'];

  switch (type) {
    case 'text':
      content = { type: 'text', data: extractTextBlockData(el) };
      break;
    case 'button':
      content = { type: 'button', data: extractButtonBlockData(el) };
      break;
    case 'image':
      content = { type: 'image', data: extractImageBlockData(el) };
      break;
    case 'divider':
      content = { type: 'divider', data: extractDividerBlockData(el) };
      break;
    case 'spacer':
      content = { type: 'spacer', data: extractSpacerBlockData(el) };
      break;
    case 'table':
      content = { type: 'table', data: extractTableBlockData(el) };
      break;
    case 'html':
    default:
      content = { type: 'html', data: extractHtmlBlockData(el) };
      break;
  }

  return {
    id,
    type,
    content,
    styles: wrapperStyles
  };
}

// ============================================================================
// AUXILIARES DE PARSING SEMÂNTICO (HEADER, FOOTER, CARDS, BOTÕES)
// ============================================================================

function isHeaderLike(el: Element): boolean {
  const cls = (el.className || '').toLowerCase();
  const id = (el.id || '').toLowerCase();
  const tag = el.tagName.toLowerCase();
  return cls.includes('header') || id.includes('header') || tag === 'header';
}

function isFooterLike(el: Element): boolean {
  const cls = (el.className || '').toLowerCase();
  const id = (el.id || '').toLowerCase();
  const tag = el.tagName.toLowerCase();
  return cls.includes('footer') || id.includes('footer') || tag === 'footer';
}

function isCardLike(el: Element): boolean {
  const cls = (el.className || '').toLowerCase();
  if (cls.includes('card') || cls.includes('box') || cls.includes('alert') || cls.includes('highlight') || cls.includes('info')) {
    return true;
  }
  const styles = parseInlineStyleString(el.getAttribute('style'));
  const hasBg = Boolean(styles['background-color'] || styles['background']);
  const hasBorder = Boolean(styles['border'] || styles['border-width'] || styles['border-color']);
  return hasBg && (hasBorder || Boolean(styles['border-radius']) || Boolean(styles['padding']));
}

function isButtonElement(el: Element): boolean {
  return detectBlockType(el) === 'button';
}

/**
 * Converte uma lista de elementos HTML em uma sequência organizada de EmailBlocks,
 * agrupando parágrafos consecutivos simples e mantendo cards e botões como blocos destacados.
 */
function parseElementsToBlocks(
  elements: Element[],
  options?: { defaultColor?: string; defaultAlign?: 'left' | 'center' | 'right' }
): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  let pendingTextHtml: string[] = [];

  function flushPendingText() {
    if (pendingTextHtml.length === 0) return;
    const combinedHtml = pendingTextHtml.join('\n');
    pendingTextHtml = [];

    blocks.push({
      id: generateUniqueId('blk'),
      type: 'text',
      content: {
        type: 'text',
        data: {
          html: combinedHtml,
          align: options?.defaultAlign || 'left',
          color: options?.defaultColor
        }
      }
    });
  }

  for (const el of elements) {
    // 1. Botão
    if (isButtonElement(el)) {
      flushPendingText();
      blocks.push(createBlockFromElement(el, 'button'));
      continue;
    }

    // 2. Imagem
    if (detectBlockType(el) === 'image') {
      flushPendingText();
      blocks.push(createBlockFromElement(el, 'image'));
      continue;
    }

    // 3. Divisor
    if (detectBlockType(el) === 'divider') {
      flushPendingText();
      blocks.push(createBlockFromElement(el, 'divider'));
      continue;
    }

    // 4. Espaçador
    if (detectBlockType(el) === 'spacer') {
      flushPendingText();
      blocks.push(createBlockFromElement(el, 'spacer'));
      continue;
    }

    // 5. Tabela de dados
    if (detectBlockType(el) === 'table') {
      flushPendingText();
      blocks.push(createBlockFromElement(el, 'table'));
      continue;
    }

    // 6. Card estilizado (.card-info, alert, etc.)
    if (isCardLike(el)) {
      flushPendingText();
      const wrapperStyles = extractBlockWrapperStyles(el);
      const cellStyles = parseInlineStyleString(el.getAttribute('style'));
      blocks.push({
        id: el.getAttribute('data-block-id') || generateUniqueId('blk'),
        type: 'text',
        content: {
          type: 'text',
          data: {
            html: el.innerHTML.trim() || el.outerHTML,
            align: (cellStyles['text-align'] as any) || options?.defaultAlign || 'left',
            color: parseColor(cellStyles['color']) || options?.defaultColor
          }
        },
        styles: wrapperStyles
      });
      continue;
    }

    // 7. Texto simples (p, h1-6, ul, ol, blockquote)
    const tag = el.tagName.toLowerCase();
    const isSimple = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote'].includes(tag);
    if (isSimple) {
      pendingTextHtml.push(el.outerHTML);
    } else {
      const rawText = (el.textContent || '').trim();
      if (rawText.length > 0) {
        pendingTextHtml.push(el.outerHTML);
      }
    }
  }

  flushPendingText();
  return blocks;
}

// ============================================================================
// PARSERS DE SEÇÃO POR TIPO DE CONTAINER (TABELA vs SEMÂNTICO / DIV)
// ============================================================================

function parseTableContainer(container: Element, sections: EmailSection[]): void {
  const rows = Array.from(container.querySelectorAll(':scope > tbody > tr, :scope > tr'));

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];

    const text = (row.textContent || '').trim();
    const hasMedia = Boolean(row.querySelector('img, a, table, hr, td[style*="border-top"]'));
    if (!text && !hasMedia) {
      continue;
    }

    // Estilos da linha / célula da seção
    const secTd = row.querySelector(':scope > td') || row;
    const secStyles = parseInlineStyleString(secTd.getAttribute('style'));
    const padInfo = parsePadding(secTd);
    const brInfo = parseBorderRadius(secTd);
    const bInfo = parseBorder(secTd);

    const sectionBg = parseColor(secStyles['background-color']) || parseColor(secStyles['background']) || parseColor(secTd.getAttribute('bgcolor'));

    // Verificar colunas (.email-column ou células <td> da tabela interna)
    const columnEls = Array.from(row.querySelectorAll('.email-column'));
    let secType: SectionType = '1-col';
    const columns: EmailColumn[] = [];

    if (columnEls.length > 1) {
      if (columnEls.length === 2) secType = '2-col';
      else if (columnEls.length === 3) secType = '3-col';
      else secType = '4-col';

      const defaultWidth = Math.round(100 / columnEls.length);

      columnEls.forEach((cEl) => {
        const colId = cEl.getAttribute('data-column-id') || generateUniqueId('col');
        const colStyles = parseInlineStyleString(cEl.getAttribute('style'));
        const colPad = parsePadding(cEl);
        const colBg = parseColor(colStyles['background-color']) || parseColor(colStyles['background']);

        const blockEls = Array.from(cEl.querySelectorAll(':scope > table, :scope > div, :scope > p'));
        const blocks: EmailBlock[] = [];

        if (blockEls.length > 0) {
          blockEls.forEach((bEl) => {
            blocks.push(createBlockFromElement(bEl));
          });
        } else {
          blocks.push(createBlockFromElement(cEl, 'text'));
        }

        columns.push({
          id: colId,
          widthPercent: defaultWidth,
          styles: {
            backgroundColor: colBg,
            padding: colPad.paddingTop
          },
          blocks
        });
      });
    } else {
      secType = '1-col';
      const colId = generateUniqueId('col');
      const contentTd = secTd.querySelector('table td') || secTd;

      const candidateBlocks = Array.from(
        contentTd.querySelectorAll(':scope > table, :scope > div, :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > hr')
      );

      const blocks: EmailBlock[] = [];

      if (candidateBlocks.length > 0) {
        candidateBlocks.forEach((bEl) => {
          blocks.push(createBlockFromElement(bEl));
        });
      } else {
        blocks.push({
          id: generateUniqueId('blk'),
          type: 'text',
          content: {
            type: 'text',
            data: {
              html: contentTd.innerHTML.trim() || '<p>Conteúdo do e-mail</p>',
              align: 'left'
            }
          }
        });
      }

      columns.push({
        id: colId,
        widthPercent: 100,
        blocks
      });
    }

    sections.push({
      id: row.getAttribute('data-section-id') || generateUniqueId('sec'),
      type: secType,
      styles: {
        backgroundColor: sectionBg,
        paddingTop: padInfo.paddingTop ?? 15,
        paddingBottom: padInfo.paddingBottom ?? 15,
        paddingLeft: padInfo.paddingLeft ?? 20,
        paddingRight: padInfo.paddingRight ?? 20,
        borderRadius: brInfo.borderRadius,
        borderRadiusTopLeft: brInfo.borderRadiusTopLeft,
        borderRadiusTopRight: brInfo.borderRadiusTopRight,
        borderRadiusBottomLeft: brInfo.borderRadiusBottomLeft,
        borderRadiusBottomRight: brInfo.borderRadiusBottomRight,
        useCustomCorners: brInfo.useCustomCorners,
        borderWidth: bInfo.borderWidth,
        borderColor: bInfo.borderColor,
        borderStyle: bInfo.borderStyle
      },
      columns
    });
  }
}

function parseSemanticContainer(
  container: Element,
  sections: EmailSection[],
  globalStyles: EmailDesignGlobalStyles
): void {
  const contBorderRadius = parseBorderRadius(container);

  // 1. Procurar Header
  const headerEl =
    container.querySelector('.header, header, [class*="header"]') ||
    (container.firstElementChild && isHeaderLike(container.firstElementChild) ? container.firstElementChild : null);

  // 2. Procurar Footer
  const footerEl =
    container.querySelector('.footer, footer, [class*="footer"]') ||
    (container.lastElementChild && container.lastElementChild !== headerEl && isFooterLike(container.lastElementChild)
      ? container.lastElementChild
      : null);

  // 3. Procurar Content
  const contentEl =
    container.querySelector('.content, main, [class*="content"]') ||
    container;

  // Processar HEADER
  if (headerEl) {
    const hStyles = parseInlineStyleString(headerEl.getAttribute('style'));
    const hPad = parsePadding(headerEl);
    const hBg = parseColor(hStyles['background-color']) || parseColor(hStyles['background']) || '#0e4a5a';
    const hColor = parseColor(hStyles['color']) || '#ffffff';
    const hAlign = (hStyles['text-align'] || 'center') as 'left' | 'center' | 'right';

    const topRadius = contBorderRadius.borderRadius || contBorderRadius.borderRadiusTopLeft || 12;

    const headerChildren = Array.from(headerEl.children);
    const headerBlocks = headerChildren.length > 0
      ? parseElementsToBlocks(headerChildren, { defaultColor: hColor, defaultAlign: hAlign })
      : [
          {
            id: generateUniqueId('blk'),
            type: 'text' as const,
            content: {
              type: 'text' as const,
              data: {
                html: headerEl.innerHTML.trim() || '<h2 style="margin:0;">Título</h2>',
                align: hAlign,
                color: hColor
              }
            }
          }
        ];

    sections.push({
      id: headerEl.getAttribute('data-section-id') || generateUniqueId('sec'),
      type: 'header',
      styles: {
        backgroundColor: hBg,
        paddingTop: hPad.paddingTop ?? 24,
        paddingBottom: hPad.paddingBottom ?? 24,
        paddingLeft: hPad.paddingLeft ?? 24,
        paddingRight: hPad.paddingRight ?? 24,
        borderRadiusTopLeft: topRadius,
        borderRadiusTopRight: topRadius,
        borderRadiusBottomLeft: 0,
        borderRadiusBottomRight: 0,
        useCustomCorners: true
      },
      columns: [
        {
          id: generateUniqueId('col'),
          widthPercent: 100,
          blocks: headerBlocks
        }
      ]
    });
  }

  // Processar CONTENT
  if (contentEl) {
    const cStyles = parseInlineStyleString(contentEl.getAttribute('style'));
    const cPad = parsePadding(contentEl);
    const cBg = parseColor(cStyles['background-color']) || parseColor(cStyles['background']) || globalStyles.contentBackgroundColor || '#ffffff';

    const childrenToParse: Element[] = [];
    Array.from(contentEl.children).forEach((child) => {
      if (child === headerEl || child === footerEl) return;
      if (headerEl && headerEl.contains(child)) return;
      if (footerEl && footerEl.contains(child)) return;
      childrenToParse.push(child);
    });

    const blocks = parseElementsToBlocks(childrenToParse, {
      defaultColor: globalStyles.textColor || '#333333',
      defaultAlign: 'left'
    });

    sections.push({
      id: contentEl.getAttribute('data-section-id') || generateUniqueId('sec'),
      type: '1-col',
      styles: {
        backgroundColor: cBg,
        paddingTop: cPad.paddingTop ?? (headerEl ? 24 : 32),
        paddingBottom: cPad.paddingBottom ?? (footerEl ? 24 : 32),
        paddingLeft: cPad.paddingLeft ?? 24,
        paddingRight: cPad.paddingRight ?? 24
      },
      columns: [
        {
          id: generateUniqueId('col'),
          widthPercent: 100,
          blocks: blocks.length > 0 ? blocks : [
            {
              id: generateUniqueId('blk'),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: contentEl.innerHTML.trim() || '<p>Conteúdo do e-mail</p>',
                  align: 'left'
                }
              }
            }
          ]
        }
      ]
    });
  }

  // Processar FOOTER
  if (footerEl) {
    const fStyles = parseInlineStyleString(footerEl.getAttribute('style'));
    const fPad = parsePadding(footerEl);
    const fBg = parseColor(fStyles['background-color']) || parseColor(fStyles['background']) || globalStyles.contentBackgroundColor || '#ffffff';
    const fColor = parseColor(fStyles['color']) || '#64748b';
    const fAlign = (fStyles['text-align'] || 'center') as 'left' | 'center' | 'right';
    const fBorder = parseBorder(footerEl);

    const bottomRadius = contBorderRadius.borderRadius || contBorderRadius.borderRadiusBottomLeft || 12;

    sections.push({
      id: footerEl.getAttribute('data-section-id') || generateUniqueId('sec'),
      type: 'footer',
      styles: {
        backgroundColor: fBg,
        paddingTop: fPad.paddingTop ?? 20,
        paddingBottom: fPad.paddingBottom ?? 20,
        paddingLeft: fPad.paddingLeft ?? 20,
        paddingRight: fPad.paddingRight ?? 20,
        borderRadiusTopLeft: 0,
        borderRadiusTopRight: 0,
        borderRadiusBottomLeft: bottomRadius,
        borderRadiusBottomRight: bottomRadius,
        useCustomCorners: true,
        borderWidth: fBorder.borderWidth ?? (fStyles['border-top'] ? 1 : undefined),
        borderColor: fBorder.borderColor ?? '#e2e8f0',
        borderStyle: 'solid'
      },
      columns: [
        {
          id: generateUniqueId('col'),
          widthPercent: 100,
          blocks: [
            {
              id: generateUniqueId('blk'),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: footerEl.innerHTML.trim(),
                  align: fAlign,
                  color: fColor,
                  fontSize: parsePx(fStyles['font-size']) || 12
                }
              }
            }
          ]
        }
      ]
    });
  }
}

// ============================================================================
// PARSER RAW HTML (SEM DESIGN PRÉVIO OU TEMPLATE IMPORTADO)
// ============================================================================

export function parseRawHtmlToDesignFromDoc(doc: Document): EmailDesign {
  inlineStylesFromHead(doc);
  const globalStyles = extractGlobalStyles(doc);
  const sections: EmailSection[] = [];

  // Localizar container de tabela ou div
  const tableContainer =
    doc.querySelector('table[data-email-container="true"]') ||
    doc.querySelector('table.email-container') ||
    doc.querySelector('table[style*="max-width"]') ||
    doc.querySelector('body > table');

  const divContainer =
    doc.querySelector('div.container') ||
    doc.querySelector('div[class*="container"]') ||
    doc.querySelector('div[style*="max-width"]') ||
    doc.querySelector('body > div');

  // CASO 1: Container de Tabela com linhas <tr>
  if (tableContainer && tableContainer.querySelectorAll(':scope > tbody > tr, :scope > tr').length > 0) {
    parseTableContainer(tableContainer, sections);
  }
  // CASO 2: Container semântico baseado em DIVs ou body
  else if (divContainer || doc.querySelector('.header, .content, .footer, header, main, footer')) {
    parseSemanticContainer(divContainer || doc.body, sections, globalStyles);
  }

  // Fallback se nenhuma seção foi encontrada
  if (sections.length === 0) {
    const bodyContent = doc.body ? doc.body.innerHTML.trim() : '';
    sections.push({
      id: generateUniqueId('sec'),
      type: '1-col',
      styles: {
        backgroundColor: '#ffffff',
        paddingTop: 20,
        paddingBottom: 20,
        paddingLeft: 20,
        paddingRight: 20
      },
      columns: [
        {
          id: generateUniqueId('col'),
          widthPercent: 100,
          blocks: [
            {
              id: generateUniqueId('blk'),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: bodyContent.length > 0 ? bodyContent : '<p>Seu conteúdo de e-mail aqui...</p>',
                  align: 'left'
                }
              }
            }
          ]
        }
      ]
    });
  }

  return {
    version: '1.0.0',
    globalStyles,
    sections
  };
}

export function parseRawHtmlToDesign(html: string): EmailDesign {
  const doc = parseHtmlToDomDocument(html);
  if (!doc) {
    return createBlankDesign();
  }
  return parseRawHtmlToDesignFromDoc(doc);
}

// ============================================================================
// RECONCILIAÇÃO BIDIRECIONAL (HTML EDITADO -> CURRENT DESIGN)
// ============================================================================

/**
 * Reconcilia um EmailDesign existente com um HTML modificado pelo usuário no editor de código.
 * Preserva IDs, adiciona nós novos criados no HTML e remove nós que foram deletados.
 */
function reconcileDesignWithDom(doc: Document, currentDesign: EmailDesign): EmailDesign {
  const design: EmailDesign = JSON.parse(JSON.stringify(currentDesign));

  // 1. Atualizar Estilos Globais
  design.globalStyles = extractGlobalStyles(doc, design.globalStyles);

  // 2. Mapeamento de Seções do DOM
  const domSectionsWithId = Array.from(doc.querySelectorAll('[data-section-id]'));
  const domSectionMap = new Map<string, Element>();
  domSectionsWithId.forEach((el) => {
    const sid = el.getAttribute('data-section-id');
    if (sid) domSectionMap.set(sid, el);
  });

  const hasExplicitSectionIds = domSectionMap.size > 0;

  const container =
    doc.querySelector('table[data-email-container="true"]') ||
    doc.querySelector('table.email-container') ||
    doc.querySelector('table[style*="max-width"]') ||
    doc.querySelector('body > table');

  const containerRows = container
    ? Array.from(container.querySelectorAll(':scope > tbody > tr, :scope > tr'))
    : [];

  // Se o HTML não possui marcadores de seção e nem linhas de tabela correspondentes,
  // foi substituído no código por um template novo ou colado. Executa parse completo!
  if (!hasExplicitSectionIds && containerRows.length === 0) {
    return parseRawHtmlToDesignFromDoc(doc);
  }

  const updatedSections: EmailSection[] = [];
  const processedDomSectionIds = new Set<string>();

  // Iterar pelas seções do design existente
  design.sections.forEach((sec, secIdx) => {
    let secEl: Element | undefined;

    if (hasExplicitSectionIds) {
      secEl = domSectionMap.get(sec.id);
    } else if (secIdx < containerRows.length) {
      secEl = containerRows[secIdx];
    }

    // Se a seção não foi encontrada no DOM (e havia IDs explícitos), foi DELETADA no código
    if (!secEl) {
      return;
    }

    processedDomSectionIds.add(sec.id);

    // Atualizar Estilos da Seção
    const secTd = secEl.querySelector(':scope > td') || secEl;
    const secStyles = parseInlineStyleString(secTd.getAttribute('style'));
    const secBg = parseColor(secStyles['background-color']) || parseColor(secStyles['background']) || parseColor(secTd.getAttribute('bgcolor'));
    if (secBg !== undefined) sec.styles.backgroundColor = secBg;

    const pad = parsePadding(secTd);
    if (pad.paddingTop !== undefined) sec.styles.paddingTop = pad.paddingTop;
    if (pad.paddingBottom !== undefined) sec.styles.paddingBottom = pad.paddingBottom;
    if (pad.paddingLeft !== undefined) sec.styles.paddingLeft = pad.paddingLeft;
    if (pad.paddingRight !== undefined) sec.styles.paddingRight = pad.paddingRight;

    const br = parseBorderRadius(secTd);
    if (br.borderRadius !== undefined) sec.styles.borderRadius = br.borderRadius;
    if (br.borderRadiusTopLeft !== undefined) sec.styles.borderRadiusTopLeft = br.borderRadiusTopLeft;
    if (br.borderRadiusTopRight !== undefined) sec.styles.borderRadiusTopRight = br.borderRadiusTopRight;
    if (br.borderRadiusBottomLeft !== undefined) sec.styles.borderRadiusBottomLeft = br.borderRadiusBottomLeft;
    if (br.borderRadiusBottomRight !== undefined) sec.styles.borderRadiusBottomRight = br.borderRadiusBottomRight;
    if (br.useCustomCorners !== undefined) sec.styles.useCustomCorners = br.useCustomCorners;

    const bInfo = parseBorder(secTd);
    if (bInfo.borderWidth !== undefined) sec.styles.borderWidth = bInfo.borderWidth;
    if (bInfo.borderColor !== undefined) sec.styles.borderColor = bInfo.borderColor;
    if (bInfo.borderStyle !== undefined) sec.styles.borderStyle = bInfo.borderStyle;

    // Reconciliar Colunas e Blocos
    const domColElements = Array.from(secEl.querySelectorAll('.email-column, [data-column-id]'));
    const isMultiCol = sec.columns.length > 1;

    sec.columns.forEach((col, colIdx) => {
      let colEl: Element | null = null;
      if (isMultiCol) {
        colEl =
          secEl?.querySelector(`[data-column-id="${col.id}"]`) ||
          (colIdx < domColElements.length ? domColElements[colIdx] : null);
      } else {
        colEl = secEl?.querySelector(`[data-column-id="${col.id}"]`) || secTd;
      }

      if (!colEl) return;

      const colStyles = parseInlineStyleString(colEl.getAttribute('style'));
      const colBg = parseColor(colStyles['background-color']) || parseColor(colStyles['background']);
      if (colBg) {
        if (!col.styles) col.styles = {};
        col.styles.backgroundColor = colBg;
      }

      // Mapeamento de blocos com data-block-id dentro da coluna
      const domBlocksWithId = Array.from(colEl.querySelectorAll('[data-block-id]'));
      const domBlockMap = new Map<string, Element>();
      domBlocksWithId.forEach((bEl) => {
        const bid = bEl.getAttribute('data-block-id');
        if (bid) domBlockMap.set(bid, bEl);
      });

      const hasBlockDataIds = domBlockMap.size > 0;
      const updatedBlocks: EmailBlock[] = [];
      const processedBlockIds = new Set<string>();

      // Candidatos a blocos do DOM em ordem
      const domCandidateBlocks = Array.from(
        colEl.querySelectorAll(':scope > table, :scope > div, :scope > p, :scope > hr, [data-block-id]')
      );

      // Reconciliar blocos existentes
      col.blocks.forEach((block, bIdx) => {
        let blockEl: Element | undefined;

        if (hasBlockDataIds) {
          blockEl = domBlockMap.get(block.id);
        } else if (bIdx < domCandidateBlocks.length) {
          blockEl = domCandidateBlocks[bIdx];
        }

        // Se o bloco sumiu do DOM, foi DELETADO pelo usuário no código
        if (!blockEl) {
          return;
        }

        processedBlockIds.add(block.id);

        // Atualizar wrapper styles
        const bWrapStyles = extractBlockWrapperStyles(blockEl);
        block.styles = {
          ...block.styles,
          ...bWrapStyles
        };

        // Atualizar dados de acordo com o tipo
        switch (block.type) {
          case 'text':
            block.content = {
              type: 'text',
              data: extractTextBlockData(blockEl, block.content.data as TextBlockContent)
            };
            break;

          case 'button':
            block.content = {
              type: 'button',
              data: extractButtonBlockData(blockEl, block.content.data as ButtonBlockContent)
            };
            break;

          case 'image':
            block.content = {
              type: 'image',
              data: extractImageBlockData(blockEl, block.content.data as ImageBlockContent)
            };
            break;

          case 'divider':
            block.content = {
              type: 'divider',
              data: extractDividerBlockData(blockEl, block.content.data as DividerBlockContent)
            };
            break;

          case 'spacer':
            block.content = {
              type: 'spacer',
              data: extractSpacerBlockData(blockEl, block.content.data as SpacerBlockContent)
            };
            break;

          case 'table':
            block.content = {
              type: 'table',
              data: extractTableBlockData(blockEl, block.content.data as TableBlockContent)
            };
            break;

          case 'html':
            block.content = {
              type: 'html',
              data: extractHtmlBlockData(blockEl, block.content.data as HtmlBlockContent)
            };
            break;
        }

        updatedBlocks.push(block);
      });

      // Detecção de novos blocos inseridos manualmente no código HTML desta coluna
      domCandidateBlocks.forEach((bEl) => {
        const bId = bEl.getAttribute('data-block-id');
        if (!bId || !processedBlockIds.has(bId)) {
          const newBlock = createBlockFromElement(bEl);
          updatedBlocks.push(newBlock);
        }
      });

      col.blocks = updatedBlocks;
    });

    updatedSections.push(sec);
  });

  // Detecção de novas seções adicionadas no HTML com data-section-id novo
  domSectionsWithId.forEach((secEl) => {
    const sId = secEl.getAttribute('data-section-id');
    if (sId && !processedDomSectionIds.has(sId)) {
      const parsedSec = parseRawHtmlToDesign(secEl.outerHTML);
      if (parsedSec.sections[0]) {
        updatedSections.push(parsedSec.sections[0]);
      }
    }
  });

  design.sections = updatedSections;
  return design;
}

// ============================================================================
// FUNÇÃO PRINCIPAL EXPORTADA
// ============================================================================

/**
 * Função principal para sincronização de HTML para EmailDesign.
 * Reconcilia as alterações de código (cores, textos, botões, seções) com o estado do design
 * ou constrói um novo design se currentDesign for nulo/indefinido.
 */
export function syncHtmlToEmailDesign(html: string, currentDesign?: EmailDesign | null): EmailDesign {
  if (!html || typeof html !== 'string' || !html.trim()) {
    return currentDesign || createBlankDesign();
  }

  try {
    const doc = parseHtmlToDomDocument(html);
    if (!doc) {
      console.warn('[emailHtmlParser] Não foi possível obter o documento DOM. Mantendo estado atual.');
      return currentDesign || createBlankDesign();
    }

    // SEMPRE inlinar estilos do <head> no DOM antes de qualquer análise
    inlineStylesFromHead(doc);

    if (!currentDesign || !currentDesign.sections || currentDesign.sections.length === 0) {
      return parseRawHtmlToDesignFromDoc(doc);
    }

    return reconcileDesignWithDom(doc, currentDesign);
  } catch (error) {
    console.error('[emailHtmlParser] Falha inesperada na reconciliação HTML -> Design:', error);
    return currentDesign || createBlankDesign();
  }
}
