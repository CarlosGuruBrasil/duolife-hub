import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getEncodedJwtSecret } from '@/lib/secrets';

const JWT_SECRET = getEncodedJwtSecret();

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('duolife_token')?.value;

  if (pathname.startsWith('/portal')) {
    if (!token) return NextResponse.redirect(new URL('/login', req.url));
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.partnerId) return NextResponse.redirect(new URL('/login', req.url));
    } catch {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!token) return NextResponse.redirect(new URL('/login', req.url));
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const role = payload.role as string;
      if (!role?.startsWith('duolife_')) {
        return NextResponse.redirect(new URL('/', req.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portal/:path*', '/admin/:path*'],
};
