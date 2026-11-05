# Plano de Implementação — Regra de Cancelamento de Venda e Cobrança por Inadimplência

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e automatizar a nova regra de cancelamento de vendas e cobranças por inadimplência (Parcela 1: 2 dias úteis; Parcelas > 1: 30 dias corridos prorrogados para o próximo dia útil se caírem em dia não útil) com arquitetura híbrida (Cronjob diário + verificação de contingência no primeiro login com PostgreSQL Advisory Lock).

**Architecture:** Abordagem modular em 4 camadas:
1. `src/lib/business-days.ts`: Funções de calendário para cálculo da data limite de cancelamento por parcela;
2. `src/lib/lifecycle-service.ts` e `src/lib/insurance-ops.ts`: Rotina de varredura e cancelamento em cascata (API Asaas + PostgreSQL transacional);
3. `src/lib/auth.ts`: Trigger de contingência assíncrono no primeiro login do dia com advisory lock para idempotência;
4. `src/lib/status-matrix.ts`: Classificação visual em tempo real nos dashboards e relatórios.

**Tech Stack:** Next.js 16, TypeScript, PostgreSQL (`postgres.js`), Asaas API, Vitest.

---

## Tasks de Implementação

### Task 1: Motor de Cálculo de Prazos de Cancelamento (`business-days.ts`)
**Arquivos:**
- Modificar: `src/lib/business-days.ts`
- Teste: `tests/unit/business-days-cancellation.test.ts`

- [ ] **Step 1: Escrever teste unitário falhando para os prazos de cancelamento**
  - Testar parcela 1 com vencimento em dia de semana (2 dias úteis).
  - Testar parcela 1 com vencimento em quinta/sexta-feira (pulando sábado e domingo).
  - Testar parcela 1 com feriados nacionais no intervalo.
  - Testar parcela > 1 com 30 dias corridos caindo em dia de semana (mantém o dia).
  - Testar parcela > 1 com 30 dias corridos caindo em sábado/domingo (prorroga para segunda-feira).
  - Testar parcela > 1 com 30 dias corridos caindo em feriado nacional (prorroga para o dia útil seguinte).
- [ ] **Step 2: Executar teste e validar falha**
  - `npx vitest run tests/unit/business-days-cancellation.test.ts`
- [ ] **Step 3: Implementar `ensureNextBusinessDay` e `calculateCancellationDeadline` em `src/lib/business-days.ts`**
- [ ] **Step 4: Executar teste e validar aprovação**
- [ ] **Step 5: Git commit**

---

### Task 2: Rotina de Execução de Cancelamento por Inadimplência (`lifecycle-service.ts` e `insurance-ops.ts`)
**Arquivos:**
- Modificar: `src/lib/lifecycle-service.ts`
- Modificar: `src/lib/insurance-ops.ts`
- Teste: `tests/unit/lifecycle-cancellation-routine.test.ts`

- [ ] **Step 1: Escrever teste unitário para a rotina de cancelamento de inadimplência**
  - Simular parcelas pendentes dentro e fora do prazo de tolerância.
  - Validar que apenas parcelas que ultrapassaram a data limite disparam o cancelamento.
  - Validar cancelamento no Asaas e transação atômica em `sales`, `cotacoes` e `commissions`.
- [ ] **Step 2: Executar teste e validar falha**
- [ ] **Step 3: Implementar `runDelinquencyCancellations` e integrar em `runFullLifecycleScan`**
- [ ] **Step 4: Executar teste e validar aprovação**
- [ ] **Step 5: Git commit**

---

### Task 3: Gatilho de Contingência no Primeiro Login com Advisory Lock (`auth.ts`)
**Arquivos:**
- Modificar: `src/lib/auth.ts`
- Modificar: `src/lib/lifecycle-service.ts`
- Teste: `tests/unit/login-lifecycle-trigger.test.ts`

- [ ] **Step 1: Escrever teste unitário para o trigger de login**
  - Validar que se já rodou hoje, não aciona o scan.
  - Validar que se não rodou hoje, aciona em background e adquire o lock sem bloquear a sessão do usuário.
- [ ] **Step 2: Executar teste e validar falha**
- [ ] **Step 3: Implementar `triggerLifecycleScanIfPending` e chamar em `verifyAdminAuth` / endpoints de autenticação**
- [ ] **Step 4: Executar teste e validar aprovação**
- [ ] **Step 5: Git commit**

---

### Task 4: Atualização da Matriz de Status e Documentação de Regras de Negócio
**Arquivos:**
- Modificar: `src/lib/status-matrix.ts`
- Modificar: `docs/BUSINESS_RULES.md`
- Teste: `tests/unit/status-matrix-cancellation.test.ts`

- [ ] **Step 1: Atualizar testes e implementar suporte à nova regra de cancelamento em `status-matrix.ts`**
- [ ] **Step 2: Executar bateria completa de testes de status**
  - `npx vitest run tests/unit/status-matrix`
- [ ] **Step 3: Atualizar documentação `docs/BUSINESS_RULES.md` (regras BR-020 e nova regra de cancelamento)**
- [ ] **Step 4: Git commit**

---

### Task 5: Verificação Completa e Build
**Arquivos:** Todos os modificados
- [ ] **Step 1: Executar suite de testes vitest**
  - `npm test` ou `npx vitest run`
- [ ] **Step 2: Executar build de produção do Next.js**
  - `npm run build`
- [ ] **Step 3: Atualizar `~/Desktop/ORACULO/MEMORY.md`**
