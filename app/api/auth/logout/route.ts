import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/pg';

export async function POST() {
  const cookieStore = await cookies();
  const raw = cookieStore.get('duolife_refresh')?.value;

  if (raw) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    // Revoga no banco — silencia erro se tabela ainda não existir
    await sql`UPDATE refresh_tokens SET revoked = true WHERE token_hash = ${hash}`.catch(() => null);
  }

  cookieStore.delete('duolife_token');
  cookieStore.delete('duolife_refresh');
  return Response.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'));
}
