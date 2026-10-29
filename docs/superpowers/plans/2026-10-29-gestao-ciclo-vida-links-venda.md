# Gestão de Ciclo de Vida dos Links de Venda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a gestão completa do ciclo de vida dos links de venda pública (`public_sale_links`), permitindo que corretores e administradores desativem, reativem e revoguem links com desconto ou normais, impedindo contratações não autorizadas.

**Architecture:** 
- Adição de rotas RESTful dedicadas (`PATCH` e `DELETE`) em `app/api/portal/links/[id]/route.ts` para o Portal do Corretor (com validação estrita de pertencimento ao parceiro logado).
- Adição de rotas RESTful (`PATCH` e `DELETE`) em `app/api/admin/parceiros/[id]/links/[linkId]/route.ts` para o Painel Administrativo.
- Atualização das interfaces de usuário no Portal (`PartnerProfileForm.tsx`) e Admin (`_client.tsx`) com badges visuais de status (`Ativo`, `Inativo`, `Expirado`) e botões de ação (Desativar / Reativar).
- Testes unitários com Vitest cobrindo autenticação, permissões, atualização de status e o bloqueio imediato do link inativo em `/api/public/contratacao/[token]`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, PostgreSQL (`@/lib/pg`), Zod, Tailwind CSS, Lucide React.

## Global Constraints

- Todos os arquivos devem ser codificados em UTF-8.
- Respeitar estritamente o tema claro (Light Mode) e classes Tailwind do Design System do projeto.
- Testes automatizados executados via Vitest (`npm test`).
- 0 erros no TypeScript (`npx tsc --noEmit`).

---

### Task 1: Endpoint de Ciclo de Vida no Portal (`/api/portal/links/[id]`)

**Files:**
- Create: `app/api/portal/links/[id]/route.ts`
- Test: `tests/unit/portal-links-lifecycle.test.ts`

- [ ] **Step 1.1:** Criar teste unitário que falha (`tests/unit/portal-links-lifecycle.test.ts`) cobrindo:
  - Rejeição não autenticada (401).
  - Tentativa de desativar link de outro parceiro (404/403).
  - Sucesso ao atualizar status para `inactive` via `PATCH`.
  - Sucesso ao reativar status para `active` via `PATCH`.
  - Sucesso ao desativar via `DELETE`.
- [ ] **Step 1.2:** Executar `npx vitest run tests/unit/portal-links-lifecycle.test.ts` e verificar que falha (arquivo de rota ainda não existe).
- [ ] **Step 1.3:** Implementar `app/api/portal/links/[id]/route.ts` com validação Zod, autenticação de parceiro e atualização no PostgreSQL via `@/lib/pg`.
- [ ] **Step 1.4:** Reexecutar os testes e confirmar que passam com 100% de sucesso.

---

### Task 2: Endpoint de Ciclo de Vida no Admin (`/api/admin/parceiros/[id]/links/[linkId]`)

**Files:**
- Create: `app/api/admin/parceiros/[id]/links/[linkId]/route.ts`
- Test: `tests/unit/admin-links-lifecycle.test.ts`

- [ ] **Step 2.1:** Criar teste unitário que falha (`tests/unit/admin-links-lifecycle.test.ts`) cobrindo:
  - Rejeição de usuário não administrador (401/403).
  - Atualização de status e rótulo de link pelo administrador via `PATCH`.
  - Desativação via `DELETE`.
- [ ] **Step 2.2:** Executar `npx vitest run tests/unit/admin-links-lifecycle.test.ts` e verificar falha.
- [ ] **Step 2.3:** Implementar `app/api/admin/parceiros/[id]/links/[linkId]/route.ts`.
- [ ] **Step 2.4:** Reexecutar os testes e confirmar aprovação.

---

### Task 3: Teste de Bloqueio Imediato no Autocadastro Público

**Files:**
- Test: `tests/unit/public-contratacao-link-status.test.ts`

- [ ] **Step 3.1:** Criar teste verificando que `/api/public/contratacao/[token]` retorna erro 404 quando um link tem `status = 'inactive'`.
- [ ] **Step 3.2:** Executar o teste e validar a garantia de segurança contra contratações em links inativados.

---

### Task 4: Atualização da Interface do Portal do Corretor

**Files:**
- Modify: `src/components/portal/PartnerProfileForm.tsx`

- [ ] **Step 4.1:** Adicionar suporte a status dinâmico na lista de links exclusivos de clientes:
  - Badge visual de status (`Ativo`, `Inativo`, `Expirado`).
  - Botão de ação com confirmação suave: "Desativar" (para links ativos) e "Reativar" (para links inativos).
  - Chamada à API `PATCH /api/portal/links/[id]` com feedback visual imediato via `toast`.
- [ ] **Step 4.2:** Validar interatividade e acessibilidade WAI-ARIA (área de toque >= 44px).

---

### Task 5: Atualização da Interface do Painel Administrativo

**Files:**
- Modify: `app/admin/parceiros/[id]/_client.tsx`
- Modify: `app/admin/parceiros/[id]/page.tsx`

- [ ] **Step 5.1:** Atualizar a query SQL em `app/admin/parceiros/[id]/page.tsx` para selecionar `COALESCE(pl.discount_percent, 0) AS discount_percent` e atualizar o tipo `LinkRow`.
- [ ] **Step 5.2:** Em `_client.tsx`, exibir o badge de status (`Ativo`, `Inativo`, `Expirado`), badge de desconto (`-X% OFF` ou `Tabela Normal`) e botão para alternar status (Desativar / Reativar).
- [ ] **Step 5.3:** Validar integração com a rota administrativa.

---

### Task 6: Verificação Completa e Build

- [ ] **Step 6.1:** Executar suite completa de testes: `npm test`.
- [ ] **Step 6.2:** Executar checagem de tipos: `npx tsc --noEmit`.
- [ ] **Step 6.3:** Executar validação de build de produção: `npm run build`.
