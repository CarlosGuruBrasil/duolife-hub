import { NextResponse } from 'next/server';
import { buildRedirectUrl } from './redirect-url';

export function redirectToPath(req: Request, pathname: string, status = 307): NextResponse {
  const url = buildRedirectUrl(req.url, pathname, req.headers);
  return NextResponse.redirect(url, status);
}
