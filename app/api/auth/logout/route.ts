import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('duolife_refresh')?.value;

    if (raw) {
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      await sql`UPDATE refresh_tokens SET revoked = true WHERE token_hash = ${hash}`
        .catch((err: Error) => logger.error({ err }, 'auth.logout.revoke.failed'));
    }

    const response = NextResponse.redirect(new URL('/login', req.url), 303);
    response.cookies.set('duolife_token', '', { maxAge: 0, path: '/' });
    response.cookies.set('duolife_refresh', '', { maxAge: 0, path: '/api/auth' });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    return response;
  } catch (err) {
    logger.error({ err }, 'auth.logout.failed');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

