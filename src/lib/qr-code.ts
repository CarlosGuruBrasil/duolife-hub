import QRCode from 'qrcode';

export interface QrCodeOptions {
  color?: string;
  margin?: number;
  width?: number;
}

export interface DisplayCardParams {
  url: string;
  companyName: string;
  companySlogan?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  label?: string | null;
  discountPercent?: number | null;
  sellerName?: string | null;
}

/**
 * Calcula a luminância relativa de uma cor hexadecimal (WCAG).
 */
export function calculateLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6) return 0;

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Garante que a cor utilizada no QR Code tenha contraste adequado com fundo branco.
 * Se a cor for excessivamente clara (luminância > 0.45), aplica o fallback escuro seguro.
 */
export function ensureReadableColor(color?: string | null, fallback = '#0e4a5a'): string {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    return fallback;
  }
  const lum = calculateLuminance(color);
  // Se a cor for muito clara para contraste contra branco, utiliza o fallback de contraste
  if (lum > 0.45) {
    return fallback;
  }
  return color.toLowerCase();
}

/**
 * Gera um QR Code em formato SVG vetorial limpo.
 */
export async function generateQrCodeSvg(text: string, options: QrCodeOptions = {}): Promise<string> {
  const darkColor = ensureReadableColor(options.color);
  return QRCode.toString(text, {
    type: 'svg',
    width: options.width || 512,
    margin: options.margin ?? 2,
    color: {
      dark: darkColor,
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });
}

/**
 * Gera um QR Code como Data URL (PNG base64).
 */
export async function generateQrCodeDataUrl(text: string, options: QrCodeOptions = {}): Promise<string> {
  const darkColor = ensureReadableColor(options.color);
  return QRCode.toDataURL(text, {
    width: options.width || 1024,
    margin: options.margin ?? 2,
    color: {
      dark: darkColor,
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });
}

/**
 * Gera um Cartão de Divulgação (Display Card / Placa de Balcão) em SVG de alta fidelidade
 * pronto para download vetorial ou rasterização em PNG de alta resolução.
 */
export async function generateDisplayCardSvg(params: DisplayCardParams): Promise<string> {
  const primary = ensureReadableColor(params.primaryColor, '#0e4a5a');
  const accent = params.accentColor && /^#[0-9a-fA-F]{6}$/.test(params.accentColor) ? params.accentColor : '#00d4e0';
  const qrSvgRaw = await generateQrCodeSvg(params.url, { color: primary, margin: 1, width: 340 });

  // Remove tag <svg> externa para incorporar no SVG mestre
  const qrSvgInner = qrSvgRaw
    .replace(/^<svg[^>]*>/i, '')
    .replace(/<\/svg>$/i, '');

  const companyName = params.companyName || 'Sua Corretora';
  const slogan = params.companySlogan || 'Proteção e Consultoria Especializada';
  const label = params.label || 'Contratação de Seguro RC Profissional';
  const discountText = params.discountPercent && params.discountPercent > 0 ? `-${params.discountPercent}% OFF EXCLUSIVO` : 'CONDIÇÕES ESPECIAIS';
  const sellerText = params.sellerName ? `Consultor(a): ${params.sellerName}` : '';
  const contactText = [params.companyPhone, params.companyEmail].filter(Boolean).join(' • ');

  return `
<svg width="800" height="1100" viewBox="0 0 800 1100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&amp;display=swap');
      text { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
    </style>
    <filter id="card-shadow" x="20" y="20" width="760" height="1060" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#000000" flood-opacity="0.08" />
    </filter>
    <filter id="qr-shadow" x="200" y="440" width="400" height="400" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.06" />
    </filter>
  </defs>

  <!-- Fundo Geral -->
  <rect width="800" height="1100" fill="#f8fafc" />

  <!-- Moldura do Cartão Principal -->
  <rect x="40" y="40" width="720" height="1020" rx="32" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" filter="url(#card-shadow)" />

  <!-- Faixa de Destaque Superior com a Cor da Marca -->
  <path d="M 40 72 Q 40 40 72 40 L 728 40 Q 760 40 760 72 L 760 52 L 40 52 Z" fill="${primary}" />
  <rect x="40" y="40" width="720" height="12" rx="6" fill="${primary}" />

  <!-- Cabeçalho Institucional -->
  <text x="400" y="130" text-anchor="middle" font-size="28" font-weight="800" fill="${primary}">${companyName}</text>
  <text x="400" y="165" text-anchor="middle" font-size="14" font-weight="600" fill="#64748b">${slogan}</text>
  <line x1="250" y1="195" x2="550" y2="195" stroke="#f1f5f9" stroke-width="2" />

  <!-- Badge de Desconto / Oferta -->
  <rect x="290" y="225" width="220" height="38" rx="19" fill="${accent}" fill-opacity="0.15" stroke="${accent}" stroke-width="1.5" />
  <text x="400" y="250" text-anchor="middle" font-size="13" font-weight="800" fill="${primary}" letter-spacing="1">${discountText}</text>

  <!-- Título da Campanha / Produto -->
  <text x="400" y="305" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">${label}</text>
  <text x="400" y="335" text-anchor="middle" font-size="14" font-weight="500" fill="#475569">Faça sua contratação 100% digital com emissão expressa</text>
  ${sellerText ? `<text x="400" y="365" text-anchor="middle" font-size="13" font-weight="700" fill="${primary}">${sellerText}</text>` : ''}

  <!-- Moldura Externa do QR Code -->
  <rect x="220" y="420" width="360" height="360" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="3" filter="url(#qr-shadow)" />

  <!-- Código QR Centralizado -->
  <g transform="translate(230, 430)">
    ${qrSvgInner}
  </g>

  <!-- Chamada de Ação (CTA) -->
  <text x="400" y="825" text-anchor="middle" font-size="18" font-weight="800" fill="#0f172a">Aponte a câmera do seu celular</text>
  <text x="400" y="855" text-anchor="middle" font-size="13" font-weight="500" fill="#64748b">Abra o aplicativo de câmera e aponte para o código acima para acessar a proposta</text>

  <!-- Guia 1-2-3 Rápido -->
  <g transform="translate(150, 890)">
    <rect width="500" height="42" rx="12" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
    <text x="250" y="26" text-anchor="middle" font-size="11" font-weight="600" fill="#475569">
      1. Abra a Câmera  •  2. Aponte para o QR Code  •  3. Contrate Online
    </text>
  </g>

  <!-- Rodapé Institucional e Parceria DuoLife -->
  <line x1="80" y1="975" x2="720" y2="975" stroke="#f1f5f9" stroke-width="2" />
  ${contactText ? `<text x="400" y="1005" text-anchor="middle" font-size="12" font-weight="600" fill="#64748b">Atendimento: ${contactText}</text>` : ''}
  <text x="400" y="1035" text-anchor="middle" font-size="11" font-weight="700" fill="#94a3b8" letter-spacing="0.5">PARCERIA OFICIAL DUOLIFE</text>
</svg>
  `.trim();
}
