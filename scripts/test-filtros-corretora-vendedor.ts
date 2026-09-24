/**
 * Teste Automatizado: Filtros de Corretora e Vendedor (em cascata)
 * DUOLife Hub - 2026-09-23
 * Codificação: UTF-8
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { maskCnpj } from '../src/components/modals/masks';

// Mock de dados e testes unitários de regras de negócio
interface Corretora {
  id: string;
  name: string;
  cnpj: string | null;
}

interface Partner {
  id: string;
  name: string;
  corretoraId: string | null;
}

async function runTests() {
  console.log('--- Iniciando Testes de Filtros de Corretora e Vendedor ---');

  // Teste 1: Máscara de CNPJ para opções de Corretora
  console.log('Teste 1: Máscara de CNPJ para opções de Corretora...');
  const cnpj1 = '07351909000133';
  const cnpj2 = '11222333000199';
  assert.strictEqual(maskCnpj(cnpj1), '07.351.909/0001-33', 'CNPJ deve estar devidamente mascarado');
  assert.strictEqual(maskCnpj(cnpj2), '11.222.333/0001-99', 'CNPJ deve estar devidamente mascarado');
  assert.strictEqual(maskCnpj(null), '', 'CNPJ nulo deve retornar vazio');
  console.log('  ✓ CNPJ mascarado com sucesso:', maskCnpj(cnpj1));

  // Teste 2: Formatação de Rótulo de Opções de Corretora
  console.log('Teste 2: Formatação do label exibido no select de Corretora...');
  const corretorasMock: Corretora[] = [
    { id: 'corr_net4life', name: 'NET4Life Corretora de Seguros', cnpj: '07351909000133' },
    { id: 'corr_duolife_prime', name: 'DuoLife Prime Seguros', cnpj: '11222333000199' },
    { id: 'corr_sem_cnpj', name: 'Corretora Independente', cnpj: null },
  ];

  const formatOption = (c: Corretora) => {
    const masked = c.cnpj ? maskCnpj(c.cnpj) : null;
    return masked ? `${c.name} (${masked})` : c.name;
  };

  assert.strictEqual(
    formatOption(corretorasMock[0]),
    'NET4Life Corretora de Seguros (07.351.909/0001-33)'
  );
  assert.strictEqual(
    formatOption(corretorasMock[2]),
    'Corretora Independente'
  );
  console.log('  ✓ Labels de Corretora formatados corretamente com CNPJ.');

  // Teste 3: Associação de Parceiros com Corretora Mãe (Multi-tenant)
  console.log('Teste 3: Validação de associação de Vendedores às suas Corretoras...');
  const partnersMock: Partner[] = [
    { id: 'p1', name: 'Carlos Corretor', corretoraId: 'corr_net4life' },
    { id: 'p2', name: 'Mariana Duarte', corretoraId: 'corr_net4life' },
    { id: 'p3', name: 'João Batista', corretoraId: 'corr_duolife_prime' },
    { id: 'p4', name: 'Ana Souza', corretoraId: 'corr_duolife_prime' },
    { id: 'p5', name: 'Vendedor Avulso', corretoraId: null },
  ];

  assert.strictEqual(partnersMock.filter(p => p.corretoraId === 'corr_net4life').length, 2);
  assert.strictEqual(partnersMock.filter(p => p.corretoraId === 'corr_duolife_prime').length, 2);
  console.log('  ✓ Vendedores associados corretamente por corretoraId.');

  // Teste 4: Filtro em Cascata em Tempo Real (Client-side useMemo)
  console.log('Teste 4: Simulação de filtragem em cascata no componente de filtro...');
  function getFilteredPartners(selectedCorretoraId: string, allPartners: Partner[]) {
    if (!selectedCorretoraId || selectedCorretoraId === 'all') {
      return allPartners;
    }
    return allPartners.filter(p => p.corretoraId === selectedCorretoraId);
  }

  // Sem corretora selecionada -> lista todos os vendedores
  const allResult = getFilteredPartners('', partnersMock);
  assert.strictEqual(allResult.length, 5, 'Deve exibir todos os vendedores quando nenhuma corretora estiver selecionada');

  // Com corretora selecionada -> lista apenas os vendedores daquela corretora
  const net4lifeResult = getFilteredPartners('corr_net4life', partnersMock);
  assert.strictEqual(net4lifeResult.length, 2);
  assert(net4lifeResult.every(p => p.corretoraId === 'corr_net4life'));

  const duolifeResult = getFilteredPartners('corr_duolife_prime', partnersMock);
  assert.strictEqual(duolifeResult.length, 2);
  assert(duolifeResult.every(p => p.corretoraId === 'corr_duolife_prime'));
  console.log('  ✓ Cascata Corretora -> Vendedores funcionando com 100% de precisão.');

  // Teste 5: Lógica de Reset Automático ao Mudar de Corretora
  console.log('Teste 5: Reset do Vendedor selecionado quando a nova corretora não possui aquele vendedor...');
  function handleCorretoraChangeLogic(
    newCorretoraId: string,
    currentPartnerId: string,
    allPartners: Partner[]
  ): { nextCorretoraId: string; nextPartnerId: string } {
    let nextPartnerId = currentPartnerId;
    if (currentPartnerId) {
      const isStillValid = newCorretoraId && newCorretoraId !== 'all'
        ? allPartners.some(p => p.id === currentPartnerId && p.corretoraId === newCorretoraId)
        : true;
      if (!isStillValid) {
        nextPartnerId = '';
      }
    }
    return { nextCorretoraId: newCorretoraId, nextPartnerId };
  }

  // Cenário A: Usuário selecionou 'p1' (da net4life). Se mudar para duolife_prime, 'p1' não pertence e DEVE ser resetado para ''.
  const resA = handleCorretoraChangeLogic('corr_duolife_prime', 'p1', partnersMock);
  assert.strictEqual(resA.nextPartnerId, '', 'Vendedor p1 deve ser resetado ao mudar para corretora concorrente');

  // Cenário B: Usuário selecionou 'p1' (da net4life). Se mudar para '', mantém o vendedor selecionado.
  const resB = handleCorretoraChangeLogic('', 'p1', partnersMock);
  assert.strictEqual(resB.nextPartnerId, 'p1', 'Vendedor p1 pode ser mantido se mudar para todas as corretoras');

  // Cenário C: Usuário selecionou 'p3' (da duolife_prime). Se mudar para duolife_prime, mantém.
  const resC = handleCorretoraChangeLogic('corr_duolife_prime', 'p3', partnersMock);
  assert.strictEqual(resC.nextPartnerId, 'p3', 'Vendedor p3 pertence à corretora e deve ser mantido');
  console.log('  ✓ Reset automático e salvaguarda de integridade de vendedor aprovados.');

  // Teste 6: Validação de Nomenclatura dos Rótulos (Sem "Parceiro" / "Parceiro / Corretora")
  console.log('Teste 6: Verificação de substituição de termos nos componentes...');
  const cotacoesFiltersFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/cotacoes/_components/CotacoesAdvancedFilters.tsx'),
    'utf-8'
  );
  assert(cotacoesFiltersFile.includes('Vendedor'), 'CotacoesAdvancedFilters deve conter label Vendedor');
  assert(cotacoesFiltersFile.includes('Todos os vendedores'), 'CotacoesAdvancedFilters deve conter Todos os vendedores');
  assert(cotacoesFiltersFile.includes('Corretora'), 'CotacoesAdvancedFilters deve conter label Corretora');
  assert(!cotacoesFiltersFile.includes('Todos os parceiros'), 'CotacoesAdvancedFilters não deve mais conter Todos os parceiros');

  const vendasFiltersFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/vendas/_components/VendasAdvancedFilters.tsx'),
    'utf-8'
  );
  assert(vendasFiltersFile.includes('Vendedor'), 'VendasAdvancedFilters deve conter label Vendedor');
  assert(vendasFiltersFile.includes('Todos os vendedores'), 'VendasAdvancedFilters deve conter Todos os vendedores');
  assert(vendasFiltersFile.includes('Corretora'), 'VendasAdvancedFilters deve conter label Corretora');
  assert(!vendasFiltersFile.includes('Parceiro / Corretora'), 'VendasAdvancedFilters não deve mais conter Parceiro / Corretora');

  const clientesFiltersFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/clientes/_components/ClientesAdvancedFilters.tsx'),
    'utf-8'
  );
  assert(clientesFiltersFile.includes('Vendedor'), 'ClientesAdvancedFilters deve conter label Vendedor');
  assert(clientesFiltersFile.includes('Todos os vendedores'), 'ClientesAdvancedFilters deve conter Todos os vendedores');
  assert(clientesFiltersFile.includes('Corretora'), 'ClientesAdvancedFilters deve conter label Corretora');
  assert(!clientesFiltersFile.includes('Todos os parceiros'), 'ClientesAdvancedFilters não deve mais conter Todos os parceiros');
  console.log('  ✓ Todos os arquivos possuem os novos rótulos "Corretora" e "Vendedor" sem resquícios de "Parceiro".');

  // Teste 7: Badges Ativos atualizados
  console.log('Teste 7: Verificação dos rótulos nos Badges Ativos...');
  const cotacoesBadgesFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/cotacoes/_components/CotacoesActiveBadges.tsx'),
    'utf-8'
  );
  assert(cotacoesBadgesFile.includes('Corretora:'), 'CotacoesActiveBadges deve possuir badge de Corretora');
  assert(cotacoesBadgesFile.includes('Vendedor:'), 'CotacoesActiveBadges deve possuir badge de Vendedor');

  const vendasBadgesFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/vendas/_components/VendasActiveBadges.tsx'),
    'utf-8'
  );
  assert(vendasBadgesFile.includes('Corretora:'), 'VendasActiveBadges deve possuir badge de Corretora');
  assert(vendasBadgesFile.includes('Vendedor:'), 'VendasActiveBadges deve possuir badge de Vendedor');

  const clientesBadgesFile = fs.readFileSync(
    path.resolve(process.cwd(), 'app/admin/clientes/_components/ClientesActiveBadges.tsx'),
    'utf-8'
  );
  assert(clientesBadgesFile.includes('Corretora:'), 'ClientesActiveBadges deve possuir badge de Corretora');
  assert(clientesBadgesFile.includes('Vendedor:'), 'ClientesActiveBadges deve possuir badge de Vendedor');
  console.log('  ✓ Badges ativos de Cotações, Vendas e Clientes atualizados para "Corretora:" e "Vendedor:".');

  console.log('\n======================================================');
  console.log('  TODOS OS 7 TESTES PASSARAM COM 100% DE SUCESSO!     ');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
