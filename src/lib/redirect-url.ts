function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function buildRedirectUrl(reqUrl: string, pathname: string): URL {
  const url = new URL(pathname, reqUrl);
  if (isLocalHost(url.hostname)) url.protocol = 'http:';
  return url;
}
