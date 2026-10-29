import crypto from 'crypto';

/**
 * Sanitiza tokens de API removendo espaços, quebras de linha, aspas e prefixos acidentais (ex: Bearer).
 */
export function sanitizeApiToken(raw?: string | null): string {
  if (!raw) return '';
  let token = String(raw).trim();
  token = token.replace(/^["']|["']$/g, '').trim();
  token = token.replace(/^Bearer\s+/i, '').trim();
  return token;
}

/**
 * Valida a autenticidade do webhook comparando o token recebido contra o segredo esperado.
 *
 * Princípios de Segurança e Resiliência:
 * 1. Fail-closed: sem secret configurado ou token ausente, a requisição é sempre rejeitada (retorna false).
 * 2. Sanitização bidirecional: remove espaços acidentais nas bordas, quebras de linha e aspas de ambos os lados.
 * 3. Prevenção de Timing Attacks: utiliza hash SHA-256 de tamanho fixo (32 bytes) combinado com
 *    crypto.timingSafeEqual, garantindo tempo constante e prevenindo erros de tamanho desigual de buffer.
 */
export function verifyWebhookToken(
  received: string | null | undefined,
  secretEnvValue: string | null | undefined
): boolean {
  const cleanReceived = sanitizeApiToken(received);
  const cleanSecret = sanitizeApiToken(secretEnvValue);

  if (!cleanSecret || !cleanReceived) return false;

  const receivedHash = crypto.createHash('sha256').update(cleanReceived).digest();
  const secretHash = crypto.createHash('sha256').update(cleanSecret).digest();

  return crypto.timingSafeEqual(receivedHash, secretHash);
}
