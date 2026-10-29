# Contratação White-Label Hierárquica e Rastreamento de Indicação (?ref) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aperfeiçoar o fluxo de contratação pública com herança de identidade visual da Corretora Mãe e destaque de desconto, e implementar o rastreamento completo de indicações institucionais (`/?ref=`) com persistência em cookies de 30 dias e banner de consultoria personalizada.

**Architecture:**
- Ajuste de `app/api/public/contratacao/[token]/route.ts` para realizar JOIN com `corretoras` e utilizar `resolveHierarchicalWhiteLabel`, aplicando logotipo, cores e dados institucionais herdados.
- Enriquecimento visual do Hero em `app/contratar/[token]/_client.tsx` com banner comemorativo de desconto comercial pré-aplicado quando `discountPercent > 0`.
- Extensão de `src/lib/referral.ts` para retornar `discountPercent` na interface `ResolvedPartnerLink`.
- Criação da API `app/api/public/referral/route.ts` para validar o código de indicação e emitir cookie `duolife_ref` persistente.
- Criação do componente cliente `ReferralBanner.tsx` montado na Home (`app/page.tsx`), capturando `?ref=`, gravando cookie e exibindo a consultoria da corretora/parceiro com atalho direto para contratação.

**Tech Stack:** Next.js 15 (App Router), TypeScript, PostgreSQL (`@/lib/pg`), Vitest, Tailwind CSS, Lucide React.

---

### Task 1: Herança Hierárquica e Destaque de Desconto em `/contratar/[token]`

**Files:**
- Modify: `app/api/public/contratacao/[token]/route.ts`
- Modify: `app/contratar/[token]/_client.tsx`
- Test: `tests/unit/public-contratacao-hierarchical-wl.test.ts`

- [ ] **Step 1.1:** Criar teste unitário em `tests/unit/public-contratacao-hierarchical-wl.test.ts` cobrindo:
  - Retorno de white-label com herança da Corretora Mãe quando o parceiro não possui logo/cores próprias.
  - Priorização do logo do parceiro quando ele possuir customização própria.
  - Exposição de `discountPercent` correto no payload.
- [ ] **Step 1.2:** Executar teste e validar falha inicial.
- [ ] **Step 1.3:** Atualizar `app/api/public/contratacao/[token]/route.ts` para fazer JOIN com `corretoras` e aplicar `resolveHierarchicalWhiteLabel(link.partner_metadata, link.corretora_metadata)`.
- [ ] **Step 1.4:** Em `app/contratar/[token]/_client.tsx`, adicionar banner destacado no Hero informando sobre a condição especial com o percentual de desconto comercial e nome do consultor.
- [ ] **Step 1.5:** Executar os testes e confirmar aprovação.

---

### Task 2: Enriquecimento de `resolvePartnerOrLink` e API Pública de Referral

**Files:**
- Modify: `src/lib/referral.ts`
- Create: `app/api/public/referral/route.ts`
- Test: `tests/unit/public-referral.test.ts`

- [ ] **Step 2.1:** Atualizar `src/lib/referral.ts` para incluir `discountPercent: number` na interface `ResolvedPartnerLink` e selecionar `COALESCE(pl.discount_percent, 0) AS discount_percent` na query do link.
- [ ] **Step 2.2:** Criar teste unitário `tests/unit/public-referral.test.ts` cobrindo:
  - Resolução por token de link público (`dlk_...`).
  - Resolução por código wixCode / slug / id do parceiro.
  - Emissão do cabeçalho `Set-Cookie: duolife_ref=...` com validade de 30 dias (`Max-Age=2592000; Path=/; SameSite=Lax`).
  - Retorno 404 quando o código de indicação for inexistente ou inválido.
- [ ] **Step 2.3:** Implementar `app/api/public/referral/route.ts` com métodos `GET`.
- [ ] **Step 2.4:** Executar os testes e garantir 100% de sucesso.

---

### Task 3: Componente `ReferralBanner` e Rastreamento na Home (`app/page.tsx`)

**Files:**
- Create: `src/components/site/ReferralBanner.tsx`
- Modify: `app/page.tsx`
- Test: `tests/unit/referral-banner.test.tsx` (ou teste de componente)

- [ ] **Step 3.1:** Criar `src/components/site/ReferralBanner.tsx`:
  - Hook reativo com `useSearchParams` para ler `ref`.
  - Gravação de cookie `duolife_ref` no navegador.
  - Chamada à API `/api/public/referral?ref=...` para obter o nome da corretora/parceiro e percentual de desconto (se houver).
  - Exibição de faixa acolhedora: *"Você está navegando com a assessoria de {parceiro}"* com CTA *"Contratar Online"* direcionando para `/contratar`.
- [ ] **Step 3.2:** Integrar `ReferralBanner` na `app/page.tsx` envolto em `<Suspense>`.
- [ ] **Step 3.3:** Validar que ao clicar em "Contratar" ou visitar `/contratar`, o cliente é redirecionado para o link exclusivo correspondente.

---

### Task 4: Verificação Completa e Build

- [ ] **Step 4.1:** Executar `npm test`.
- [ ] **Step 4.2:** Executar `npx tsc --noEmit`.
- [ ] **Step 4.3:** Executar `npm run build`.
