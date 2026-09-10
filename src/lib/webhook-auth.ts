import crypto from 'crypto';

// Fail-closed: sem secret configurado ou token ausente, a requisição é sempre rejeitada.
// Usa hash SHA-256 de tamanho fixo (32 bytes) para garantir comparação em tempo constante
// sem vazar o comprimento do secret configurado (mitigando timing attacks).
export function verifyWebhookToken(received: string | null, secretEnvValue: string | undefined): boolean {
  if (!secretEnvValue || !received) return false;

  const receivedHash = crypto.createHash('sha256').update(received).digest();
  const secretHash = crypto.createHash('sha256').update(secretEnvValue).digest();

  return crypto.timingSafeEqual(receivedHash, secretHash);
}
