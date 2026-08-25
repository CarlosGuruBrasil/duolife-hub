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
