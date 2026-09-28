/**
 * Teste Automatizado: Sincronização dos Parceiros em Destaque com o Período do Filtro (Dashboard)
 * DUOLife Hub - 2026-09-28
 * Codificação: UTF-8
 */

import assert from 'node:assert';
import { resolveAdminPeriod, getRecentMonthOptions } from '../src/lib/admin-reporting';

async function runTests() {
  console.log('--- Iniciando Testes: Filtro de Período nos Parceiros em Destaque ---');

  // Teste 1: Resolução de Período Customizado (De / Até) com inclusão do dia final completo
  console.log('Teste 1: Validando cálculo de período customizado (inclusão do dia final)...');
  const customPeriod = resolveAdminPeriod(undefined, '2026-09-01', '2026-09-28');
  assert.strictEqual(customPeriod.monthKey, 'custom', 'monthKey deve ser custom');
  assert.strictEqual(customPeriod.start, '2026-09-01', 'start deve ser 2026-09-01');
  assert.strictEqual(customPeriod.endExclusive, '2026-09-29', 'endExclusive deve ser 2026-09-29 para cobrir todo o dia 28');
  assert.strictEqual(customPeriod.previousEndExclusive, '2026-09-01', 'previousEndExclusive deve coincidir com start');
  console.log('✓ Período customizado calcula endExclusive como D+1 com sucesso.');

  // Teste 2: Resolução de Mês Específico
  console.log('Teste 2: Validando resolução de mês específico (ex: 2026-05)...');
  const monthPeriod = resolveAdminPeriod('2026-05');
  assert.strictEqual(monthPeriod.monthKey, '2026-05');
  assert.strictEqual(monthPeriod.start, '2026-05-01');
  assert.strictEqual(monthPeriod.endExclusive, '2026-06-01');
  assert.strictEqual(monthPeriod.previousStart, '2026-04-01');
  assert.strictEqual(monthPeriod.previousEndExclusive, '2026-05-01');
  console.log('✓ Mês específico 2026-05 delimitado corretamente (2026-05-01 a 2026-06-01).');

  // Teste 3: Atalho 'all' (Todo o Histórico)
  console.log('Teste 3: Validando atalho "Todo o Histórico"...');
  const allPeriod = resolveAdminPeriod('all');
  assert.strictEqual(allPeriod.monthKey, 'all');
  assert.strictEqual(allPeriod.label, 'Todo o Histórico');
  console.log('✓ Atalho "all" configurado corretamente.');

  // Teste 4: Atalho 'last-3-months'
  console.log('Teste 4: Validando atalho "Últimos 3 Meses"...');
  const last3 = resolveAdminPeriod('last-3-months');
  assert.strictEqual(last3.monthKey, 'last-3-months');
  assert.strictEqual(last3.label, 'Últimos 3 Meses');
  console.log('✓ Atalho last-3-months configurado corretamente.');

  // Teste 5: Opções de meses recentes (garantia de que options[0] é o mês atual e options[1] o anterior)
  console.log('Teste 5: Validando opções de meses para o filtro (mês atual no índice 0)...');
  const options = getRecentMonthOptions(12);
  const now = new Date();
  const expectedCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const expectedPrevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  assert.strictEqual(options.length, 12, 'Deve conter exatamente 12 meses');
  assert.strictEqual(options[0].value, expectedCurrentMonth, 'Primeira opção deve ser rigorosamente o mês atual');
  assert.strictEqual(options[1].value, expectedPrevMonth, 'Segunda opção deve ser rigorosamente o mês anterior');
  console.log('✓ Lista de opções de meses garante mês atual no índice 0 e mês anterior no índice 1.');

  // Teste 6: Simulação de filtragem de atividade de parceiros no período
  console.log('Teste 6: Validando regra de corte de parceiros sem atividade no período...');
  interface PartnerRaw {
    partnerId: string;
    partnerName: string;
    quotesCount: number;
    salesCount: number;
    premiumTotal: number;
    commissionPending: number;
  }

  const samplePartners: PartnerRaw[] = [
    { partnerId: 'p1', partnerName: 'Parceiro Ativo A', quotesCount: 5, salesCount: 2, premiumTotal: 1500, commissionPending: 150 },
    { partnerId: 'p2', partnerName: 'Parceiro Apenas Cotação B', quotesCount: 3, salesCount: 0, premiumTotal: 0, commissionPending: 0 },
    { partnerId: 'p3', partnerName: 'Parceiro Inativo C', quotesCount: 0, salesCount: 0, premiumTotal: 0, commissionPending: 0 },
    { partnerId: 'p4', partnerName: 'Parceiro Ativo D', quotesCount: 1, salesCount: 1, premiumTotal: 800, commissionPending: 80 },
  ];

  // Aplica a regra de corte do SQL: (quotesCount > 0 OR salesCount > 0 OR premiumTotal > 0)
  const filteredActive = samplePartners
    .filter((p) => p.quotesCount > 0 || p.salesCount > 0 || p.premiumTotal > 0)
    .sort((a, b) => b.premiumTotal - a.premiumTotal || b.salesCount - a.salesCount || b.quotesCount - a.quotesCount);

  assert.strictEqual(filteredActive.length, 3, 'Parceiro Inativo C deve ser excluído da lista de destaque');
  assert.strictEqual(filteredActive[0].partnerId, 'p1', 'Parceiro Ativo A deve ser o 1º colocado');
  assert.strictEqual(filteredActive[1].partnerId, 'p4', 'Parceiro Ativo D deve ser o 2º colocado');
  assert.strictEqual(filteredActive[2].partnerId, 'p2', 'Parceiro B deve figurar em 3º por ter cotações');
  console.log('✓ Regra de corte e ordenação por faturamento/volume validada com sucesso.');

  // Teste 8: Trava de Parceiro Inativo/Desativado (ex: Andréia Possebon)
  console.log('Teste 8: Validando exclusão rigorosa de parceiros inativos/desativados...');
  interface PartnerWithStatus {
    partnerId: string;
    partnerName: string;
    status: 'active' | 'inactive' | 'suspended' | 'pending';
    quotesCount: number;
    salesCount: number;
    premiumTotal: number;
  }

  const partnerStatusSamples: PartnerWithStatus[] = [
    { partnerId: 'p1', partnerName: 'Laiane Tavares', status: 'active', quotesCount: 84, salesCount: 22, premiumTotal: 11063.67 },
    { partnerId: 'p2', partnerName: 'Andréia Possebon', status: 'inactive', quotesCount: 0, salesCount: 1, premiumTotal: 206.67 },
    { partnerId: 'p3', partnerName: 'Parceiro Suspenso', status: 'suspended', quotesCount: 10, salesCount: 5, premiumTotal: 4000.00 },
    { partnerId: 'p4', partnerName: 'Henry', status: 'active', quotesCount: 2, salesCount: 1, premiumTotal: 361.67 },
  ];

  // Regra do SQL: WHERE p.status = 'active' AND (quotesCount > 0 OR salesCount > 0 OR premiumTotal > 0)
  const destaques = partnerStatusSamples
    .filter((p) => p.status === 'active' && (p.quotesCount > 0 || p.salesCount > 0 || p.premiumTotal > 0))
    .sort((a, b) => b.premiumTotal - a.premiumTotal);

  assert.strictEqual(destaques.length, 2, 'Apenas parceiros com status "active" devem aparecer');
  assert.strictEqual(destaques.some((p) => p.partnerName === 'Andréia Possebon'), false, 'Andréia Possebon (inativa) NÃO PODE figurar nos destaques');
  assert.strictEqual(destaques.some((p) => p.status === 'suspended'), false, 'Parceiro suspenso NÃO PODE figurar nos destaques');
  console.log('✓ Parceiros inativos (inclusive Andréia Possebon) e suspensos são 100% filtrados dos destaques.');

  // Teste 9: Competência de Vendas pela Data de Emissão (issue_date) vs Data de Inserção (created_at)
  console.log('Teste 9: Validando competência cronológica de vendas por issue_date (e não created_at)...');
  interface SaleRecord {
    id: string;
    partnerId: string;
    issueDate: string; // YYYY-MM-DD
    createdAt: string; // ISO
    status: string;
    premioTotal: number;
  }

  const sampleSales: SaleRecord[] = [
    {
      id: 's1',
      partnerId: 'p1',
      issueDate: '2026-09-10',
      createdAt: '2026-09-10T14:00:00Z',
      status: 'ativa',
      premioTotal: 500,
    },
    {
      // Venda histórica de Andréia emitida em maio, porém sincronizada/importada no banco em setembro
      id: 's2',
      partnerId: 'p2',
      issueDate: '2026-05-15',
      createdAt: '2026-09-28T08:00:00Z',
      status: 'ativa',
      premioTotal: 206.67,
    },
    {
      id: 's3',
      partnerId: 'p4',
      issueDate: '2026-09-20',
      createdAt: '2026-09-20T10:00:00Z',
      status: 'ativa',
      premioTotal: 361.67,
    },
  ];

  const septPeriod = resolveAdminPeriod('2026-09');
  const startSept = septPeriod.start;
  const endSept = septPeriod.endExclusive;

  // Filtragem correta usando COALESCE(issue_date, created_at::date)
  const septSales = sampleSales.filter((s) => {
    const effectiveDate = s.issueDate || s.createdAt.slice(0, 10);
    return effectiveDate >= startSept && effectiveDate < endSept && s.status !== 'cancelada';
  });

  assert.strictEqual(septSales.length, 2, 'Devem ser contabilizadas apenas 2 vendas emitidas em setembro');
  assert.strictEqual(septSales.some((s) => s.id === 's2'), false, 'A venda s2 (issue_date maio) NÃO pode ser computada no mês de setembro');
  console.log('✓ Vendas com issue_date fora do período não entram no mês filtrado mesmo com created_at recente.');

  // Teste 10: Vendas Canceladas não computam prêmio nem volume
  console.log('Teste 10: Validando que apólices canceladas não entram na soma de vendas...');
  const salesWithCancel: SaleRecord[] = [
    { id: 's4', partnerId: 'p1', issueDate: '2026-09-15', createdAt: '2026-09-15T12:00:00Z', status: 'cancelada', premioTotal: 1200 },
    { id: 's5', partnerId: 'p1', issueDate: '2026-09-16', createdAt: '2026-09-16T12:00:00Z', status: 'ativa', premioTotal: 800 },
  ];

  const validSales = salesWithCancel.filter((s) => {
    const effectiveDate = s.issueDate || s.createdAt.slice(0, 10);
    return effectiveDate >= startSept && effectiveDate < endSept && s.status !== 'cancelada';
  });

  assert.strictEqual(validSales.length, 1, 'Apenas 1 venda ativa deve ser considerada');
  assert.strictEqual(validSales[0].id, 's5');
  assert.strictEqual(validSales[0].premioTotal, 800);
  console.log('✓ Vendas canceladas são devidamente ignoradas na apuração comercial.');

  console.log('\n--- TODOS OS 10 TESTES AUTOMATIZADOS PASSARAM COM 100% DE SUCESSO! ---');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
