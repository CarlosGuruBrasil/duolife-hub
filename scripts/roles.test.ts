// A matriz de acesso vira teste: estreitar um predicado de papel não quebra compilação
// nem tipo — some com telas inteiras em produção. Foi assim que a tela de Produtos
// ficou vazia para o Administrador. Rodar: node --test scripts/roles.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleIsInternal, roleIsPlatformAdmin, roleIsDev, INTERNAL_ROLES, INTERNAL_ROLE_LABEL } from '../src/lib/roles.ts';

const PAPEIS = ['duolife_dev', 'duolife_admin', 'duolife_staff', 'partner_director', 'partner_manager', 'partner_broker', 'partner_partner'];

// papel -> [interno, administra a plataforma, faz o irreversível]
const ESPERADO: Record<string, [boolean, boolean, boolean]> = {
  duolife_dev:      [true,  true,  true],
  duolife_admin:    [true,  true,  false],
  duolife_staff:    [true,  false, false],
  partner_director: [false, false, false],
  partner_manager:  [false, false, false],
  partner_broker:   [false, false, false],
  partner_partner:  [false, false, false],
};

test('cada papel tem exatamente o alcance documentado', () => {
  for (const papel of PAPEIS) {
    const [interno, admin, dev] = ESPERADO[papel];
    assert.equal(roleIsInternal(papel), interno, `${papel}: interno`);
    assert.equal(roleIsPlatformAdmin(papel), admin, `${papel}: administra a plataforma`);
    assert.equal(roleIsDev(papel), dev, `${papel}: irreversível`);
  }
});

test('Administrador administra a plataforma — produtos, planos, white-label, links', () => {
  // Regressão real: com isDevUser governando essas telas, o Administrador recebia 403
  // e a lista de produtos voltava vazia, parecendo que os produtos tinham sumido.
  assert.ok(roleIsPlatformAdmin('duolife_admin'));
  assert.ok(!roleIsDev('duolife_admin'));
});

test('Operação não administra a plataforma nem gerencia usuários internos', () => {
  assert.ok(roleIsInternal('duolife_staff'));
  assert.ok(!roleIsPlatformAdmin('duolife_staff'));
});

test('nenhum papel de parceiro alcança o lado interno', () => {
  for (const papel of PAPEIS.filter((p) => p.startsWith('partner_'))) {
    assert.ok(!roleIsInternal(papel), papel);
  }
});

test('a lista de papéis internos e seus rótulos ficam em sincronia', () => {
  assert.deepEqual(INTERNAL_ROLES, Object.keys(INTERNAL_ROLE_LABEL));
  for (const papel of INTERNAL_ROLES) assert.ok(INTERNAL_ROLE_LABEL[papel]);
});
