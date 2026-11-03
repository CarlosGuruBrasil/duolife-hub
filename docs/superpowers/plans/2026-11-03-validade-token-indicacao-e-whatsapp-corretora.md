# Validade do Token de Indicação (24h/Customizável) e WhatsApp da Corretora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o controle de expiração temporal configurável (padrão 24h, ajustável em horas ou dias pelo Administrador no Painel Admin) para links e tokens de indicação de corretores/vendedores, fazendo com que o modal da corretora e a mensagem personalizada do WhatsApp fiquem ativos somente dentro do prazo, revertendo automaticamente para o padrão DuoLife após a expiração.

**Architecture:**
- Persistência das chaves `REFERRAL_TOKEN_EXPIRATION_VALUE` e `REFERRAL_TOKEN_EXPIRATION_UNIT` na tabela `system_settings` gerenciada por `src/lib/system-settings.ts`, com fallback canônico de 24 horas (`86400` segundos).
- Exposição e edição no Painel Administrativo (`/admin/chaves-api` e `app/api/admin/chaves-api`), permitindo que administradores (`duolife_admin` e `duolife_dev`) configurem o valor e a unidade ('hours' | 'days').
- Adaptação do endpoint `GET /api/public/referral` para emitir o cookie `duolife_ref` com `maxAge` calculado dinamicamente pelo TTL configurado e retornar `ttlSeconds` e metadados no payload.
- Criação de componente reativo `FloatingWhatsApp.tsx` e sincronização de estado com `ReferralBanner.tsx`: se houver indicação ativa, o WhatsApp utiliza o texto contextualizado com o nome da corretora parceira; se o token expirar, reverte instantaneamente para o texto padrão da DuoLife e o modal da corretora é ocultado.
- Proteção de expiração em `app/contratar/page.tsx` e `ReferralTracker.tsx` para evitar que cookies expirados causem redirecionamento indevido.

**Tech Stack:** Next.js 16 (App Router), TypeScript, PostgreSQL (`@/lib/pg`), Vitest, Tailwind CSS, Lucide React.

**Spec:** Requisito de usuário para limitação temporal de 24h (configurável no admin em horas ou dias) para permanência do modal de corretora e mensagem de WhatsApp, com reversão para o padrão DuoLife na expiração.

## Global Constraints
- Padrão de respostas e documentação em Português do Brasil (UTF-8).
- Tema claro (Light Mode) obrigatório no painel administrativo e componentes públicos.
- Garantia de 100% dos testes unitários passando (`npx vitest run`) e 0 erros de TypeScript (`npx tsc --noEmit`).
- Seguir o design system canônico do DuoLife Hub.

## Review Focus
1. Falha de expiração no cliente se o relógio local estiver dessincronizado: o cookie `duolife_ref` com `maxAge` nativo do HTTP controla a expiração pelo navegador de forma confiável.
2. Formato da mensagem do WhatsApp quando o parceiro possui apenas nome fantasia ou apenas razão social: sanitização e escape de URL com `encodeURIComponent`.
3. Unidades suportadas: validação estrita para aceitar apenas `'hours'` e `'days'` com inteiros positivos.
4. Permissões de acesso no Painel Administrativo: permitir que administradores de plataforma (`duolife_admin`) além de devs (`duolife_dev`) editem a configuração.
5. Limpeza de rascunhos e fallbacks em `/contratar` ao expirar o cookie de indicação.

---

### Task 1: Parametrização Dinâmica de TTL no Banco e Utilitários (`system_settings`)

**Files:**
- Modify: `src/lib/system-settings.ts`
- Test: `tests/unit/system-settings-referral-ttl.test.ts`

- [ ] **Step 1.1:** Criar teste unitário em `tests/unit/system-settings-referral-ttl.test.ts` cobrindo:
  - Cálculo de TTL padrão (24 horas = 86400 segundos) quando não há registro no banco.
  - Conversão correta de horas para segundos (ex: 12 horas = 43200 segundos).
  - Conversão correta de dias para segundos (ex: 3 dias = 259200 segundos).
  - Tratamento de valores inválidos (negativos, zero, strings não numéricas) com retorno seguro do padrão (24 horas).
- [ ] **Step 1.2:** Executar o teste e verificar a falha inicial (`npx vitest run tests/unit/system-settings-referral-ttl.test.ts`).
- [ ] **Step 1.3:** Implementar em `src/lib/system-settings.ts`:
  - Constantes `DEFAULT_REFERRAL_TOKEN_EXPIRATION_VALUE = 24` e `DEFAULT_REFERRAL_TOKEN_EXPIRATION_UNIT = 'hours'`.
  - Função `getReferralTokenTtlConfig(): Promise<{ value: number; unit: 'hours' | 'days' }>`.
  - Função `getReferralTokenTtlSeconds(): Promise<number>`.
- [ ] **Step 1.4:** Executar os testes e confirmar aprovação.

---

### Task 2: Configuração no Painel Administrativo (`/admin/chaves-api` e API)

**Files:**
- Modify: `app/api/admin/chaves-api/route.ts`
- Modify: `app/admin/chaves-api/_client.tsx`
- Modify: `app/admin/_components/AdminShell.tsx`
- Test: `tests/unit/admin-settings-referral-ttl.test.ts`

- [ ] **Step 2.1:** Criar teste unitário `tests/unit/admin-settings-referral-ttl.test.ts` validando:
  - Leitura das configurações `REFERRAL_TOKEN_EXPIRATION_VALUE` e `REFERRAL_TOKEN_EXPIRATION_UNIT` via GET `/api/admin/chaves-api`.
  - Atualização com sucesso via POST `/api/admin/chaves-api` com validação de limites (valor entre 1 e 720 horas ou 1 e 90 dias).
  - Rejeição de valores inválidos.
- [ ] **Step 2.2:** Atualizar `app/api/admin/chaves-api/route.ts` para incluir a sanitização e validação das chaves `REFERRAL_TOKEN_EXPIRATION_VALUE` e `REFERRAL_TOKEN_EXPIRATION_UNIT`.
- [ ] **Step 2.3:** Ajustar `app/admin/_components/AdminShell.tsx` para exibir "Configurações" para usuários com perfil `roleIsPlatformAdmin(user.role)` (administradores e desenvolvedores).
- [ ] **Step 2.4:** Atualizar `app/admin/chaves-api/_client.tsx` adicionando seção no formulário (ou aba de configurações) com:
  - Input para valor numérico (`REFERRAL_TOKEN_EXPIRATION_VALUE`).
  - Seletor de unidade (`REFERRAL_TOKEN_EXPIRATION_UNIT`: Horas ou Dias).
  - Descrição clara para o administrador.
- [ ] **Step 2.5:** Executar os testes e confirmar aprovação.

---

### Task 3: Enriquecimento da API Pública de Referral (`/api/public/referral`)

**Files:**
- Modify: `app/api/public/referral/route.ts`
- Test: `tests/unit/public-referral.test.ts`

- [ ] **Step 3.1:** Atualizar teste unitário `tests/unit/public-referral.test.ts` para verificar:
  - Emissão de cookie `duolife_ref` com `maxAge` igual a `ttlSeconds` dinâmico do banco (em vez do valor fixo anterior de 30 dias).
  - Presença de `ttlSeconds` no payload retornado em `data.referral.ttlSeconds`.
- [ ] **Step 3.2:** Modificar `app/api/public/referral/route.ts` para invocar `getReferralTokenTtlSeconds()` e definir `maxAge: ttlSeconds` no cookie `duolife_ref`.
- [ ] **Step 3.3:** Executar os testes e garantir que passem com 100% de sucesso.

---

### Task 4: Componente Dinâmico de WhatsApp e Integração com Modal (`ReferralBanner`)

**Files:**
- Create: `src/components/site/FloatingWhatsApp.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `app/page.tsx`
- Modify: `src/components/site/ReferralBanner.tsx`
- Test: `tests/unit/floating-whatsapp.test.tsx`
- Test: `tests/unit/referral-banner.test.tsx`

- [ ] **Step 4.1:** Criar componente cliente `src/components/site/FloatingWhatsApp.tsx`:
  - Lê o estado de indicação ativa (ou escuta evento customizado de referral resolvido).
  - Se houver corretora/parceiro ativo dentro da validade:
    - URL do WhatsApp: `https://wa.me/5547996486081?text=Olá! Gostaria de falar com o time comercial sobre as condições da [Nome da Corretora].`
  - Se não houver ou se o token estiver expirado:
    - URL do WhatsApp padrão DuoLife: `https://wa.me/5547996486081?text=Olá! Gostaria de falar com o time comercial da DuoLife.`
- [ ] **Step 4.2:** Atualizar `src/components/site/ReferralBanner.tsx`:
  - Salva o cookie `duolife_ref` com o `max-age` retornado pela API (`ttlSeconds`).
  - Dispara evento no `window` (ex: `duolife:referral-active` ou atualiza estado compartilhado) com dados do parceiro.
  - Se o cookie não estiver presente ou estiver expirado, não renderiza o modal (`return null`).
  - Ao expirar o tempo, limpa referências no cliente e emite evento de expiração.
- [ ] **Step 4.3:** Em `src/components/layout/Footer.tsx`, substituir o botão fixo estático pelo componente cliente `<FloatingWhatsApp />`.
- [ ] **Step 4.4:** Em `app/page.tsx`, atualizar o botão "Falar no WhatsApp" do Hero para também refletir dinamicamente a mensagem da corretora quando houver indicação ativa.
- [ ] **Step 4.5:** Criar/atualizar testes em `tests/unit/floating-whatsapp.test.tsx` e `tests/unit/referral-banner.test.tsx`.
- [ ] **Step 4.6:** Executar os testes e verificar aprovação.

---

### Task 5: Proteção de Expiração e Redirecionamento em `/contratar`

**Files:**
- Modify: `app/contratar/page.tsx`
- Modify: `src/components/public/ReferralTracker.tsx`
- Test: `tests/unit/contratar-referral-expiration.test.ts`

- [ ] **Step 5.1:** Atualizar `src/components/public/ReferralTracker.tsx` para utilizar o TTL dinâmico ou respeitar a expiração do cookie.
- [ ] **Step 5.2:** Em `app/contratar/page.tsx`, assegurar que ao expirar o cookie `duolife_ref`, o usuário caia no fallback informativo limpo da página `/contratar`, sem redirecionar para links antigos.
- [ ] **Step 5.3:** Criar teste unitário em `tests/unit/contratar-referral-expiration.test.ts` cobrindo o comportamento com cookie válido vs cookie ausente/expirado.
- [ ] **Step 5.4:** Executar testes e validar aprovação.

---

### Task 6: Validação Completa do Ecossistema e Documentação

**Files:**
- Modify: `C:\Users\Windows 10\Desktop\ORACULO\MEMORY.md`

- [ ] **Step 6.1:** Executar suíte completa de testes unitários: `npm test` (garantindo que todos os 430+ testes passem).
- [ ] **Step 6.2:** Executar verificação estática de tipos: `npx tsc --noEmit` (0 erros).
- [ ] **Step 6.3:** Executar compilação de produção: `npm run build`.
- [ ] **Step 6.4:** Atualizar `C:\Users\Windows 10\Desktop\ORACULO\MEMORY.md` registrando a nova funcionalidade de retenção de token de indicação e WhatsApp dinâmico.
