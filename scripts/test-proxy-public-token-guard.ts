import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

// Testes para validação da blindagem do Middleware Edge (ISSUE-003 / SEC-05)
async function runTests() {
  console.log('🧪 Iniciando testes de validação de blindagem do Middleware Edge (proxy.ts)...\n');

  // Helper para criar requisições de teste
  const createReq = (path: string, headers: Record<string, string> = {}) => {
    return new NextRequest(`https://duolife.com.br${path}`, {
      headers,
    });
  };

  // 1. Rotas que DEVEM ser autorizadas via x-public-token
  const allowedPublicPaths = [
    '/api/cotacoes',
    '/api/cotacoes/cot-12345',
    '/api/portal/planos',
    '/api/portal/ppe-cargos',
    '/api/portal/validar-cupom',
    '/api/portal/cotacoes/cot-123/gerar-contrato',
    '/api/portal/cotacoes/cot-123/gerar-pagamento',
    '/api/portal/cotacoes/cot-123/pagamentos',
    '/api/portal/cotacoes/cot-123/salvar-preferencia-pagamento',
    '/api/portal/cotacoes/cot-123/verificar-assinatura',
    '/api/portal/cotacoes/cot-123/preview-contrato-pdf',
    '/api/portal/cotacoes/cot-123/contrato-pdf',
  ];

  for (const path of allowedPublicPaths) {
    const req = createReq(path, { 'x-public-token': 'dlk_test_token' });
    const res = await proxy(req);
    assert.strictEqual(
      res.status,
      200,
      `Rota legítima de auto-contratação deveria passar com 200: ${path}`
    );
    console.log(`  ✅ [PASSOU] Rota autorizada para auto-contratação: ${path}`);
  }

  // 2. Rotas internas que DEVEM ser BLOQUEADAS se o usuário tentar burlar apenas com x-public-token
  const blockedInternalPaths = [
    '/api/portal/equipe',
    '/api/portal/equipe/user-123',
    '/api/portal/links',
    '/api/portal/vendas/exportar',
    '/api/portal/cotacoes/cot-123/recusar',
    '/api/portal/cotacoes/cot-123/sincronizar-asaas',
    '/api/portal/cotacoes/cot-123/enviar-fatura-email',
    '/api/portal/cotacoes/cot-123/enviar-proposta-email',
    '/api/clientes',
    '/api/comissoes',
    '/api/vendas',
    '/api/parceiros/me',
    '/api/parceiros/usuarios',
  ];

  for (const path of blockedInternalPaths) {
    const req = createReq(path, { 'x-public-token': 'dlk_fake_bypass' });
    const res = await proxy(req);
    assert.strictEqual(
      res.status,
      401,
      `Rota interna NÃO pode permitir bypass com x-public-token (esperado 401): ${path}`
    );
    console.log(`  🔒 [BLOQUEADO] Rota interna protegida contra bypass (401): ${path}`);
  }

  console.log('\n🎉 Todos os testes de blindagem do Middleware Edge passaram com sucesso!');
}

runTests().catch((err) => {
  console.error('\n❌ Falha nos testes de blindagem:', err);
  process.exit(1);
});
