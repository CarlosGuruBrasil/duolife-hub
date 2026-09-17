/**
 * Utilitário de sanitização de HTML seguro para renderização de templates e previews.
 * Remove vetores de ataque Cross-Site Scripting (XSS), incluindo scripts executáveis,
 * tags perigosas, manipuladores de evento inline e URLs javascript:.
 */

const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'form',
  'noscript',
];

export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return '';
  }

  let clean = rawHtml;

  // 1. Remove tags perigosas e seus conteúdos internos
  for (const tag of DANGEROUS_TAGS) {
    const tagRegex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    clean = clean.replace(tagRegex, '');

    // Remove tags auto-fechadas ou não fechadas
    const selfClosingRegex = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
    clean = clean.replace(selfClosingRegex, '');
  }

  // 2. Remove manipuladores de eventos inline (ex: onload=, onerror=, onclick=, onmouseover=)
  clean = clean.replace(/(\s+)(on[a-z]+)\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '');

  // 3. Remove esquemas javascript: e data: perigosos em atributos href/src
  clean = clean.replace(/(href|src)\s*=\s*(['"]?)\s*(?:javascript|vbscript|data:text\/html):/gi, '$1=$2#blocked:');

  return clean;
}
