import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getEncodedJwtSecret } from '@/lib/secrets';
import { redirectToPath } from '@/lib/redirect';

const JWT_SECRET = getEncodedJwtSecret();

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const token = req.cookies.get('duolife_token')?.value;

  // 1. Proteção do Portal de Parceiros (/portal e /api/portal)
  if (pathname.startsWith('/portal') || pathname.startsWith('/api/portal')) {
    // Requisições com token público de contratação (ex.: /contratar/[token])
    const publicToken = req.headers.get('x-public-token');
    if (publicToken && isApi) {
      return NextResponse.next();
    }

    if (!token) {
      return isApi
        ? NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        : redirectToPath(req, '/login');
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const role = String(payload.role || '');
      const isPartner = !!payload.partnerId || role.startsWith('partner_');
      const isAdmin = role.startsWith('duolife_');

      if (!isPartner && !isAdmin) {
        return isApi
          ? NextResponse.json({ error: 'Acesso negado: perfil inválido' }, { status: 403 })
          : redirectToPath(req, '/login');
      }
    } catch {
      return isApi
        ? NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })
        : redirectToPath(req, '/login');
    }
  }

  // 2. Proteção do Painel Administrativo (/admin e /api/admin)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!token) {
      return isApi
        ? NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        : redirectToPath(req, '/login');
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const role = String(payload.role || '');
      if (!role.startsWith('duolife_')) {
        return isApi
          ? NextResponse.json({ error: 'Acesso negado: requer privilégios administrativos' }, { status: 403 })
          : redirectToPath(req, '/');
      }
    } catch {
      return isApi
        ? NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })
        : redirectToPath(req, '/login');
    }
  }

  return NextResponse.next();
}

export { proxy as middleware };
export default proxy;

export const config = {
  matcher: [
    '/portal/:path*',
    '/admin/:path*',
    '/api/portal/:path*',
    '/api/admin/:path*',
  ],
};
