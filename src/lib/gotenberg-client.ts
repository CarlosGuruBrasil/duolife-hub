import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export interface ConvertHtmlToPdfOptions {
  /**
   * HTML completo ou fragmento que será renderizado pelo Chromium do Gotenberg.
   */
  html: string;
  /**
   * Tempo de espera em milissegundos antes de disparar a impressão (útil para Tailwind CDN, fonts ou scripts).
   */
  waitDelayMs?: number;
  /**
   * Tipo de mídia CSS a ser emulada pelo Chromium ('screen' ou 'print'). Padrão: 'print'.
   */
  emulateMediaType?: 'screen' | 'print';
  /**
   * Tempo limite da requisição HTTP em milissegundos (default: 30000ms).
   */
  timeoutMs?: number;
  /**
   * Arquivos adicionais enviados no multipart (ex: cabeçalhos, rodapés, css, imagens).
   */
  extraFiles?: Array<{
    name: string;
    content: string | Buffer | Uint8Array;
    mimeType?: string;
  }>;
  /**
   * Largura da folha em polegadas. Padrão: 8.27 (A4).
   */
  paperWidth?: number;
  /**
   * Altura da folha em polegadas. Padrão: 11.69 (A4).
   */
  paperHeight?: number;
  /**
   * Margens em polegadas. Padrão: 0 para controle via CSS milimétrico.
   */
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  /**
   * Se verdadeiro, imprime imagens e cores de fundo (background-color, background-image). Padrão: true.
   */
  printBackground?: boolean;
  /**
   * Se verdadeiro, respeita as dimensões @page definidas no CSS. Padrão: true.
   */
  preferCssPageSize?: boolean;
}

export interface GotenbergPdfResult {
  base64: string;
  size: number;
  buffer: Buffer;
}

export class GotenbergError extends Error {
  isGotenbergError = true;
  statusCode?: number;
  gotenbergUrl: string;
  dockerCommand = 'docker run --rm -p 3001:3000 gotenberg/gotenberg:8';

  constructor(message: string, url: string, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = 'GotenbergError';
    this.gotenbergUrl = url;
    this.statusCode = statusCode;
    if (cause) this.cause = cause;
  }
}

export class GotenbergUnavailableError extends GotenbergError {
  constructor(url: string, cause?: unknown) {
    const message =
      `Gotenberg não está acessível no endpoint "${url}". ` +
      `Para iniciar o container localmente via Docker, execute:\n` +
      `docker run --rm -p 3001:3000 gotenberg/gotenberg:8`;
    super(message, url, 503, cause);
    this.name = 'GotenbergUnavailableError';
  }
}

/**
 * Retorna a URL base do Gotenberg configurada no ambiente.
 * - Em produção, utiliza 'http://gotenberg:3000' (rede Docker interna do Coolify) caso não haja env explícita.
 * - Em desenvolvimento, utiliza 'http://localhost:3001'.
 */
export function getGotenbergUrl(): string {
  const envUrl = process.env.GOTENBERG_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  return process.env.NODE_ENV === 'production'
    ? 'http://gotenberg:3000'
    : 'http://localhost:3001';
}

/**
 * Health check simples no endpoint /health do Gotenberg.
 * Retorna true se o serviço responder HTTP 200, ou false se estiver inacessível.
 */
export async function isGotenbergAvailable(timeoutMs = 4000): Promise<boolean> {
  const baseUrl = getGotenbergUrl();
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Converte HTML em PDF vetorial de alta resolução utilizando o Gotenberg Chromium Engine.
 */
export async function convertHtmlToPdf(
  options: ConvertHtmlToPdfOptions
): Promise<GotenbergPdfResult> {
  const baseUrl = getGotenbergUrl();
  const endpoint = `${baseUrl}/forms/chromium/convert/html`;
  const timeoutMs = options.timeoutMs ?? 30000;

  // Montagem do FormData multipart/form-data
  const formData = new FormData();

  // 1. Arquivo principal HTML (exigido pelo Gotenberg como 'index.html')
  const htmlBlob = new Blob([options.html], { type: 'text/html; charset=utf-8' });
  formData.append('files', htmlBlob, 'index.html');

  // 2. Arquivos adicionais opcionais (cabeçalhos, fontes, imagens locais, css)
  if (options.extraFiles && options.extraFiles.length > 0) {
    for (const extra of options.extraFiles) {
      const blob = new Blob([extra.content as any], {
        type: extra.mimeType || 'application/octet-stream',
      });
      formData.append('files', blob, extra.name);
    }
  }

  // 3. Parâmetros de página e calibração de impressão A4
  const paperWidth = options.paperWidth ?? 8.27; // Polegadas A4 (210mm)
  const paperHeight = options.paperHeight ?? 11.69; // Polegadas A4 (297mm)
  const marginTop = options.marginTop ?? 0;
  const marginBottom = options.marginBottom ?? 0;
  const marginLeft = options.marginLeft ?? 0;
  const marginRight = options.marginRight ?? 0;
  const printBackground = options.printBackground ?? true;
  const preferCssPageSize = options.preferCssPageSize ?? true;

  formData.append('paperWidth', String(paperWidth));
  formData.append('paperHeight', String(paperHeight));
  formData.append('marginTop', String(marginTop));
  formData.append('marginBottom', String(marginBottom));
  formData.append('marginLeft', String(marginLeft));
  formData.append('marginRight', String(marginRight));
  formData.append('printBackground', String(printBackground));
  formData.append('preferCssPageSize', String(preferCssPageSize));

  if (options.waitDelayMs && options.waitDelayMs > 0) {
    formData.append('waitDelay', `${options.waitDelayMs}ms`);
  }

  if (options.emulateMediaType) {
    formData.append('emulatedMediaType', options.emulateMediaType);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (networkError: any) {
    logger.error(
      {
        url: baseUrl,
        error: networkError?.message || String(networkError),
        code: networkError?.code,
      },
      `gotenberg.client.connection_failed: Gotenberg inacessível em ${baseUrl}. ` +
      `Execute: docker run --rm -p 3001:3000 gotenberg/gotenberg:8`
    );
    throw new GotenbergUnavailableError(baseUrl, networkError);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    logger.error(
      {
        url: baseUrl,
        status: response.status,
        statusText: response.statusText,
        errorBody,
      },
      'gotenberg.client.conversion_rejected'
    );
    throw new GotenbergError(
      `Gotenberg rejeitou a conversão do HTML (HTTP ${response.status}): ${errorBody || response.statusText}`,
      baseUrl,
      response.status
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result: GotenbergPdfResult = {
    buffer,
    base64: buffer.toString('base64'),
    size: buffer.length,
  };

  return result;
}

/**
 * Utilitário: Substitui variáveis do formato {{tag}} e {{ tag }} no HTML por valores reais.
 * Suporta notação com pontos (ex: {{proponente.nome}}) e chaves simples (ex: {{nome}}).
 */
export function substituirTagsHtml(
  html: string,
  dados: Record<string, any> = {}
): string {
  if (!html || !dados || typeof dados !== 'object') {
    return html || '';
  }

  // Cria um mapa achatado para busca rápida
  const lookup: Record<string, string> = {};

  function flatten(obj: Record<string, any>, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        flatten(value, fullKey);
      } else {
        const strVal = String(value);
        lookup[fullKey] = strVal;
        lookup[fullKey.toLowerCase()] = strVal;
        // Permite acesso direto à chave final mesmo quando aninhada
        if (!lookup[key]) {
          lookup[key] = strVal;
          lookup[key.toLowerCase()] = strVal;
        }
      }
    }
  }

  flatten(dados);

  // Substitui {{chave}} ou {{ chave }}
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, tag) => {
    const direct = lookup[tag] ?? lookup[tag.toLowerCase()];
    if (direct !== undefined) {
      return direct;
    }
    // Mantém tag intacta caso não informada
    return match;
  });
}

/**
 * Utilitário: Localiza referências de imagens locais no formato /images/... no HTML
 * e as substitui por Data URIs em Base64 (data:image/...;base64,...).
 * Isso garante que o Gotenberg renderize o documento com 100% de autonomia e velocidade,
 * sem depender de servidor web exposto.
 */
export async function inlineLocalAssets(html: string): Promise<string> {
  const imageRegex = /src=["'](\/images\/[^"']+)["']/g;
  const matches = Array.from(html.matchAll(imageRegex));

  if (matches.length === 0) {
    return html;
  }

  let processedHtml = html;
  const cwd = process.cwd();

  for (const match of matches) {
    const rawPath = match[1];
    const localFsPath = path.join(cwd, 'public', rawPath.replace(/^\//, ''));

    try {
      const fileBuffer = await fs.readFile(localFsPath);
      const ext = path.extname(rawPath).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.svg') mimeType = 'image/svg+xml';
      else if (ext === '.webp') mimeType = 'image/webp';

      const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      processedHtml = processedHtml.replaceAll(match[0], `src="${base64Data}"`);
    } catch {
      // Se não encontrar o arquivo no disco, mantém o link original
    }
  }

  return processedHtml;
}

/**
 * Constrói um documento HTML5 completo e pronto para impressão no Gotenberg Chromium,
 * injetando viewport, charset UTF-8, Tailwind CSS CDN e estilos CSS de calibração milimétrica A4.
 */
export function buildHtmlDocument(
  bodyContent: string,
  options?: {
    title?: string;
    customHeadHtml?: string;
    includeTailwindCdn?: boolean;
  }
): string {
  const title = options?.title || 'Contrato DuoLife';
  const includeTailwind = options?.includeTailwindCdn ?? true;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${includeTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      min-height: 297mm;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
  </style>
  ${options?.customHeadHtml || ''}
</head>
<body class="bg-white text-slate-900 antialiased">
  ${bodyContent}
</body>
</html>`;
}
