// Checagem mínima das regras que sustentam o painel de cotações (dinheiro + href externo).
// Rodar: node --test scripts/cotacoes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_TERMINAIS } from '../src/lib/cotacao-status.ts';
import { safeExternalUrl } from '../src/lib/safe-url.ts';
import { formatCurrency, formatDate, formatDateTime } from '../src/lib/format.ts';

test('cotação com apólice emitida é estado terminal', () => {
  for (const estado of ['aprovada', 'recusada', 'expirada', 'emitida']) {
    assert.ok(ESTADOS_TERMINAIS.includes(estado), `${estado} deveria ser terminal`);
  }
  // Seguradora ainda pode recusar o risco depois de assinado/faturado.
  for (const estado of ['rascunho', 'enviada', 'contrato_gerado', 'assinado', 'pagamento_gerado']) {
    assert.ok(!ESTADOS_TERMINAIS.includes(estado), `${estado} não deveria ser terminal`);
  }
});

test('safeExternalUrl só deixa passar http(s)', () => {
  assert.equal(safeExternalUrl('https://asaas.com/b/123'), 'https://asaas.com/b/123');
  assert.equal(safeExternalUrl('http://zapsign.com.br/d/abc'), 'http://zapsign.com.br/d/abc');
  assert.equal(safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('  javascript:alert(1)  '), '');
  assert.equal(safeExternalUrl('data:text/html,<script>'), '');
  assert.equal(safeExternalUrl('/admin/cotacoes'), '');
  assert.equal(safeExternalUrl(null), '');
  assert.equal(safeExternalUrl(''), '');
  assert.equal(safeExternalUrl(42), '');
});

test('formatCurrency trata zero como valor válido', () => {
  assert.match(formatCurrency(0), /R\$\s?0,00/);
  assert.match(formatCurrency('0'), /R\$\s?0,00/);
  assert.match(formatCurrency('1234.5'), /R\$\s?1\.234,50/);
  assert.equal(formatCurrency(null), '-');
  assert.equal(formatCurrency(undefined), '-');
  assert.equal(formatCurrency(''), '-');
  assert.equal(formatCurrency('abc'), '-');
});

test('datas inválidas não viram "Invalid Date"', () => {
  assert.equal(formatDate(null), '-');
  assert.equal(formatDate('não é data'), '-');
  assert.equal(formatDateTime(undefined), '-');
  assert.equal(formatDate('2026-03-10T12:00:00Z'), '10/03/2026');
});
