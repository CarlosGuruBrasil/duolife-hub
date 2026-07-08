import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/pg';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get('duolife_refresh')?.value;

  if (raw) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    // Revoga no banco — silencia erro se tabela ainda não existir
    await sql`UPDATE refresh_tokens SET revoked = true WHERE token_hash = ${hash}`.catch(() => null);
  }

  cookieStore.delete('duolife_token');
  cookieStore.delete('duolife_refresh');

  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const redirectUrl = `${proto}://${host}/login`;

  return Response.redirect(redirectUrl);
}

