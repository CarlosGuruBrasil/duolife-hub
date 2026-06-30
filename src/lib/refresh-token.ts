import crypto from 'crypto';
import { sql } from './pg';

const EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30);

export function generateToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export async function createRefreshToken(partnerUserId: string): Promise<string> {
  const raw = generateToken();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 86_400_000);

  await sql`
    INSERT INTO refresh_tokens (partner_user_id, token_hash, expires_at)
    VALUES (${partnerUserId}, ${hash}, ${expiresAt})
  `;

  return raw; // só o raw vai para o cookie, nunca o hash
}

export async function rotateRefreshToken(raw: string): Promise<{ userId: string; newRaw: string } | null> {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const [row] = await sql`
    SELECT id, partner_user_id
    FROM refresh_tokens
    WHERE token_hash = ${hash}
      AND revoked = false
      AND expires_at > NOW()
  `;

  if (!row) return null;

  // Revoga o token usado e emite um novo (rotation)
  await sql`UPDATE refresh_tokens SET revoked = true WHERE id = ${row.id}`;
  const newRaw = await createRefreshToken(row.partner_user_id);

  return { userId: row.partner_user_id, newRaw };
}
