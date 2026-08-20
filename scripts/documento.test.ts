// Documento inválido entrando no cadastro é lixo que só aparece na hora da emissão.
// Rodar: node --test scripts/documento.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarCnpj, validarCpf, somenteDigitos } from '../src/lib/documento.ts';

test('validarCnpj aceita válido e rejeita o resto', () => {
  assert.ok(validarCnpj('00.698.913/0001-23'));   // CNPJ da própria DuoLife
  assert.ok(validarCnpj('00698913000123'));
  assert.ok(!validarCnpj('00.698.913/0001-24'));  // dígito verificador errado
  assert.ok(!validarCnpj('11.111.111/1111-11'));  // todos iguais
  assert.ok(!validarCnpj('123'));
  assert.ok(!validarCnpj(''));
});

test('validarCpf aceita válido e rejeita o resto', () => {
  assert.ok(validarCpf('529.982.247-25'));
  assert.ok(validarCpf('52998224725'));
  assert.ok(!validarCpf('529.982.247-26'));
  assert.ok(!validarCpf('111.111.111-11'));
  assert.ok(!validarCpf('00000000000'));
  assert.ok(!validarCpf('529982247'));
});

test('CPF não passa como CNPJ e vice-versa', () => {
  assert.ok(!validarCnpj('52998224725'));
  assert.ok(!validarCpf('00698913000123'));
});

test('somenteDigitos limpa a máscara', () => {
  assert.equal(somenteDigitos('00.698.913/0001-23'), '00698913000123');
  assert.equal(somenteDigitos('529.982.247-25'), '52998224725');
});
