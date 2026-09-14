import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { roleIsCorretora, roleIsInternal, CORRETORA_ROLES } from '../src/lib/roles';
import {
  AuthUser,
  canManageTeam,
  canManageOwnCompany,
  getPartnerAccessContext,
  normalizePermissions,
} from '../src/lib/auth';

console.log('🧪 Iniciando testes de Autenticação e RBAC da Corretora...\n');

// 1. Teste de roles
console.log('1. Testando predicados de papel (roles)...');
assert.equal(roleIsCorretora('corretora_admin'), true);
assert.equal(roleIsCorretora('corretora_manager'), true);
assert.equal(roleIsCorretora('corretora_staff'), true);
assert.equal(roleIsCorretora('partner_broker'), false);
assert.equal(roleIsCorretora('partner_director'), false);
assert.equal(roleIsCorretora('duolife_admin'), false);
assert.equal(roleIsInternal('corretora_admin'), false);
assert.deepEqual(CORRETORA_ROLES, ['corretora_admin', 'corretora_manager', 'corretora_staff']);
console.log('   ✅ Predicados de papel corretos.');

// 2. Teste de canManageTeam e canManageOwnCompany
console.log('2. Testando permissões de gestão de equipe (canManageTeam)...');
const corretoraAdmin: AuthUser = {
  userId: 'user-corretora-001',
  partnerId: null,
  corretoraId: 'corretora_net4life_001',
  corretoraNome: 'NET4Life Corretora',
  name: 'Diretoria NET4Life',
  email: 'contato@net4life.com.br',
  role: 'corretora_admin',
  partnerRole: null,
  managerUserId: null,
  permissions: {},
};

const corretoraManager: AuthUser = {
  userId: 'user-corretora-002',
  partnerId: null,
  corretoraId: 'corretora_net4life_001',
  corretoraNome: 'NET4Life Corretora',
  name: 'Gestor NET4Life',
  email: 'gestor@net4life.com.br',
  role: 'corretora_manager',
  partnerRole: null,
  managerUserId: null,
  permissions: {},
};

const brokerUser: AuthUser = {
  userId: 'user-broker-001',
  partnerId: 'partner-001',
  corretoraId: 'corretora_net4life_001',
  corretoraNome: 'NET4Life Corretora',
  name: 'Corretor João',
  email: 'joao@corretor.com',
  role: 'partner_broker',
  partnerRole: 'broker',
  managerUserId: null,
  permissions: {},
};

const partnerDirector: AuthUser = {
  userId: 'user-director-001',
  partnerId: 'partner-002',
  corretoraId: 'corretora_net4life_001',
  corretoraNome: 'NET4Life Corretora',
  name: 'Diretor Parceiro',
  email: 'diretor@parceiro.com',
  role: 'partner_director',
  partnerRole: 'director',
  managerUserId: null,
  permissions: {},
};

assert.equal(canManageTeam(corretoraAdmin), true, 'corretora_admin deve gerenciar equipe');
assert.equal(canManageTeam(corretoraManager), true, 'corretora_manager deve gerenciar equipe');
assert.equal(canManageTeam(partnerDirector), true, 'partner_director deve gerenciar equipe');
assert.equal(canManageTeam(brokerUser), false, 'broker comum não deve gerenciar equipe');

assert.equal(canManageOwnCompany(corretoraAdmin), true);
assert.equal(canManageOwnCompany(brokerUser), false);
console.log('   ✅ Permissões de gestão validadas.');

// 3. Teste do contexto de acesso (getPartnerAccessContext)
console.log('3. Testando contexto de acesso multi-tenant...');
(async () => {
  const corretoraAccess = await getPartnerAccessContext(corretoraAdmin);
  assert.ok(corretoraAccess);
  assert.equal(corretoraAccess.isCorretoraUser, true);
  assert.equal(corretoraAccess.corretoraId, 'corretora_net4life_001');
  assert.equal(corretoraAccess.partnerId, null);
  assert.equal(corretoraAccess.visibleUserIds, null);
  console.log('   ✅ Contexto de acesso da corretora configurado com escopo amplo.');

  // 4. Teste de assinatura e decodificação do JWT
  console.log('4. Testando JWT para usuário da Corretora...');
  const secret = 'duolife-test-secret-min-32-chars-long!';
  const token = jwt.sign(corretoraAdmin, secret, { algorithm: 'HS256', expiresIn: '8h' });
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthUser;

  assert.equal(decoded.userId, 'user-corretora-001');
  assert.equal(decoded.corretoraId, 'corretora_net4life_001');
  assert.equal(decoded.role, 'corretora_admin');
  assert.equal(decoded.name, 'Diretoria NET4Life');
  assert.equal(decoded.email, 'contato@net4life.com.br');
  console.log('   ✅ JWT assinado e verificado com corretoraId e role.');

  // 5. Teste de hash de senha padrão da NET4Life
  console.log('5. Testando compatibilidade de senha bcrypt...');
  const senhaPadrao = 'net4life@2026';
  const hash = await bcrypt.hash(senhaPadrao, 10);
  const match = await bcrypt.compare(senhaPadrao, hash);
  assert.equal(match, true);
  console.log('   ✅ Hash de senha validado.');

  console.log('\n🎉 TODOS OS TESTES DE AUTENTICAÇÃO DA CORRETORA PASSARAM COM SUCESSO!\n');
})();
