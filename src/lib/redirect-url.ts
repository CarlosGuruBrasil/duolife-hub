function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function firstHeaderValue(value: string | null | undefined): string {
  return value?.split(',')[0]?.trim() || '';
}

function hostnameFromHost(host: string): string {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return '';
  }
}

export function buildRedirectUrl(reqUrl: string, pathname: string, headers?: Headers | null): URL {
  const requestUrl = new URL(reqUrl);
  const host = firstHeaderValue(headers?.get('x-forwarded-host'))
    || firstHeaderValue(headers?.get('host'))
    || requestUrl.host;
  const hostname = hostnameFromHost(host) || requestUrl.hostname;
  const forwardedProto = firstHeaderValue(headers?.get('x-forwarded-proto'));
  const protocol = isLocalHost(hostname)
    ? 'http:'
    : forwardedProto
      ? `${forwardedProto}:`
      : requestUrl.protocol;

  const url = new URL(pathname, `${protocol}//${host}`);
  if (isLocalHost(url.hostname)) url.protocol = 'http:';
  return url;
}
