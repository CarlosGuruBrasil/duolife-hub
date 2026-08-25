import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRedirectUrl } from '../src/lib/redirect-url.ts';

test('redirect local nunca força HTTPS no localhost', () => {
  const url = buildRedirectUrl('https://localhost:3000/api/auth/logout', '/login');
  assert.equal(url.toString(), 'http://localhost:3000/login');
});

test('redirect de produção preserva HTTPS', () => {
  const url = buildRedirectUrl('https://duolife.com.br/admin', '/login');
  assert.equal(url.toString(), 'https://duolife.com.br/login');
});

test('redirect atrás do proxy usa domínio público encaminhado', () => {
  const headers = new Headers({
    'x-forwarded-host': 'duolife.com.br',
    'x-forwarded-proto': 'https',
  });
  const url = buildRedirectUrl('http://nne294wcr9butmdbvc6ph33a.167.233.141.117.sslip.io/api/auth/logout', '/login', headers);
  assert.equal(url.toString(), 'https://duolife.com.br/login');
});
