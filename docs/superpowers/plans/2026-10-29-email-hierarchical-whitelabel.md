# Templates de E-mail com White-Label Hierárquico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar herança hierárquica White-Label (Parceiro -> Corretora Mãe -> DuoLife) nos e-mails transacionais enviados aos clientes (`proposta_criada`, `cotacao_gerada`, `fatura_gerada`, `pagamento_confirmado` e `boas_vindas`), incluindo cabeçalhos e botões com branding dinâmico, identificação de remetente (`From: "${empresa_nome} via DuoLife"`) e `Reply-To` direto para o e-mail do consultor/corretora.

**Architecture:** 
1. Criar função de resolução de White-Label assíncrona (`resolveWhiteLabelForContext` e `resolveWhiteLabelForPartner`) que busca `partners` + `corretoras` e aplica `resolveHierarchicalWhiteLabel`.
2. Estender `SendMailOptions` em `src/lib/mailer.ts` e `net4life-service.ts` para suportar `fromName` e `replyTo`.
3. Estender `SendTemplatedEmailOptions` e `normalizeEmailVariables` em `src/lib/email-service.ts` para tratar aliases de branding e injetar fallbacks (`empresa_nome`, `logo_url`, `cor_primaria`, `cor_destaque`, `whitelabel_header_html`, `whitelabel_footer_html`).
4. Atualizar os templates de e-mail padrão do sistema em `DEFAULT_TEMPLATES` com layout dinâmico responsivo e acessível.
5. Atualizar o despachante de gatilhos `src/lib/triggers/dispatcher.ts` e a rota `app/api/portal/cotacoes/[id]/enviar-proposta-email/route.ts` para resolver e injetar o White-Label hierárquico nos disparos automáticos e manuais.

**Tech Stack:** TypeScript, Next.js (App Router), Postgres.js, Nodemailer, Vitest.

---

## Global Constraints
- Todas as respostas em português brasileiro.
- Todos os arquivos codificados estritamente em UTF-8.
- Estilo visual de e-mails em HTML inline compatível com clientes móveis e desktop (Mobile-First, contraste de cores adequado, botões com altura mínima de 44px).
- Nenhuma regressão nos testes existentes (22 arquivos / 268 testes).
- Build de produção (`npm run build`) e `npx tsc --noEmit` devem passar com zero erros.

## Review Focus
1. Parceiro sem corretora vinculada e sem branding personalizado: deve fazer fallback transparente para os dados institucionais padrão da DuoLife.
2. Parceiro sem branding, mas vinculado a corretora mãe com branding: deve herdar o logotipo, cores e slogan da corretora mãe no e-mail.
3. Parceiro com branding próprio vinculado a corretora mãe: o branding do parceiro tem precedência sobre a corretora mãe.
4. Cabeçalho `Reply-To` e nome `From`: devem ser sanitizados para evitar injeção de quebras de linha em cabeçalhos SMTP (`\r\n`).
5. Renderização em clientes de e-mail que bloqueiam imagens: o cabeçalho deve exibir texto alternativo estilizado caso `logo_url` não possa ser baixada.

---

### Task 1: Módulo de Resolução de White-Label para Contexto de Notificações
**Files:**
- Create: `src/lib/email-whitelabel.ts`
- Test: `tests/unit/email-whitelabel.test.ts`

- [x] **Step 1.1:** Criar teste unitário `tests/unit/email-whitelabel.test.ts` cobrindo:
  - Resolução para contexto sem parceiro (retorna defaults DuoLife).
  - Resolução para parceiro com corretora mãe (herança hierárquica).
  - Geração de variáveis de branding (`empresa_nome`, `logo_url`, `cor_primaria`, `cor_destaque`, `from_name`, `reply_to`, `whitelabel_header_html`, `whitelabel_footer_html`).
- [x] **Step 1.2:** Executar o teste e verificar a falha esperada (`file not found`).
- [x] **Step 1.3:** Implementar `src/lib/email-whitelabel.ts` exportando `resolveWhiteLabelForContext`, `resolveWhiteLabelForPartnerId` e `buildEmailWhiteLabelVariables`.
- [x] **Step 1.4:** Reexecutar os testes unitários e garantir 100% de aprovação.

---

### Task 2: Suporte a `fromName` e `replyTo` no Mailer e Net4Life Service
**Files:**
- Modify: `src/lib/mailer.ts`
- Modify: `src/lib/net4life-service.ts`
- Test: `tests/unit/mailer-headers.test.ts`

- [ ] **Step 2.1:** Criar teste unitário `tests/unit/mailer-headers.test.ts` testando o repasse correto de `fromName` e `replyTo` em Nodemailer e no modo Mock.
- [ ] **Step 2.2:** Atualizar a interface `SendMailOptions` em `src/lib/mailer.ts` e tratar `fromName` na montagem do campo `from` e inclusão de `replyTo`.
- [ ] **Step 2.3:** Atualizar `Net4LifeSendEmailOptions` e payload em `src/lib/net4life-service.ts` para repassar `fromName` e `replyTo`.
- [ ] **Step 2.4:** Executar o teste e validar o funcionamento.

---

### Task 3: Normalização de Variáveis e Templates Padrão no `email-service.ts`
**Files:**
- Modify: `src/lib/email-service.ts`
- Test: `tests/unit/email-service-whitelabel.test.ts`

- [x] **Step 3.1:** Criar teste `tests/unit/email-service-whitelabel.test.ts` validando a normalização de aliases de White-Label em `normalizeEmailVariables` e a renderização nos templates transacionais (`proposta_criada`, `cotacao_gerada`, `fatura_gerada`, `pagamento_confirmado`, `boas_vindas`).
- [x] **Step 3.2:** Estender `SendTemplatedEmailOptions` em `src/lib/email-service.ts` com `fromName?: string` e `replyTo?: string`.
- [x] **Step 3.3:** Atualizar `DEFAULT_TEMPLATES` no `src/lib/email-service.ts` para utilizar as variáveis dinâmicas de branding: `{{cor_primaria|#0e4a5a}}`, `{{cor_destaque|#00d4e0}}`, `{{whitelabel_header_html}}` e `{{whitelabel_footer_html}}`.
- [x] **Step 3.4:** Rodar o teste e validar renderização limpa.

---

### Task 4: Injeção de White-Label no Dispatcher e Rotas de Disparo Manual
**Files:**
- Modify: `src/lib/triggers/dispatcher.ts`
- Modify: `app/api/portal/cotacoes/[id]/enviar-proposta-email/route.ts`
- Modify: `app/api/portal/cotacoes/[id]/enviar-fatura-email/route.ts`
- Test: `tests/unit/dispatcher-whitelabel.test.ts`

- [x] **Step 4.1:** Criar teste unitário `tests/unit/dispatcher-whitelabel.test.ts` validando que ao disparar `PROPOSTA_CRIADA` ou `FATURA_GERADA` com contexto de parceiro, as variáveis de White-Label são enriquecidas e passadas para `sendTemplatedEmail`.
- [x] **Step 4.2:** Integrar `resolveWhiteLabelForContext` em `src/lib/triggers/dispatcher.ts` antes de enviar os e-mails da árvore de decisão.
- [x] **Step 4.3:** Atualizar `enviar-proposta-email/route.ts` e `enviar-fatura-email/route.ts` para carregar o branding hierárquico nos disparos manuais do portal.
- [x] **Step 4.4:** Validar testes unitários do despachante.

---

### Task 5: Verificação de Regressão, TypeScript e Build
**Files:**
- Run: `npm test`
- Run: `npx tsc --noEmit`
- Run: `npm run build`
- Modify: `~/Desktop/ORACULO/MEMORY.md`

- [ ] **Step 5.1:** Executar suite completa do Vitest (`npm test`) garantindo 100% de sucesso.
- [ ] **Step 5.2:** Executar typecheck (`npx tsc --noEmit`) assegurando zero erros.
- [ ] **Step 5.3:** Executar `npm run build` garantindo geração correta de todas as rotas.
- [ ] **Step 5.4:** Atualizar o registro no arquivo `~/Desktop/ORACULO/MEMORY.md`.
