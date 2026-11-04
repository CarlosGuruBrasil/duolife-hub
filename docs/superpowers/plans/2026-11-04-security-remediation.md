# Plano de Implementação de Remediação de Cybersegurança e Hardening (VULN-01 até VULN-12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as vulnerabilidades críticas, altas e médias mapeadas na auditoria de segurança (VULN-01 até VULN-12), implementando padrões defensivos (*fail-closed*, isolamento trans-tenant rigoroso, prevenção de TOCTOU, RBAC estrito, anti-XSS e rate limiting).

**Architecture:** Abordagem de defesa em profundidade (Defense-in-Depth) em Next.js 15/16 App Router com TypeScript estrito, PostgreSQL (`postgres.js`), módulos de autorização (`src/lib/auth.ts`, `src/lib/roles.ts`, `src/lib/access.ts`), validação criptográfica timing-safe e middlewares defensivos de rate-limiting.

**Tech Stack:** Next.js 15/16 App Router, TypeScript, Vitest, Node.js `crypto`, PostgreSQL, Tailwind.

**Spec:** Relatório Consolidado de Pentest White-Box e Achados de Segurança (VULN-01 a VULN-12).

---

## Global Constraints

- Todas as respostas e comentários novos em código devem estar em Português Brasileiro e codificados em UTF-8.
- Nenhuma dependência externa insegura ou atalhos frágeis (`any`, `as unknown as any`) podem ser introduzidos.
- Todo endpoint de webhook ou serviço crítico deve adotar estritamente o padrão *Fail-Closed*.
- Nenhum dado pessoal identificável (PII) de clientes de um tenant pode ser retornado em texto claro para usuários de outro tenant.
- Todos os testes unitários devem ser executados com `npx vitest run <caminho>` e passar 100% sem regressões.

---

## Review Focus

1. **Webhook ZapSign sem secret:** Requisições quando `ZAPSIGN_WEBHOOK_SECRET` estiver vazio devem ser rejeitadas com 401/500, nunca aceitas.
2. **Conflito Cadastral entre Corretoras:** A API nunca deve retornar dados pessoais reais (nome, e-mail, telefone, endereço) de cliente pré-existente para outro corretor no snapshot de divergência.
3. **Esgotamento de Cupom:** Se a concorrência esgotar o cupom, `gerar-contrato` deve retornar HTTP 409 e abortar imediatamente, sem emitir contrato com preço descontado.
4. **Elevação de Privilégio `corretora_staff`:** Operadores com perfil `corretora_staff` não devem ter acesso a gerenciar equipe, redefinir senhas de diretores ou suspender parceiros.
5. **Denial of Service no CEP:** O endpoint `/api/cep/[cep]` deve rejeitar requisições excedentes via rate limit e retornar respostas cacheadas para CEPs idênticos.

---

### Task 1: Blindagem de Autenticação e Webhooks Fail-Closed (VULN-01, VULN-04)

**Files:**
- Modify: `app/api/webhook/zapsign/route.ts`
- Modify: `app/api/admin/contratos/render-pdf/route.ts`
- Test: `tests/unit/security-auth-webhooks.test.ts`

**Interfaces:**
- Consumes: `process.env.ZAPSIGN_WEBHOOK_SECRET`, `process.env.INTERNAL_SERVICE_KEY`, `crypto.timingSafeEqual`
- Produces: `isAuthorized(req: Request): boolean` com padrão fail-closed; autorização estrita em `render-pdf`.

- [ ] **Step 1: Escrever teste unitário reproduzindo as falhas de autenticação**
  Criar `tests/unit/security-auth-webhooks.test.ts` testando:
  - Webhook ZapSign sem secret configurado retorna 401 (não true).
  - Webhook ZapSign com secret incorreto retorna 401.
  - Webhook ZapSign com token válido via timingSafeEqual retorna autorizado.
  - `render-pdf` rejeita `JWT_SECRET` como bearer token e rejeita `x-dev-test` fora de mock de teste.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-auth-webhooks.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar correções em `app/api/webhook/zapsign/route.ts` e `app/api/admin/contratos/render-pdf/route.ts`**
  - Em `zapsign/route.ts`: se `!secret`, logar erro crítico e retornar `false` (Fail-Closed). Usar `crypto.timingSafeEqual`.
  - Em `render-pdf/route.ts`: remover fallback para `process.env.JWT_SECRET`. Exigir `INTERNAL_SERVICE_KEY` e comparar via `timingSafeEqual`. Remover `x-dev-test` ou restringir estritamente a `process.env.VITEST === 'true'`.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-auth-webhooks.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit das correções de autenticação**
  ```bash
  git add app/api/webhook/zapsign/route.ts app/api/admin/contratos/render-pdf/route.ts tests/unit/security-auth-webhooks.test.ts
  git commit -m "fix(security): aplicar fail-closed no webhook zapsign e isolar segredos de servico em render-pdf"
  ```

---

### Task 2: Blindagem Trans-Tenant, LGPD e PII em Conflitos Cadastrais (VULN-02)

**Files:**
- Modify: `src/lib/insurance-ops.ts`
- Modify: `app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts`
- Test: `tests/unit/security-cadastral-conflict.test.ts`

**Interfaces:**
- Consumes: `handleClientRegistrationIntegrity`, `CadastralConflictSnapshot`
- Produces: Snapshot sanitizado sem dados brutos de terceiros; bloqueio trans-tenant na rota `/resolver-duplicidade`.

- [ ] **Step 1: Escrever teste unitário reproduzindo vazamento de PII e sobrescrita trans-tenant**
  Criar `tests/unit/security-cadastral-conflict.test.ts` testando:
  - `handleClientRegistrationIntegrity` não inclui `originalData` com telefone/email/endereço completos de outro tenant, mascarando ou fornecendo apenas chaves divergentes.
  - `resolver-duplicidade` rejeita a opção `USAR_NOVOS` com HTTP 403 se o cliente pertencer ou possuir vínculo com outra corretora.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-cadastral-conflict.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar sanitização de PII e bloqueio trans-tenant**
  - Em `src/lib/insurance-ops.ts`: mascarar dados em `CadastralConflictSnapshot` (ex: `j***@email.com`, `(11) 9****-1234`) e omitir `metadata` completa de clientes alheios.
  - Em `resolver-duplicidade/route.ts`: adicionar checagem SQL garantindo que o cliente não possui vínculo comercial com corretora distinta antes de aplicar `USAR_NOVOS`.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-cadastral-conflict.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit da proteção LGPD e trans-tenant**
  ```bash
  git add src/lib/insurance-ops.ts app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts tests/unit/security-cadastral-conflict.test.ts
  git commit -m "fix(security): mascarar PII em conflito cadastral e bloquear sobrescrita trans-tenant de clientes"
  ```

---

### Task 3: Trava Atômica e Interrupção na Evasão de Cupons Promocionais (VULN-03)

**Files:**
- Modify: `app/api/portal/cotacoes/[id]/gerar-contrato/route.ts`
- Modify: `src/lib/asaas-service.ts`
- Test: `tests/unit/security-cupons.test.ts`

**Interfaces:**
- Consumes: `cupom_usos`, `calcularPrecoServidor`
- Produces: Aborto com HTTP 409 caso cupom esteja esgotado; desacoplamento entre cupom e desconto manual no Asaas.

- [ ] **Step 1: Escrever teste unitário para esgotamento de cupom**
  Criar `tests/unit/security-cupons.test.ts` testando:
  - Rejeição de emissão de contrato quando `cupom_usos` atinge o limite (`HTTP 409`).
  - `asaas-service.ts` não aplica desconto de cupom revogado/esgotado como desconto manual genérico.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-cupons.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar trava de cupom e correção no Asaas**
  - Em `app/api/portal/cotacoes/[id]/gerar-contrato/route.ts`: se `!resultado` no incremento de cupom, retornar `NextResponse.json({ error: 'Cupom promocional esgotado ou limite de utilização atingido.' }, { status: 409 })`.
  - Em `src/lib/asaas-service.ts`: não repassar `clientData.descontoPercentual` como `descontoManualPercent` caso o cupom não seja mais válido.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-cupons.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit da proteção de cupons e precificação**
  ```bash
  git add app/api/portal/cotacoes/[id]/gerar-contrato/route.ts src/lib/asaas-service.ts tests/unit/security-cupons.test.ts
  git commit -m "fix(security): travar emissao de contrato com cupom esgotado (409) e desacoplar descontos no asaas"
  ```

---

### Task 4: Segregação de Funções de `corretora_staff` e Proteção de Equipe (VULN-05)

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `app/api/portal/equipe/[id]/route.ts`
- Modify: `app/api/portal/equipe/route.ts`
- Test: `tests/unit/security-roles-rbac.test.ts`

**Interfaces:**
- Consumes: `canManageTeam(user: AuthUser)`, `canManageCorretoraWide(user: AuthUser)`
- Produces: Restrição estrita de gestão a `corretora_admin` e `corretora_manager`, impedindo elevação vertical por `corretora_staff`.

- [ ] **Step 1: Escrever teste unitário de permissões de `corretora_staff`**
  Criar `tests/unit/security-roles-rbac.test.ts` testando:
  - `canManageTeam` e `canManageCorretoraWide` retornam `false` para `role === 'corretora_staff'`.
  - `corretora_staff` não consegue alterar senha nem cargo de diretores/gerentes.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-roles-rbac.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar restrições de permissão**
  - Em `src/lib/auth.ts`: atualizar `canManageTeam` e `canManageCorretoraWide` para aceitar apenas `corretora_admin` e `corretora_manager` (excluindo `corretora_staff`).
  - Em `app/api/portal/equipe/[id]/route.ts` e `equipe/route.ts`: reforçar checagens impedindo operadores operacionais de criarem ou alterarem diretores/parceiros.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-roles-rbac.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit do ajuste de RBAC**
  ```bash
  git add src/lib/auth.ts app/api/portal/equipe/[id]/route.ts app/api/portal/equipe/route.ts tests/unit/security-roles-rbac.test.ts
  git commit -m "fix(security): segregar permissoes de corretora_staff impedindo elevacao de privilegios"
  ```

---

### Task 5: Validação de Autorização para Desconto Manual Comercial (VULN-06)

**Files:**
- Modify: `app/api/cotacoes/route.ts`
- Modify: `app/api/cotacoes/[id]/route.ts`
- Test: `tests/unit/security-pricing-discount.test.ts`

**Interfaces:**
- Consumes: `user.role`, `user.partnerRole`, `descontoManualPercent`
- Produces: Rejeição ou anulação de desconto manual arbitrário injetado por corretores/vendedores sem papel de liderança.

- [ ] **Step 1: Escrever teste unitário para controle de desconto manual**
  Criar `tests/unit/security-pricing-discount.test.ts` testando:
  - Corretor com `role === 'partner_broker'` enviando `descontoManualPercent: 30` tem o desconto recusado/zerado.
  - Administrador ou Diretor enviando desconto manual autorizado tem o desconto processado normalmente.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-pricing-discount.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar validação de papel para desconto manual**
  - Em `app/api/cotacoes/route.ts` e `app/api/cotacoes/[id]/route.ts`: se `descontoManualPercent > 0`, verificar se o usuário é `isInternalUser` ou possui cargo de diretoria/administração (`corretora_admin`, `corretora_manager`, ou `director`). Caso contrário, forçar `effectiveDescontoPercent = 0` ou retornar 403 se for forjado intencionalmente.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-pricing-discount.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit do controle de desconto manual**
  ```bash
  git add app/api/cotacoes/route.ts app/api/cotacoes/[id]/route.ts tests/unit/security-pricing-discount.test.ts
  git commit -m "fix(security): bloquear aplicacao de desconto manual sem perfil de gestao/diretoria"
  ```

---

### Task 6: Proteção contra Stored XSS e Validação de Documentos Anexos (VULN-07)

**Files:**
- Modify: `app/api/admin/corretoras/route.ts`
- Modify: `app/api/admin/corretoras/[id]/documento/[tipo]/route.ts`
- Test: `tests/unit/security-documents.test.ts`

**Interfaces:**
- Consumes: MIME type validation, HTTP Security Headers
- Produces: Allowlist estrita (`application/pdf`, `image/png`, `image/jpeg`), CSP seguro e download seguro.

- [ ] **Step 1: Escrever teste unitário para upload e download de documentos**
  Criar `tests/unit/security-documents.test.ts` testando:
  - Rejeição de uploads com MIME types perigosos (`text/html`, `image/svg+xml`, `application/javascript`).
  - No download, presença dos cabeçalhos `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'`.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-documents.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar validação de MIME type e headers de segurança**
  - Em `admin/corretoras/route.ts`: validar se o MIME type pertence a `ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']`.
  - Em `admin/corretoras/[id]/documento/[tipo]/route.ts`: adicionar cabeçalhos de proteção contra XSS (`Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options: nosniff`) e `Content-Disposition: attachment` para formatos não-PDF.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-documents.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit da proteção de documentos e anti-XSS**
  ```bash
  git add app/api/admin/corretoras/route.ts app/api/admin/corretoras/[id]/documento/[tipo]/route.ts tests/unit/security-documents.test.ts
  git commit -m "fix(security): validar mime types de documentos e blindar download contra stored xss"
  ```

---

### Task 7: Isolamento Horizontal de Comissões e Vendas (VULN-08)

**Files:**
- Modify: `app/api/comissoes/route.ts`
- Modify: `app/api/vendas/route.ts`
- Test: `tests/unit/security-commissions-isolation.test.ts`

**Interfaces:**
- Consumes: `access.visibleUserIds`
- Produces: Filtro estrito de vendas por corretor sem vazamento de vendas institucionais (`c.partner_user_id IS NULL`).

- [ ] **Step 1: Escrever teste unitário para consulta de comissões/vendas**
  Criar `tests/unit/security-commissions-isolation.test.ts` testando:
  - Corretor com `visibleUserIds = ['user_123']` não recebe registros onde `partner_user_id IS NULL`.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-commissions-isolation.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Ajustar cláusula SQL nas rotas de comissões e vendas**
  - Em `app/api/comissoes/route.ts` e `app/api/vendas/route.ts`: remover o predicado `OR c.partner_user_id IS NULL` quando `access.visibleUserIds` estiver definido (subordinados).

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-commissions-isolation.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit do isolamento de vendas e comissões**
  ```bash
  git add app/api/comissoes/route.ts app/api/vendas/route.ts tests/unit/security-commissions-isolation.test.ts
  git commit -m "fix(security): isolar comissoes e vendas institucionais para corretores subordinados"
  ```

---

### Task 8: Rate Limiting e Cache de CEP e Endpoints Públicos (VULN-09)

**Files:**
- Modify: `app/api/cep/[cep]/route.ts`
- Modify: `app/api/public/contratacao/[token]/route.ts`
- Modify: `app/api/public/referral/route.ts`
- Test: `tests/unit/security-rate-limiting.test.ts`

**Interfaces:**
- Consumes: `rateLimit(key, limit, windowMs)`
- Produces: Proteção contra flooding/DoS e cache in-memory de CEPs.

- [ ] **Step 1: Escrever teste unitário de rate limit e cache**
  Criar `tests/unit/security-rate-limiting.test.ts` testando:
  - Bloqueio após exceder limite de requisições por IP no endpoint de CEP (retornando HTTP 429).
  - Consulta repetida de mesmo CEP responde a partir do cache sem chamar provedores externos.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-rate-limiting.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar rate limiting e cache**
  - Em `app/api/cep/[cep]/route.ts`: adicionar limitação de 30 req/min por IP e cache in-memory de CEPs válidos com TTL de 24 horas.
  - Em `app/api/public/contratacao/[token]/route.ts` e `referral/route.ts`: adicionar rate limit de 60 req/min por IP.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-rate-limiting.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit do rate limiting e cache**
  ```bash
  git add app/api/cep/[cep]/route.ts app/api/public/contratacao/[token]/route.ts app/api/public/referral/route.ts tests/unit/security-rate-limiting.test.ts
  git commit -m "fix(security): aplicar rate limiting e cache de cep para mitigacao de dos"
  ```

---

### Task 9: Isolamento Multi-Tenant MCP e Limpeza de Backdoor de Teste Estático (VULN-10)

**Files:**
- Modify: `src/lib/mcp/security.ts`
- Modify: `src/lib/wix-integration-auth.ts`
- Modify: `src/lib/mcp/services/sales-service.ts`
- Test: `tests/unit/security-mcp.test.ts`

**Interfaces:**
- Consumes: Validação de escopos e chaves MCP
- Produces: Remoção de credenciais estáticas de código e vinculação de tenant em operações MCP.

- [ ] **Step 1: Escrever teste unitário para segurança MCP**
  Criar `tests/unit/security-mcp.test.ts` testando:
  - Rejeição da credencial hardcoded `dlmcp_live_dev_test_key_001_secret` quando não estiver rodando sob suite Vitest explícita.
  - Validação de que ferramentas MCP requerem contexto de tenant válido.

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-mcp.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Remover tokens hardcoded e ajustar validação**
  - Em `src/lib/mcp/security.ts` e `src/lib/wix-integration-auth.ts`: restringir tokens de teste exclusivamente a `process.env.VITEST === 'true'`, eliminando o fallback genérico `NODE_ENV !== 'production'`.
  - Em `src/lib/mcp/services/sales-service.ts`: checar se a chave autenticada possui contexto de inquilino.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-mcp.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit das correções MCP e credenciais estáticas**
  ```bash
  git add src/lib/mcp/security.ts src/lib/wix-integration-auth.ts src/lib/mcp/services/sales-service.ts tests/unit/security-mcp.test.ts
  git commit -m "fix(security): expurgar backdoors estaticos fora de testes e endurecer tenant mcp"
  ```

---

### Task 10: Mitigação de IP Spoofing e Sanitização de Erros HTTP 500 (VULN-11, VULN-12)

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/forgot-password/route.ts`
- Modify: `app/api/admin/cotacoes/[id]/gerar-cobranca/route.ts`
- Modify: `app/api/admin/cotacoes/[id]/cobranca/route.ts`
- Test: `tests/unit/security-error-handling.test.ts`

**Interfaces:**
- Consumes: Extração segura de IP do cliente, tratamento de exceções
- Produces: Resolução de IP à prova de spoofing e respostas de erro 500 opacas para o cliente.

- [ ] **Step 1: Escrever teste unitário para extração de IP e sanitização de erro**
  Criar `tests/unit/security-error-handling.test.ts` testando:
  - Priorização de `cf-connecting-ip` e `x-real-ip` sobre `x-forwarded-for` forjado.
  - Respostas HTTP 500 não expõem detalhes de banco ou stack traces (`err.message`).

- [ ] **Step 2: Executar teste para verificar que falha**
  Executar: `npx vitest run tests/unit/security-error-handling.test.ts`
  Resultado esperado: FAIL.

- [ ] **Step 3: Implementar extração segura de IP e sanitização de mensagens**
  - Em `src/lib/rate-limit.ts` e rotas de autenticação: criar função auxiliar `getClientIp(req)` que prioriza cabeçalhos validados de proxy reverso (`cf-connecting-ip`, `x-real-ip`).
  - Em rotas administrativas que retornavam `err.message`: retornar mensagem genérica segura (ex: `'Erro interno ao processar operação'`), mantendo `logger.error` completo apenas nos logs internos.

- [ ] **Step 4: Executar teste para verificar que passa**
  Executar: `npx vitest run tests/unit/security-error-handling.test.ts`
  Resultado esperado: PASS.

- [ ] **Step 5: Commit de mitigação de IP spoofing e sanitização**
  ```bash
  git add src/lib/rate-limit.ts app/api/auth/login/route.ts app/api/auth/forgot-password/route.ts app/api/admin/cotacoes/[id]/gerar-cobranca/route.ts app/api/admin/cotacoes/[id]/cobranca/route.ts tests/unit/security-error-handling.test.ts
  git commit -m "fix(security): mitigar ip spoofing em rate limiting e sanitizar mensagens de erro 500"
  ```
