# Plano de Implementação — Correções da Auditoria DuoLife Hub

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar correções estruturais, de segurança, financeiras e de UX para os apontamentos levantados na auditoria completa do DuoLife Hub, garantindo 100% de cobertura com testes unitários e de integração no Vitest.

**Architecture:** Abordagem escalonada dividida em 4 blocos independentes (Financeiro/Webhooks, Segurança/LGPD, Regras de Negócio/Duplicidade e Front-end/Mobile), aplicando TDD, atomicidade transacional no PostgreSQL (`postgres.js`), blindagem de RBAC e sanitização de inputs.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (`postgres.js`), Tailwind CSS, Gotenberg Chromium, Vitest.

---

## Bloco 1: Financeiro, Webhooks Asaas e Concorrência

### Task 1.1: Cancelamento de Apólices e Estorno de Comissões em `PAYMENT_REFUNDED`
**Arquivos:**
- Modificar: `app/api/webhook/asaas/route.ts`
- Modificar: `src/lib/webhook-processor.ts`
- Teste: `tests/unit/asaas-refund-commission.test.ts`

- [ ] **Step 1: Escrever teste falhando para estorno**
  - Verificar que ao receber evento `PAYMENT_REFUNDED` ou `PAYMENT_DELETED`:
    * `commissions` associadas à cotação/venda são atualizadas para `status = 'estornada'`;
    * `sales` é atualizada para `status = 'cancelada'`;
    * `cotacoes` é atualizada para `status = 'cancelada'`.
- [ ] **Step 2: Executar teste e validar falha**
  - `npx vitest run tests/unit/asaas-refund-commission.test.ts`
- [ ] **Step 3: Implementar tratamento atômico em `app/api/webhook/asaas/route.ts` e `webhook-processor.ts`**
  - Adicionar ramo transacional para `isRefundedEvent(event)` que localiza a cotação e atualiza comissões, vendas e cotação de forma atômica.
- [ ] **Step 4: Executar teste e validar sucesso**
- [ ] **Step 5: Commit**
  - `git commit -m "fix(financeiro): estorno de comissoes e cancelamento de apolices em webhooks refunded"`

### Task 1.2: Eliminar Descarte Prematuro com `processed = true` no Webhook do Asaas
**Arquivos:**
- Modificar: `app/api/webhook/asaas/route.ts`
- Modificar: `src/lib/webhook-processor.ts`
- Teste: `tests/unit/asaas-webhook-no-premature-discard.test.ts`

- [ ] **Step 1: Escrever teste falhando para pagamentos recebidos sem cotação imediata**
  - Verificar que eventos `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` que não localizam a cotação retornam status de erro temporário (HTTP 422/500) e NÃO gravam `processed = true`, permitindo retry do Asaas.
- [ ] **Step 2: Implementar correção em `app/api/webhook/asaas/route.ts`**
- [ ] **Step 3: Executar teste e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(webhook): impedir processed=true prematuro em pagamentos sem cotacao imediata"`

### Task 1.3: Parser Universal de Vigência (`DD/MM/YYYY` e `YYYY-MM-DD`) em `insurance-ops.ts`
**Arquivos:**
- Modificar: `src/lib/insurance-ops.ts`
- Teste: `tests/unit/insurance-ops-vigencia.test.ts`

- [ ] **Step 1: Escrever teste unitário para parsing de datas**
  - Testar `parseVigenciaDate` com `15/12/2026`, `2026-12-15`, string vazia, null.
- [ ] **Step 2: Implementar `parseVigenciaDate` em `src/lib/insurance-ops.ts`**
- [ ] **Step 3: Executar teste e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(seguros): suportar formato brasileiro DD/MM/YYYY na data de vigencia de apolices"`

---

## Bloco 2: Segurança, Privacidade (LGPD) e Links White-Label

### Task 2.1: Bloquear Upload de SVG com Stored XSS em Logotipo
**Arquivos:**
- Modificar: `app/api/portal/perfil/logo/route.ts`
- Teste: `tests/unit/portal-logo-security.test.ts`

- [ ] **Step 1: Escrever teste falhando que tenta enviar arquivo SVG e espera rejeição 400**
- [ ] **Step 2: Remover `image/svg+xml` dos tipos permitidos em `app/api/portal/perfil/logo/route.ts`**
- [ ] **Step 3: Validar que PNG, JPEG e WebP continuam funcionando**
- [ ] **Step 4: Commit**
  - `git commit -m "security(perfil): bloquear upload de svg para prevencao de stored xss"`

### Task 2.2: Remover Vazamento de CPF/Nome em Rota Pública de Contratação
**Arquivos:**
- Modificar: `app/api/public/contratacao/[token]/route.ts`
- Teste: `tests/unit/public-contratacao-privacy.test.ts`

- [ ] **Step 1: Escrever teste unitário conferindo que `GET /api/public/contratacao/[token]` não expõe `targetDocument` nem `targetName`**
- [ ] **Step 2: Ajustar resposta da API para retornar apenas `isExclusive: Boolean(link.is_exclusive)`**
- [ ] **Step 3: Executar testes e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "security(public): remover exposicao de CPF e nome em rota publica de contratacao"`

### Task 2.3: Reserva Atômica no Banco contra Race Condition em Links Exclusivos (`max_uses`)
**Arquivos:**
- Modificar: `app/api/cotacoes/route.ts`
- Teste: `tests/unit/exclusive-links-atomic.test.ts`

- [ ] **Step 1: Escrever teste de corrida concorrente com `max_uses = 1`**
- [ ] **Step 2: Implementar `UPDATE public_sale_links SET used_count = used_count + 1 WHERE ... used_count < max_uses RETURNING id`**
- [ ] **Step 3: Rejeitar a 2ª requisição concorrente com 404/422 se o UPDATE retornar 0 linhas**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(links): incremento atomico condicional de uso prevenindo race condition em links exclusivos"`

---

## Bloco 3: Regras de Negócio, Duplicidade Cadastral e Contratos

### Task 3.1: Bloquear Faturas Asaas para Propostas com Duplicidade Cadastral Pendente
**Arquivos:**
- Modificar: `src/lib/asaas-service.ts`
- Modificar: `app/api/portal/cotacoes/[id]/enviar-fatura-email/route.ts`
- Teste: `tests/unit/duplicidade-fatura-blocking.test.ts`

- [ ] **Step 1: Escrever teste verificando rejeição com erro descritivo ao tentar gerar pagamento para cotação em `pendente_duplicidade`**
- [ ] **Step 2: Adicionar trava estrita em `executeGenerateAsaasPayment` e no endpoint `enviar-fatura-email`**
- [ ] **Step 3: Executar testes e validar aprovação**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(duplicidade): bloquear estritamente emissao de faturas para propostas com duplicidade pendente"`

### Task 3.2: Proteção do Cadastro Mestre em `USAR_NOVOS`
**Arquivos:**
- Modificar: `app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts`
- Teste: `tests/unit/resolver-duplicidade-protecao-mestre.test.ts`

- [ ] **Step 1: Escrever teste verificando que se o cliente mestre possuir apólices ativas em `sales`, `USAR_NOVOS` bloqueia a sobrescrita direta de `insurance_clients`**
- [ ] **Step 2: Implementar verificação e encapsulamento em transação atômica (`sql.begin`)**
- [ ] **Step 3: Executar testes e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(duplicidade): proteger cadastro mestre de cliente com apolices ativas contra sobrescrita indevida"`

### Task 3.3: Inclusão de `pendente_duplicidade` na Matriz de Status SQL
**Arquivos:**
- Modificar: `src/lib/status-matrix.ts`
- Teste: `tests/unit/status-matrix-duplicidade.test.ts`

- [ ] **Step 1: Escrever teste verificando que cotação em `pendente_duplicidade` gera status geral `'Pendente de Assinatura'` e status pagamento `'Falta Assinatura'` na query SQL**
- [ ] **Step 2: Ajustar `buildStatusMatrixSqlExpressions()` e `getCotacaoMatrixFilterSql()`**
- [ ] **Step 3: Executar testes e validar aprovação**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(status-matrix): integrar pendente_duplicidade na matriz de status SQL eliminando registros fantasmas"`

### Task 3.4: Sanitização HTML de Proponentes no Gotenberg Chromium
**Arquivos:**
- Modificar: `src/lib/gotenberg-contract-generator.ts`
- Teste: `tests/unit/gotenberg-sanitization.test.ts`

- [ ] **Step 1: Escrever teste verificando escape de `<`, `>`, `&`, `"` em nomes e endereços**
- [ ] **Step 2: Aplicar `escapeHtml()` em todas as variáveis interpoladas do HTML A4**
- [ ] **Step 3: Executar testes e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(gotenberg): aplicar escapeHtml em variaveis de proponentes no gerador de contratos A4"`

---

## Bloco 4: Front-end, UX, Mobile e Referral

### Task 4.1: Resiliência da Máscara de Celular em Autofill Mobile (+55)
**Arquivos:**
- Modificar: `src/components/modals/masks.ts`
- Teste: `tests/unit/masks-phone-autofill.test.ts`

- [ ] **Step 1: Escrever teste unitário para `maskPhone('+5547996486081')` esperando `(47) 99648-6081`**
- [ ] **Step 2: Ajustar `cleanDigits` ou `maskPhone` para remover o prefixo `55` quando o comprimento for 12 ou 13 dígitos**
- [ ] **Step 3: Executar teste e validar sucesso**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(masks): tratar autofill com prefixo +55 na mascara de telefone sem truncar digitos"`

### Task 4.2: Resolução da Colisão Visual entre WhatsApp Flutuante e Banner de Indicação no Mobile
**Arquivos:**
- Modificar: `src/components/site/FloatingWhatsApp.tsx`
- Modificar: `src/components/site/ReferralBanner.tsx`

- [ ] **Step 1: Adicionar classe ou estado que eleve verticalmente o botão do WhatsApp (`bottom-36 md:bottom-6`) enquanto o banner de indicação estiver visível no mobile**
- [ ] **Step 2: Commit**
  - `git commit -m "fix(ui): resolver sobreposicao visual entre WhatsApp flutuante e banner de indicacao no mobile"`

### Task 4.3: Sincronização do Parceiro no WhatsApp em Rotas Internas via `ReferralTracker`
**Arquivos:**
- Modificar: `src/components/public/ReferralTracker.tsx`
- Teste: `tests/unit/referral-tracker-global.test.ts`

- [ ] **Step 1: Escrever teste validando que `ReferralTracker` grava os dados do parceiro e emite o evento `duolife:referral` em qualquer rota com `?ref=`**
- [ ] **Step 2: Implementar gravação em `sessionStorage` e emissão do evento no layout**
- [ ] **Step 3: Executar testes e validar aprovação**
- [ ] **Step 4: Commit**
  - `git commit -m "fix(referral): sincronizar contexto do parceiro no WhatsApp em qualquer rota interna da plataforma"`

---

## Verificação Final

- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm test` / `npx vitest run` passando 100% de todos os testes unitários
- [ ] Atualização da memória global em `~/Desktop/ORACULO/MEMORY.md`
