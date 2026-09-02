import { EmailDesign, EmailSection, EmailColumn, EmailBlock } from './types';

/**
 * Converte um objeto EmailDesign em HTML para e-mail 100% responsivo e compatível com Outlook, Gmail, etc.
 */
export function generateEmailHtml(design: EmailDesign): string {
  const { globalStyles, sections } = design;
  const contentWidth = globalStyles.contentWidth || 600;
  const fontFamily = globalStyles.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial";
  const bgBody = globalStyles.backgroundColor || '#f4f6f8';
  const bgContent = globalStyles.contentBackgroundColor || '#ffffff';
  const textColor = globalStyles.textColor || '#333333';
  const linkColor = globalStyles.linkColor || '#0e4a5a';

  const renderedSections = sections.map((sec) => renderSection(sec, contentWidth, fontFamily, textColor, linkColor)).join('\n');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>DuoLife Hub — E-mail</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${bgBody}; font-family: ${fontFamily}; color: ${textColor}; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    a { color: ${linkColor}; text-decoration: underline; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-column { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
      .email-column-padding { padding-left: 10px !important; padding-right: 10px !important; }
      .mobile-center { text-align: center !important; }
      .mobile-full-width { width: 100% !important; max-width: 100% !important; }
      .mobile-hide { display: none !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${bgBody}; font-family: ${fontFamily}; color: ${textColor};">
  <!-- Wrapper Principal -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bgBody};">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <!-- Container Central com Largura Fixada (600px) -->
        <!--[if (gte mso 9)|(IE)]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="${contentWidth}">
        <tr>
        <td align="center" valign="top" width="${contentWidth}">
        <![endif]-->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: ${contentWidth}px; background-color: ${bgContent}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          ${renderedSections}
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getBorderRadiusCss(obj?: {
  borderRadius?: number;
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomLeft?: number;
  borderRadiusBottomRight?: number;
  useCustomCorners?: boolean;
}): string {
  if (!obj) return '';
  if (obj.useCustomCorners) {
    const tl = obj.borderRadiusTopLeft ?? 0;
    const tr = obj.borderRadiusTopRight ?? 0;
    const br = obj.borderRadiusBottomRight ?? 0;
    const bl = obj.borderRadiusBottomLeft ?? 0;
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) return '';
    return `border-radius: ${tl}px ${tr}px ${br}px ${bl}px; -webkit-border-radius: ${tl}px ${tr}px ${br}px ${bl}px; -moz-border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`;
  }
  if (obj.borderRadius && obj.borderRadius > 0) {
    return `border-radius: ${obj.borderRadius}px; -webkit-border-radius: ${obj.borderRadius}px; -moz-border-radius: ${obj.borderRadius}px;`;
  }
  return '';
}

function renderSection(
  section: EmailSection,
  contentWidth: number,
  fontFamily: string,
  defaultTextColor: string,
  linkColor: string
): string {
  const { styles, columns } = section;
  const bg = styles.backgroundColor ? `background-color: ${styles.backgroundColor};` : '';
  const pt = styles.paddingTop ?? 15;
  const pb = styles.paddingBottom ?? 15;
  const pl = styles.paddingLeft ?? 20;
  const pr = styles.paddingRight ?? 20;
  const borderRadius = getBorderRadiusCss(styles);
  const border = styles.borderWidth && styles.borderColor ? `border: ${styles.borderWidth}px ${styles.borderStyle || 'solid'} ${styles.borderColor};` : '';

  const columnsCount = columns.length;
  const isMultiCol = columnsCount > 1;

  let columnsHtml = '';

  if (!isMultiCol && columnsCount === 1) {
    const col = columns[0];
    const colBlocks = col.blocks.map((b) => renderBlock(b, fontFamily, defaultTextColor, linkColor)).join('\n');
    columnsHtml = `
      <tr>
        <td style="${colBlocks ? '' : 'padding: 10px;'} font-family: ${fontFamily};">
          ${colBlocks}
        </td>
      </tr>`;
  } else {
    // Multi colunas usando inline-blocks responsivos + suporte MSO
    const innerColumns = columns.map((col) => {
      const colWidthPx = Math.floor((contentWidth - (pl + pr)) * (col.widthPercent / 100));
      const colBlocks = col.blocks.map((b) => renderBlock(b, fontFamily, defaultTextColor, linkColor)).join('\n');
      const colPadding = col.styles?.padding ? `padding: ${col.styles.padding}px;` : 'padding: 5px;';
      const colBg = col.styles?.backgroundColor ? `background-color: ${col.styles.backgroundColor};` : '';
      const vAlign = col.styles?.verticalAlign || 'top';

      return `<!--[if (gte mso 9)|(IE)]>
        <td align="left" valign="${vAlign}" width="${colWidthPx}" style="${colPadding}">
        <![endif]-->
        <div class="email-column" style="display: inline-block; width: 100%; max-width: ${colWidthPx}px; vertical-align: ${vAlign}; box-sizing: border-box;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="${colBg}">
            <tr>
              <td style="${colPadding} font-family: ${fontFamily};" class="email-column-padding">
                ${colBlocks || '&nbsp;'}
              </td>
            </tr>
          </table>
        </div>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        <![endif]-->`;
    }).join('\n');

    columnsHtml = `
      <tr>
        <td align="center" valign="top" style="font-size: 0; text-align: left;">
          <!--[if (gte mso 9)|(IE)]>
          <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
          <tr>
          <![endif]-->
          ${innerColumns}
          <!--[if (gte mso 9)|(IE)]>
          </tr>
          </table>
          <![endif]-->
        </td>
      </tr>`;
  }

  return `
    <!-- Seção: ${section.type} -->
    <tr>
      <td align="center" valign="top" style="${bg} padding: ${pt}px ${pr}px ${pb}px ${pl}px; ${borderRadius} ${border}">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          ${columnsHtml}
        </table>
      </td>
    </tr>`;
}

function renderBlock(
  block: EmailBlock,
  fontFamily: string,
  defaultTextColor: string,
  linkColor: string
): string {
  const { content, styles } = block;
  const mt = styles?.marginTop ?? 0;
  const mb = styles?.marginBottom ?? 12;
  const blockBg = styles?.backgroundColor ? `background-color: ${styles.backgroundColor};` : '';
  const blockPad = styles?.padding ? `padding: ${styles.padding}px;` : '';

  switch (content.type) {
    case 'text': {
      const data = content.data;
      const align = data.align || 'left';
      const color = data.color || defaultTextColor;
      const fontSize = data.fontSize ? `${data.fontSize}px` : '15px';
      const lineHeight = data.lineHeight ? `${data.lineHeight}` : '1.5';

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${mt}px; margin-bottom: ${mb}px; ${blockBg} ${blockPad}">
          <tr>
            <td align="${align}" style="font-family: ${fontFamily}; font-size: ${fontSize}; line-height: ${lineHeight}; color: ${color}; text-align: ${align}; word-break: break-word;">
              ${data.html}
            </td>
          </tr>
        </table>`;
    }

    case 'button': {
      const data = content.data;
      const align = data.align || 'center';
      const btnBg = data.buttonColor || '#0e4a5a';
      const btnColor = data.textColor || '#ffffff';
      const radiusCss = getBorderRadiusCss(data) || `border-radius: ${data.borderRadius ?? 6}px;`;
      const fontSize = data.fontSize ? `${data.fontSize}px` : '16px';
      const padY = data.paddingY ?? 12;
      const padX = data.paddingX ?? 24;
      const fullWidth = data.fullWidth;
      const url = data.url || '#';
      const text = data.text || 'Clique Aqui';

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${mt}px; margin-bottom: ${mb}px; ${blockBg} ${blockPad}">
          <tr>
            <td align="${align}">
              <!-- Bulletproof Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="${fullWidth ? 'width: 100%;' : ''}">
                <tr>
                  <td align="center" bgcolor="${btnBg}" style="${radiusCss} background-color: ${btnBg};">
                    <a href="${url}" target="_blank" style="font-family: ${fontFamily}; font-size: ${fontSize}; font-weight: 600; color: ${btnColor}; text-decoration: none; display: block; padding: ${padY}px ${padX}px; ${radiusCss} background-color: ${btnBg}; border: 1px solid ${btnBg};">
                      ${text}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
    }

    case 'image': {
      const data = content.data;
      const align = data.align || 'center';
      const src = data.src || 'https://via.placeholder.com/600x200?text=Imagem+do+Email';
      const alt = data.alt || 'Imagem';
      const url = data.url;
      const widthVal = data.width ? (typeof data.width === 'number' ? `${data.width}px` : data.width) : '100%';
      const radiusCss = getBorderRadiusCss(data);

      const imgTag = `<img src="${src}" alt="${alt}" style="display: block; max-width: 100%; width: ${widthVal}; height: auto; border: 0; outline: none; text-decoration: none; ${radiusCss}" class="mobile-full-width" />`;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${mt}px; margin-bottom: ${mb}px; ${blockBg} ${blockPad}">
          <tr>
            <td align="${align}">
              ${url ? `<a href="${url}" target="_blank" style="text-decoration: none; display: inline-block;">${imgTag}</a>` : imgTag}
            </td>
          </tr>
        </table>`;
    }

    case 'divider': {
      const data = content.data;
      const color = data.color || '#e5e7eb';
      const height = data.height || 1;
      const style = data.style || 'solid';
      const padY = data.paddingY ?? 10;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${mt}px; margin-bottom: ${mb}px; ${blockBg}">
          <tr>
            <td style="padding: ${padY}px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td height="${height}" style="border-top: ${height}px ${style} ${color}; font-size: 1px; line-height: 1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
    }

    case 'spacer': {
      const data = content.data;
      const height = data.height || 20;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="${blockBg}">
          <tr>
            <td height="${height}" style="font-size: 1px; line-height: ${height}px; height: ${height}px;">&nbsp;</td>
          </tr>
        </table>`;
    }

    case 'table': {
      const data = content.data;
      const headers = data.headers || ['Item', 'Descrição', 'Valor'];
      const rows = data.rows || [
        ['Seguro RC', 'Advocacia Individual', 'R$ 1.250,00'],
        ['Importância Segurada', 'Limite Máximo', 'R$ 200.000,00']
      ];
      const headerBg = data.headerBg || '#f8fafc';
      const headerColor = data.headerColor || '#0e4a5a';
      const borderColor = data.borderColor || '#e2e8f0';

      const ths = headers
        .map(
          (h) =>
            `<th align="left" style="padding: 10px 12px; background-color: ${headerBg}; color: ${headerColor}; font-size: 13px; font-weight: 600; border-bottom: 2px solid ${borderColor};">${h}</th>`
        )
        .join('');

      const trs = rows
        .map((r, idx) => {
          const rowBg = data.striped && idx % 2 === 1 ? '#f8fafc' : '#ffffff';
          const tds = r
            .map(
              (cell) =>
                `<td style="padding: 10px 12px; font-size: 13px; color: ${defaultTextColor}; border-bottom: 1px solid ${borderColor}; background-color: ${rowBg};">${cell}</td>`
            )
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${mt}px; margin-bottom: ${mb}px; border: 1px solid ${borderColor}; border-collapse: collapse; ${blockBg}">
          <thead>
            <tr>${ths}</tr>
          </thead>
          <tbody>
            ${trs}
          </tbody>
        </table>`;
    }

    case 'html': {
      const data = content.data;
      return `
        <div style="margin-top: ${mt}px; margin-bottom: ${mb}px; ${blockBg} ${blockPad}">
          ${data.rawHtml || ''}
        </div>`;
    }

    default:
      return '';
  }
}
