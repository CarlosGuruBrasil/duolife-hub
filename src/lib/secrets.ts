const DEV_JWT_SECRET = 'duolife-dev-secret-change-in-production';

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não configurada');
  }
  return DEV_JWT_SECRET;
}

export function getEncodedJwtSecret(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}
