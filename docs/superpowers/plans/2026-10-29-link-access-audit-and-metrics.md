# Auditoria e Métricas de Conversão em Links de Venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o rastreamento anônimo e seguro (em conformidade com a LGPD) de acessos e cliques aos links de venda de autocadastro (`/contratar/[token]`), registrando o histórico de visitas e contabilizando em tempo real as métricas de conversão do funil de vendas (Acessos $\rightarrow$ Cotações Geradas $\rightarrow$ Vendas Concluídas) no Portal do Parceiro.

**Architecture:**
1. **Schema & Banco de Dados (`src/lib/schema.ts`):** Adicionar colunas agregadoras na tabela `public_sale_links` (`views_count`, `unique_views_count`, `last_accessed_at`) e criar a tabela de histórico `sale_link_access_logs` com índices otimizados para relatórios temporais e deduplicação por hash de IP (`ip_hash`).
2. **Motor de Rastreamento (`src/lib/link-tracker.ts`):** Extrair IP e User-Agent de cabeçalhos proxy (Cloudflare `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`), anonimizar IP com SHA-256 e registrar o acesso incrementando os contadores de forma atômica e não-bloqueante.
3. **Ponto de Captura Pública (`app/api/public/contratacao/[token]/route.ts`):** Acionar o registro assíncrono sempre que a página pública de contratação de um link válido e ativo for carregada.
4. **Agregação e Métricas de Conversão (`app/api/portal/links/route.ts`):** Retornar contagem de propostas iniciadas (`total_cotacoes`), apólices concluídas/pagas (`total_vendas`), cliques totais (`views_count`), visitantes únicos (`unique_views_count`) e taxas de conversão (`conversion_rate_cotacao` e `conversion_rate_venda`).
5. **Interface no Portal do Parceiro (`src/components/portal/PartnerProfileForm.tsx`):** Exibir régua visual de métricas com badges no tema Light Mode em cada card de link exclusivo.

**Tech Stack:** TypeScript, Next.js (App Router), Postgres.js, crypto (Node.js nativo), Vitest.

---

## Global Constraints
- Todas as respostas em português brasileiro.
- Todos os arquivos codificados estritamente em UTF-8.
- Conformidade estrita com LGPD: IPs nunca são armazenados em texto claro; apenas o hash criptográfico unidirecional SHA-256 é persistido.
- Rastreamento assíncrono (não pode atrasar a resposta da página de contratação para o cliente segurado).
- Nenhuma regressão nos testes existentes (32 arquivos / 348 testes).
- Build de produção (`npm run build`) e `npx tsc --noEmit` com zero erros.

## Review Focus
1. Acessos duplicados do mesmo IP para o mesmo link: deve incrementar `views_count`, mas NÃO deve incrementar `unique_views_count`.
2. Acessos de novos IPs: incrementa tanto `views_count` quanto `unique_views_count`.
3. Links inativos ou expirados: não devem ter acessos contabilizados em endpoints públicos.
4. Taxa de conversão quando `views_count = 0`: deve retornar 0% com segurança sem gerar divisão por zero (`NaN` ou `Infinity`).
5. Design System: garantir contraste e tema claro (Light Mode) na régua de métricas sem classes de tema escuro (`bg-slate-900` em cards).

---

### Task 1: Schema e Tabela de Auditoria de Acessos
**Files:**
- Modify: `src/lib/schema.ts`
- Test: `tests/unit/link-tracker-schema.test.ts`

- [x] **Step 1.1:** Criar teste unitário `tests/unit/link-tracker-schema.test.ts` verificando que a chamada a `ensureSchema()` executa as queries DDL esperadas para colunas em `public_sale_links` e tabela `sale_link_access_logs`.
- [x] **Step 1.2:** Modificar `src/lib/schema.ts`:
  - Adicionar `'sale_link_access_logs'` em `EXPECTED_TABLES`.
  - Adicionar `ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS views_count INT NOT NULL DEFAULT 0;`
  - Adicionar `ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS unique_views_count INT NOT NULL DEFAULT 0;`
  - Adicionar `ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;`
  - Criar tabela `sale_link_access_logs` com chaves estrangeiras e índices.
- [x] **Step 1.3:** Executar o teste e validar aprovação.

---

### Task 2: Módulo de Rastreamento de Acessos (`src/lib/link-tracker.ts`)
**Files:**
- Create: `src/lib/link-tracker.ts`
- Test: `tests/unit/link-tracker.test.ts`

- [x] **Step 2.1:** Criar teste unitário `tests/unit/link-tracker.test.ts` cobrindo:
  - Anonimização de IP com SHA-256 e salt.
  - Registro de primeiro acesso de um IP (incrementa `views_count` e `unique_views_count`).
  - Registro de acesso repetido do mesmo IP (incrementa apenas `views_count`).
  - Tratamento de ausência de headers de IP (fallback seguro).
  - Cálculo de métricas e taxas de conversão (`calculateConversionMetrics`).
- [x] **Step 2.2:** Implementar `src/lib/link-tracker.ts` exportando `hashClientIp`, `extractClientAccessData`, `trackSaleLinkAccess` e `calculateConversionMetrics`.
- [x] **Step 2.3:** Rodar os testes e garantir 100% de sucesso.

---

### Task 3: Integração do Rastreamento na Rota Pública de Contratação
**Files:**
- Modify: `app/api/public/contratacao/[token]/route.ts`
- Test: `tests/unit/public-contratacao-tracking.test.ts`

- [x] **Step 3.1:** Criar teste unitário `tests/unit/public-contratacao-tracking.test.ts` validando que ao requisitar `GET /api/public/contratacao/[token]` de um link ativo, a função `trackSaleLinkAccess` é chamada com os dados do link e requisição.
- [x] **Step 3.2:** Integrar chamada não-bloqueante a `trackSaleLinkAccess` em `app/api/public/contratacao/[token]/route.ts`.
- [x] **Step 3.3:** Rodar o teste e validar aprovação.

---

### Task 4: Agregação de Métricas na API do Portal
**Files:**
- Modify: `app/api/portal/links/route.ts`
- Test: `tests/unit/portal-links-metrics.test.ts`

- [x] **Step 4.1:** Criar teste unitário `tests/unit/portal-links-metrics.test.ts` validando que o `GET /api/portal/links` retorna os campos `views_count`, `unique_views_count`, `total_cotacoes`, `total_vendas`, `conversion_rate_cotacao` e `conversion_rate_venda`.
- [x] **Step 4.2:** Atualizar a query SQL em `app/api/portal/links/route.ts` adicionando `COALESCE(pl.views_count, 0)`, `COALESCE(pl.unique_views_count, 0)`, `pl.last_accessed_at` e agregação condicional `COUNT(c.id) FILTER (WHERE c.status IN ('aprovada', 'emitida')) AS total_vendas`.
- [x] **Step 4.3:** Calcular e anexar as taxas de conversão em cada link no retorno JSON.
- [x] **Step 4.4:** Rodar o teste e validar aprovação.

---

### Task 5: Interface de Métricas no Portal do Parceiro
**Files:**
- Modify: `src/components/portal/PartnerProfileForm.tsx`
- Test: `tests/unit/portal-links-metrics-ui.test.tsx`

- [x] **Step 5.1:** Criar teste unitário `tests/unit/portal-links-metrics-ui.test.tsx` verificando que o card de link renderiza a régua de métricas (Cliques, Únicos, Propostas, Vendas e Selo de Conversão %).
- [x] **Step 5.2:** Atualizar a interface `CustomSaleLink` e o componente `PartnerProfileForm.tsx` adicionando a régua compacta de métricas no padrão Light Mode (`bg-gray-50/80`, bordas suaves, ícones de olho, usuário, arquivo e troféu).
- [x] **Step 5.3:** Validar teste da interface.

---

### Task 6: Verificação de Regressão, TypeScript e Build
**Files:**
- Run: `npm test`
- Run: `npx tsc --noEmit`
- Run: `npm run build`
- Modify: `~/Desktop/ORACULO/MEMORY.md`

- [x] **Step 6.1:** Executar suite completa do Vitest (`npm test`).
- [x] **Step 6.2:** Executar typecheck (`npx tsc --noEmit`).
- [x] **Step 6.3:** Executar compilação de produção (`npm run build`).
- [x] **Step 6.4:** Atualizar a memória do projeto em `~/Desktop/ORACULO/MEMORY.md`.
