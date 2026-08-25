import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getEncodedJwtSecret } from '@/lib/secrets';
import { redirectToPath } from '@/lib/redirect';

const JWT_SECRET = getEncodedJwtSecret();

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('duolife_token')?.value;

  if (pathname.startsWith('/portal')) {
    if (!token) return redirectToPath(req, '/login');
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.partnerId) return redirectToPath(req, '/login');
    } catch {
      return redirectToPath(req, '/login');
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!token) return redirectToPath(req, '/login');
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const role = payload.role as string;
      if (!role?.startsWith('duolife_')) {
        return redirectToPath(req, '/');
      }
    } catch {
      return redirectToPath(req, '/login');
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portal/:path*', '/admin/:path*'],
};
