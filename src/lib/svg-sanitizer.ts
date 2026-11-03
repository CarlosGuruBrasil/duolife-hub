/**
 * Utilitário de sanitização e verificação de segurança de arquivos SVG
 * Previne Stored XSS bloqueando tags executáveis, handlers e protocolos perigosos.
 */

const DANGEROUS_PATTERNS = [
  /<script\b/i,
  /<\/script>/i,
  /javascript:/i,
  /data:\s*text\/html/i,
  /<foreignobject\b/i,
  /<iframe\b/i,
  /<embed\b/i,
  /<object\b/i,
  /\bon[a-z]+\s*=/i, // onload, onerror, onclick, onmouseover, etc.
  /<use\b[^>]*href\s*=\s*['"]?(?!#)/i, // xlink:href externo
];

export function isSvgSafe(svgText: string): boolean {
  if (!svgText || typeof svgText !== 'string') return false;
  const normalized = svgText.toLowerCase();
  return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized));
}
