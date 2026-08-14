import crypto from 'crypto';

// Fail-closed: sem secret configurado, a requisição é sempre rejeitada.
// Comparação em tempo constante para evitar timing attack no valor do token.
export function verifyWebhookToken(received: string | null, secretEnvValue: string | undefined): boolean {
  if (!secretEnvValue) return false;
  if (!received) return false;

  const receivedBuf = Buffer.from(received);
  const secretBuf = Buffer.from(secretEnvValue);
  if (receivedBuf.length !== secretBuf.length) return false;

  return crypto.timingSafeEqual(receivedBuf, secretBuf);
}
