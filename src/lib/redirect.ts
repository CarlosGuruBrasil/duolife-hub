import { NextResponse } from 'next/server';
import { buildRedirectUrl } from './redirect-url';

export function redirectToPath(reqUrl: string, pathname: string, status = 307): NextResponse {
  const url = buildRedirectUrl(reqUrl, pathname);
  return NextResponse.redirect(url, status);
}
