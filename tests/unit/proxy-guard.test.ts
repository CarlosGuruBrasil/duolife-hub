import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/../proxy';

// Testes para validação da blindagem do Middleware Edge (proxy.ts)
// Conforme especificações de segurança ISSUE-003 / SEC-05
describe('proxy.ts - Blindagem do Middleware Edge (x-public-token guard)', () => {
  const createReq = (path: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) => {
    const req = new NextRequest(`https://duolife.com.br${path}`, {
      headers,
    });
    for (const [key, value] of Object.entries(cookies)) {
      req.cookies.set(key, value);
    }
    return req;
  };

  describe('1. Rotas públicas do fluxo de auto-contratação autorizadas via x-public-token', () => {
    const allowedPublicPaths = [
      '/api/cotacoes',
      '/api/cotacoes/cot-12345',
      '/api/cotacoes/rec-proposta-abc',
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

    it.each(allowedPublicPaths)(
      'deve autorizar com status 200 a rota pública de auto-contratação: %s',
      async (path) => {
        const req = createReq(path, { 'x-public-token': 'dlk_test_valid_token' });
        const res = await proxy(req);
        expect(res.status).toBe(200);
      }
    );
  });

  describe('2. Rotas internas administrativas e do portal bloqueadas com 401 via x-public-token', () => {
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
      '/api/clientes/cli-999',
      '/api/comissoes',
      '/api/comissoes/extrato',
      '/api/vendas',
      '/api/vendas/metricas',
      '/api/parceiros/me',
      '/api/parceiros/usuarios',
    ];

    it.each(blockedInternalPaths)(
      'deve barrar com status 401 tentativa de bypass em rota interna: %s',
      async (path) => {
        const req = createReq(path, { 'x-public-token': 'dlk_fake_bypass_token' });
        const res = await proxy(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data).toHaveProperty('error', 'Não autorizado');
      }
    );
  });

  describe('3. Rotas de negócio sem nenhum token (sem cookie e sem x-public-token)', () => {
    it('deve retornar 401 para endpoints de API desprotegidos sem credenciais', async () => {
      const paths = ['/api/comissoes', '/api/vendas', '/api/clientes', '/api/portal/equipe'];
      for (const path of paths) {
        const req = createReq(path);
        const res = await proxy(req);
        expect(res.status).toBe(401);
      }
    });

    it('deve redirecionar para /login ao tentar acessar rotas web do portal sem cookie de sessão', async () => {
      const req = createReq('/portal/dashboard');
      const res = await proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('deve redirecionar para /login ao tentar acessar rotas web do painel admin sem cookie de sessão', async () => {
      const req = createReq('/admin/usuarios');
      const res = await proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('deve retornar 401 ao acessar endpoints de API administrativa sem autenticação', async () => {
      const req = createReq('/api/admin/configuracoes');
      const res = await proxy(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toHaveProperty('error', 'Não autorizado');
    });
  });

  describe('4. Rotas públicas institucionais e páginas estáticas fora do matcher de proteção', () => {
    it('deve permitir acesso transparente (200) a rotas públicas que não requerem auth', async () => {
      const publicPaths = ['/termos', '/privacidade', '/sobre', '/seguro-rc-profissional'];
      for (const path of publicPaths) {
        const req = createReq(path);
        const res = await proxy(req);
        expect(res.status).toBe(200);
      }
    });
  });
});
