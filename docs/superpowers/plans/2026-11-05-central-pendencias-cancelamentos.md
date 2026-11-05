# Central de Pendências e Cancelamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Central de Pendências e Cancelamentos no DuoLife Hub como uma ferramenta consultiva unificada de alta performance e isolamento hierárquico estrito (RBAC), cobrindo cotações e apólices em atraso (BR-031) ou canceladas nas rotas `/portal/pendencias-cancelamentos` e `/admin/pendencias-cancelamentos`.

**Architecture:** Módulo com camada de serviço única (`src/lib/pendencias-cancelamentos-service.ts`) executando consultas agregadas no PostgreSQL via CTEs para unir cotações, vendas e parcelas sem duplicidades e com paginação real. Interface compartilhada e responsiva (`PendenciasCancelamentosView`) com 3 abas, 4 KPIs, filtros combináveis e acordeão de parcelas, consumida pelos Server Components do Portal e do Admin com injeção segura de contexto de autenticação (`getPartnerAccessContext` e `verifyAuth`).

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, PostgreSQL 16 (postgres.js), Vitest 5, Tailwind CSS 4, Lucide React.

**Spec:** `docs/superpowers/specs/2026-11-05-central-pendencias-cancelamentos-design.md`

## Global Constraints

- Respostas e documentação técnica estritamente em português brasileiro (UTF-8).
- Tema Claro por padrão no Design System DuoLife (`#f7faf9`, `bg-white`, `border-gray-200`, `text-gray-900`).
- Badges no padrão `bg-[cor]-50 border-[cor]-200 text-[cor]-800 rounded-full`.
- Responsividade obrigatória em 3 breakpoints: Mobile (375px), Tablet (768px) e Desktop (1440px) com área de toque mínima de 44x44px.
- Reutilização obrigatória da regra BR-031 (`calculateCancellationDeadline`, `isInstallmentPastCancellationDeadline` em `src/lib/business-days.ts`).
- Isolamento de dados obrigatório no SQL do backend — proibido filtro de segurança exclusivo no frontend.
- Não executar operações financeiras destrutivas, cancelamentos automáticos ou mutações de cobrança ao consultar a página.
- Prevenção rigorosa contra consultas N+1 e proibição de filtros/paginação em memória no Node.js.

## Review Focus

1. **Tentativa de Ampliação de Escopo por Parâmetro URL:** Um vendedor injetando `corretoraId` ou `partnerId` de terceiros nos parâmetros de busca não pode ter acesso a registros fora do seu `userId`.  
   *Teste vinculado:* `tests/unit/pendencias-cancelamentos-rbac.test.ts` (Task 3).
2. **Duplicidade entre Cotação e Venda:** Uma cotação que converteu em venda ativa e posteriormente teve parcelas vencidas ou foi cancelada deve aparecer exatamente 1 vez na listagem e somar 1 vez nos KPIs.  
   *Teste vinculado:* `tests/unit/pendencias-cancelamentos-service.test.ts` (Task 2).
3. **Parcela Futura Classificada Erroneamente como Atrasada:** Contrato com parcelas que ainda não atingiram a data de vencimento (`due_date >= CURRENT_DATE`) não pode ser considerado em atraso nem computado na soma de atrasos.  
   *Teste vinculado:* `tests/unit/pendencias-cancelamentos-service.test.ts` (Task 2).
4. **Substituição de Cobrança Avulsa Inicial por Carnê:** Parcelas avulsas preliminares descontinuadas quando o carnê completo foi gerado não devem inflacionar a contagem de atrasos.  
   *Teste vinculado:* `tests/unit/pendencias-cancelamentos-service.test.ts` (Task 2).
5. **Diferenciação Estrita de Cancelamento vs Atraso com Tolerância:** Contrato com 1ª parcela vencida a 1 dia útil ainda está sob tolerância e não pode figurar como cancelado ou ter a tolerância dada como expirada.  
   *Teste vinculado:* `tests/unit/pendencias-cancelamentos-service.test.ts` (Task 2).

---

## File Structure

- `src/types/pendencias-cancelamentos.ts`: Interfaces de domínio, filtros, KPIs, tipos de tabs e retorno paginado.
- `src/lib/pendencias-cancelamentos-service.ts`: Mecanismo central de consulta SQL (CTEs), enriquecimento BR-031, segregação RBAC e agregação de KPIs.
- `src/components/pendencias/PendenciasKpiCards.tsx`: Exibição visual dos 4 cards de indicadores.
- `src/components/pendencias/PendenciasFiltrosBar.tsx`: Barra de pesquisa, seletores hierárquicos e filtros combinados.
- `src/components/pendencias/ParcelasAcordeao.tsx`: Subtabela expansível de parcelas com status e links.
- `src/components/pendencias/PendenciasTabela.tsx`: Grid principal responsivo com suporte a acordeão e estados vazios/erro.
- `src/components/pendencias/PendenciasCancelamentosView.tsx`: Orquestrador client/server com controle de abas, paginação e atualização.
- `app/api/pendencias-cancelamentos/route.ts`: Endpoint GET autenticado para consumo assíncrono.
- `app/portal/pendencias-cancelamentos/page.tsx`: Rota Server Component do Portal com `PortalShell`.
- `app/admin/pendencias-cancelamentos/page.tsx`: Rota Server Component do Admin com `AdminShell`.
- `app/portal/_components/PortalShell.tsx`: Inclusão do link "Pendências e Cancelamentos" no menu do Portal.
- `app/admin/_components/AdminShell.tsx`: Inclusão do link "Pendências e Cancelamentos" no menu do Admin.
- `tests/unit/pendencias-cancelamentos-service.test.ts`: Suíte de testes unitários da lógica de negócios, cálculos BR-031 e deduplicação.
- `tests/unit/pendencias-cancelamentos-rbac.test.ts`: Suíte de testes de isolamento hierárquico nos 5 papéis.

---

### Task 1: Definição de Tipos e Contratos de Dados

**Files:**
- Create: `src/types/pendencias-cancelamentos.ts`

**Interfaces:**
- Consumes: N/A
- Produces: `PendenciaTab`, `TipoRegistro`, `ParcelaDetalhe`, `PendenciaCancelamentoItem`, `PendenciasKPIs`, `PendenciasFiltros`, `PendenciasPaginadasResult`

- [ ] **Step 1: Criar o arquivo de tipos `src/types/pendencias-cancelamentos.ts`**
  Definir os tipos TypeScript estritos para abas (`'em_atraso' | 'canceladas' | 'visao_geral'`), itens de listagem, parcelas detalhadas, filtros combináveis e resultados paginados com KPIs.

- [ ] **Step 2: Verificar validação de compilação dos tipos**
  Run: `npx tsc --noEmit`
  Expected: PASS sem erros de tipo.

---

### Task 2: Service de Backend — Agregação SQL, Deduplicação e Regra BR-031

**Files:**
- Create: `src/lib/pendencias-cancelamentos-service.ts`
- Create: `tests/unit/pendencias-cancelamentos-service.test.ts`

**Interfaces:**
- Consumes: `src/types/pendencias-cancelamentos.ts`, `src/lib/pg.ts`, `src/lib/business-days.ts` (`calculateCancellationDeadline`, `isInstallmentPastCancellationDeadline`), `src/lib/auth.ts` (`PartnerAccessContext`)
- Produces: `getPendenciasCancelamentosList(access: PartnerAccessContext, filtros: PendenciasFiltros): Promise<PendenciasPaginadasResult>`

- [ ] **Step 1: Escrever teste com falha para regras financeiras e deduplicação**
  Criar `tests/unit/pendencias-cancelamentos-service.test.ts` testando:
  - Deduplicação de cotação e venda (1 registro retornado).
  - Classificação correta de parcela 1 em atraso dentro da tolerância de 2 dias úteis.
  - Classificação de parcela 2 com > 30 dias prorrogados como tolerância excedida.
  - Ignorar parcelas com vencimento futuro.
  - Cálculo consolidado de KPIs sem contagem dupla.

- [ ] **Step 2: Executar teste para verificar que falha**
  Run: `npm run test -- pendencias-cancelamentos-service`
  Expected: FAIL com módulo ou função não encontrada.

- [ ] **Step 3: Implementar `getPendenciasCancelamentosList` em `src/lib/pendencias-cancelamentos-service.ts`**
  - Implementar CTE `contratacoes_base` com `cotacoes` LEFT JOIN `sales` agregando dados comerciais e cadastrais.
  - Implementar CTE `installments_agg` agrupando `payment_installments` por `cotacao_id` com `COUNT`, `SUM`, `MIN(due_date)`, e agregação JSON de parcelas.
  - Aplicar cláusula de aba (`em_atraso`, `canceladas`, `visao_geral`).
  - Enriquecer os itens retornados na página com `calculateCancellationDeadline` e status de tolerância BR-031.
  - Calcular os 4 KPIs em query agregada respeitando os filtros gerais.

- [ ] **Step 4: Executar testes da suíte de serviço**
  Run: `npm run test -- pendencias-cancelamentos-service`
  Expected: PASS

- [ ] **Step 5: Commit da camada de serviço**
  ```bash
  git add src/types/pendencias-cancelamentos.ts src/lib/pendencias-cancelamentos-service.ts tests/unit/pendencias-cancelamentos-service.test.ts
  git commit -m "feat(pendencias): implementar service unificado de pendencias e cancelamentos com regra BR-031"
  ```

---

### Task 3: Service de Backend — Isolamento Hierárquico RBAC Multi-tenant

**Files:**
- Modify: `src/lib/pendencias-cancelamentos-service.ts`
- Create: `tests/unit/pendencias-cancelamentos-rbac.test.ts`

**Interfaces:**
- Consumes: `PartnerAccessContext`, `AuthUser`, `isInternalUser`
- Produces: Cláusulas SQL seguras de autorização injetadas nas CTEs.

- [ ] **Step 1: Escrever teste com falha para isolamento nos 5 papéis de acesso**
  Criar `tests/unit/pendencias-cancelamentos-rbac.test.ts` testando:
  - Vendedor (`partner_broker`): restrito a `c.partner_user_id = user.userId`.
  - Gestor (`partner_manager`): restrito a `c.partner_user_id IN (visibleUserIds)`.
  - Gestor tentando forçar `vendedorUserId` fora da sua equipe (bloqueado/ignorado).
  - Corretora (`corretora_admin` / `corretora_manager` / `corretora_staff`): restrito a `corretora_id`.
  - Admin/Dev (`duolife_admin`, `duolife_dev`): visão global irrestrita.

- [ ] **Step 2: Executar teste para verificar falha**
  Run: `npm run test -- pendencias-cancelamentos-rbac`
  Expected: FAIL

- [ ] **Step 3: Refinar as cláusulas de segurança em `src/lib/pendencias-cancelamentos-service.ts`**
  Garantir sanitização e interseção estrita dos filtros de entrada (`corretoraId`, `partnerId`, `vendedorUserId`) com os limites autorizados de `access`. Se um vendedor passar outro ID, a consulta sobrepõe com seu próprio ID.

- [ ] **Step 4: Executar testes de RBAC**
  Run: `npm run test -- pendencias-cancelamentos-rbac`
  Expected: PASS

- [ ] **Step 5: Commit do isolamento hierárquico**
  ```bash
  git add src/lib/pendencias-cancelamentos-service.ts tests/unit/pendencias-cancelamentos-rbac.test.ts
  git commit -m "feat(security): aplicar isolamento hierarquico estrito no backend para pendencias e cancelamentos"
  ```

---

### Task 4: Endpoint de API Seguro (`/api/pendencias-cancelamentos`)

**Files:**
- Create: `app/api/pendencias-cancelamentos/route.ts`

**Interfaces:**
- Consumes: `verifyAuth`, `getPartnerAccessContext`, `getPendenciasCancelamentosList`
- Produces: `GET /api/pendencias-cancelamentos` retornando JSON `{ items, kpis, total, page, pageSize, totalPages }`

- [ ] **Step 1: Implementar o endpoint REST autenticado**
  Criar `app/api/pendencias-cancelamentos/route.ts` com validação de sessão `verifyAuth()`, resolução de contexto `getPartnerAccessContext(user)`, extração de `searchParams` e chamada a `getPendenciasCancelamentosList`. Retornar 401 se não autenticado.

- [ ] **Step 2: Executar testes de rota ou chamada direta**
  Run: `npm run test -- pendencias-cancelamentos`
  Expected: PASS

- [ ] **Step 3: Commit do endpoint**
  ```bash
  git add app/api/pendencias-cancelamentos/route.ts
  git commit -m "feat(api): criar endpoint autenticado para pendencias e cancelamentos"
  ```

---

### Task 5: Componentes de Interface — KPIs, Filtros, Tabela e Acordeão de Parcelas

**Files:**
- Create: `src/components/pendencias/PendenciasKpiCards.tsx`
- Create: `src/components/pendencias/PendenciasFiltrosBar.tsx`
- Create: `src/components/pendencias/ParcelasAcordeao.tsx`
- Create: `src/components/pendencias/PendenciasTabela.tsx`
- Create: `src/components/pendencias/PendenciasCancelamentosView.tsx`

**Interfaces:**
- Consumes: `src/types/pendencias-cancelamentos.ts`, `src/lib/format.ts`
- Produces: Componente completo e responsivo `PendenciasCancelamentosView` com estados de loading, acordeão de parcelas e controles de filtro/abas.

- [ ] **Step 1: Criar `PendenciasKpiCards.tsx`**
  Renderizar os 4 cards de KPIs no topo em grid responsivo (1 coluna mobile, 2 tablet, 4 desktop), estilizados no padrão DuoLife (fundo branco, bordas suaves, ícones ilustrativos).

- [ ] **Step 2: Criar `ParcelasAcordeao.tsx`**
  Renderizar a tabela interna expansível de parcelas exibindo número, valor, vencimento, situação, dias de atraso, deadline BR-031 e links para Asaas (Pix/boleto) com botões de toque >= 44px.

- [ ] **Step 3: Criar `PendenciasFiltrosBar.tsx`**
  Barra de pesquisa textual, filtros de faixa de atraso, tipo de registro e seletores de data com debounce e botões de limpar filtros.

- [ ] **Step 4: Criar `PendenciasTabela.tsx`**
  Tabela principal com linhas expansíveis (toggle do acordeão), badges coloridos de situação (`em_atraso_tolerancia`, `em_atraso_critico`, `cancelada`), link para detalhes da cotação/venda e estado vazio amigável.

- [ ] **Step 5: Criar `PendenciasCancelamentosView.tsx`**
  Componente orquestrador contendo a navegação por 3 abas (`Em Atraso`, `Canceladas`, `Visão Geral`), integração dos KPIs, filtros, tabela e paginação no rodapé.

- [ ] **Step 6: Verificar compilação dos componentes**
  Run: `npx tsc --noEmit`
  Expected: PASS

- [ ] **Step 7: Commit dos componentes visuais**
  ```bash
  git add src/components/pendencias/
  git commit -m "feat(ui): implementar componentes visuais da Central de Pendencias e Cancelamentos"
  ```

---

### Task 6: Páginas do Portal e Admin + Integração aos Menus de Navegação

**Files:**
- Create: `app/portal/pendencias-cancelamentos/page.tsx`
- Create: `app/admin/pendencias-cancelamentos/page.tsx`
- Modify: `app/portal/_components/PortalShell.tsx`
- Modify: `app/admin/_components/AdminShell.tsx`

**Interfaces:**
- Consumes: `verifyPartnerAuth`, `verifyAdminAuth`, `getPartnerAccessContext`, `getPendenciasCancelamentosList`, `PendenciasCancelamentosView`
- Produces: Rotas acessíveis via navegador e links nos menus laterais.

- [ ] **Step 1: Implementar `app/portal/pendencias-cancelamentos/page.tsx`**
  Server Component protegido com `verifyPartnerAuth`, obtendo os dados iniciais paginados e renderizando `PortalShell` com `PendenciasCancelamentosView`.

- [ ] **Step 2: Implementar `app/admin/pendencias-cancelamentos/page.tsx`**
  Server Component protegido com `verifyAdminAuth`, obtendo os dados iniciais do escopo administrativo e renderizando `AdminShell` com `PendenciasCancelamentosView`.

- [ ] **Step 3: Adicionar item de menu em `PortalShell.tsx`**
  Incluir `{ href: '/portal/pendencias-cancelamentos', label: 'Pendências e Cancelamentos', icon: AlertTriangle }` no array `nav` do Portal.

- [ ] **Step 4: Adicionar item de menu em `AdminShell.tsx`**
  Incluir na seção "Operação" o item `{ href: '/admin/pendencias-cancelamentos', label: 'Pendências e Cancelamentos', icon: AlertTriangle, description: 'Inadimplência, tolerâncias e cancelados.' }`.

- [ ] **Step 5: Commit das páginas e menus**
  ```bash
  git add app/portal/pendencias-cancelamentos/ app/admin/pendencias-cancelamentos/ app/portal/_components/PortalShell.tsx app/admin/_components/AdminShell.tsx
  git commit -m "feat(routes): integrar rotas de pendencias e cancelamentos nos ambientes portal e admin"
  ```

---

### Task 7: Verificação Integrada, Testes Completos e Build de Produção

**Files:**
- Verify all modified/created files

- [ ] **Step 1: Executar suíte completa de testes no Vitest**
  Run: `npm run test`
  Expected: Todos os testes passando com 100% de sucesso.

- [ ] **Step 2: Executar build de produção do Next.js**
  Run: `npm run build`
  Expected: Build concluído com sucesso sem erros de TypeScript, Lint ou CSS parser crash.

- [ ] **Step 3: Commit final e fechamento de ciclo**
  ```bash
  git status
  git commit -m "chore(release): consolidar Central de Pendencias e Cancelamentos no DUOLife Hub"
  ```
