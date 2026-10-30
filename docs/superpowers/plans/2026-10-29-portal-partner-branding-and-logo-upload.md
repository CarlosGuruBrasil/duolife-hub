# Personalização de Cores e Logo do Parceiro via Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que os parceiros e gestores de corretora personalizem de ponta a ponta sua identidade White-Label diretamente na aba "Identidade White Label" do Portal do Parceiro (`/portal/perfil`), incluindo upload direto de arquivo de logotipo, inserção de URL externa, seletores de paleta de cores (primária, secundária e destaque), paletas corporativas rápidas de 1-clique e um simulador visual em tempo real (Live Preview) da página de contratação pública.

**Architecture:**
1. **Endpoint de Upload de Logotipo (`app/api/portal/perfil/logo/route.ts`):** Rota autenticada (`multipart/form-data`) que valida tipos MIME de imagem (`image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`), limita o tamanho a 2MB, armazena no diretório público `public/uploads/logos/` com nome sanitizado e atualiza a configuração `metadata.whiteLabel.logoUrl` do parceiro/corretora.
2. **Campos de Cor e Persistência (`app/api/parceiros/me/route.ts`):** Validação Zod com regex HEX (`^#[0-9a-fA-F]{6}$`) para `primaryColor`, `secondaryColor` e `accentColor`, além de suporte a remoção ou substituição de `logoUrl`.
3. **Interface de Usuário e Seletores Interativos (`src/components/portal/PartnerProfileForm.tsx`):**
   - Upload de arquivo com drag-and-drop / botão de seleção e indicador de upload.
   - Preview e botão de remoção rápida do logotipo atual.
   - Seletores sincronizados `<input type="color">` + input HEX para as 3 cores da marca.
   - Paletas recomendadas de 1-clique (DuoLife, Esmeralda, Azul Royal, Grafite e Ruby).
   - Card de **Live Preview em Tempo Real** no padrão Light Mode simulando o cabeçalho e card de contratação pública.
4. **Testes Unitários:** Suítes em Vitest cobrindo upload de arquivos, validação de payload no backend e renderização/interação na UI.

**Tech Stack:** TypeScript, Next.js (App Router), Tailwind CSS, Node.js `fs.promises`, Postgres.js, Lucide React, Vitest, React Testing Library.

---

## Global Constraints
- Todas as respostas em português brasileiro.
- Todos os arquivos codificados estritamente em UTF-8.
- Padrão de Estilo Visual: Tema Claro (Light Mode) obrigatório (`bg-white`, `border-gray-200`, `text-gray-900`, `bg-gray-50`). Proibido o uso de `bg-slate-900` ou `zinc-900` em cards.
- Área de toque mínima de 44x44px em botões e seletores para acessibilidade mobile.
- Nenhuma regressão nos 348 testes existentes.
- Validação estrita de TypeScript (`npx tsc --noEmit`) com zero erros.
- Build de produção (`npm run build`) validado com sucesso.

## Review Focus
1. Upload de arquivos que não sejam imagens válidas (ex: `.exe`, `.pdf`, `.txt`) deve ser rejeitado com status 400.
2. Upload de arquivos maiores que 2MB deve ser rejeitado com mensagem explicativa e status 400.
3. Permissão de edição restrita: apenas o gestor da corretora ou parceiro autenticado com permissão pode alterar a identidade visual.
4. Cores hexadecimais inválidas (ex: `#12345`, `blue`, `#GGGGGG`) devem ser rejeitadas pelo schema Zod.
5. Remoção do logotipo: o parceiro deve conseguir remover o logo e reverter para a exibição padrão de nome institucional.

---

### Task 1: Endpoint de Upload de Logotipo do Parceiro
**Files:**
- Create: `app/api/portal/perfil/logo/route.ts`
- Test: `tests/unit/portal-logo-upload.test.ts`

- [ ] **Step 1.1:** Criar teste unitário `tests/unit/portal-logo-upload.test.ts` cobrindo:
  - Bloqueio de requisições não autenticadas (401).
  - Bloqueio de usuários sem permissão de gestão (403).
  - Rejeição de requisições sem arquivo ou com tipo MIME não suportado (400).
  - Rejeição de arquivo com tamanho superior a 2MB (400).
  - Sucesso no upload: escrita em disco no caminho `public/uploads/logos/` e atualização do `metadata.whiteLabel.logoUrl` no banco.
- [ ] **Step 1.2:** Implementar `app/api/portal/perfil/logo/route.ts`:
  - Autenticar via `verifyPartnerAuth()` e `canManageOwnCompany(user)`.
  - Processar `req.formData()`.
  - Validar tamanho e extensão/mime (`png`, `jpg`, `jpeg`, `svg`, `webp`).
  - Assegurar criação do diretório `public/uploads/logos/` se inexistente.
  - Gravar arquivo com nome seguro: `logo_${id}_${Date.now()}.${ext}`.
  - Atualizar `metadata.whiteLabel.logoUrl = '/uploads/logos/...'` na tabela `corretoras` ou `partners`.
  - Retornar `{ ok: true, logoUrl: '/uploads/logos/...' }`.
- [ ] **Step 1.3:** Executar `npx vitest run tests/unit/portal-logo-upload.test.ts` e validar 100% de sucesso.

---

### Task 2: Validação e Persistência das Cores e White-Label no Perfil
**Files:**
- Modify: `app/api/parceiros/me/route.ts`
- Test: `tests/unit/partner-branding-me.test.ts`

- [ ] **Step 2.1:** Criar teste unitário `tests/unit/partner-branding-me.test.ts` testando:
  - Validação estrita de `primaryColor`, `secondaryColor` e `accentColor` em formato HEX de 6 dígitos (`#RRGGBB`).
  - Suporte a `logoUrl` vazio ou null para remoção de logotipo.
  - Persistência e mesclagem idempotente no `metadata.whiteLabel` para corretoras e parceiros.
- [ ] **Step 2.2:** Ajustar `app/api/parceiros/me/route.ts` caso haja qualquer inconsistência na limpeza de cores ou persistência de `secondaryColor`.
- [ ] **Step 2.3:** Executar `npx vitest run tests/unit/partner-branding-me.test.ts` e validar aprovação.

---

### Task 3: Interface da Aba White-Label com Upload, Paletas e Live Preview
**Files:**
- Modify: `src/components/portal/PartnerProfileForm.tsx`
- Test: `tests/unit/portal-branding-ui.test.tsx`

- [ ] **Step 3.1:** Criar teste de componente `tests/unit/portal-branding-ui.test.tsx`:
  - Renderização da aba "Identidade White Label" com seletores das 3 cores (`primaryColor`, `secondaryColor`, `accentColor`).
  - Renderização dos botões de paletas rápidas de 1-clique.
  - Seleção de uma paleta pré-definida e verificação de que os inputs de cor são atualizados.
  - Renderização da área de upload e do container de Live Preview.
- [ ] **Step 3.2:** Atualizar `src/components/portal/PartnerProfileForm.tsx`:
  - Adicionar `secondaryColor` no estado do formulário (`form.secondaryColor` com fallback `#7fa8b2`).
  - Implementar o componente de **Upload de Logotipo**:
    - Input de arquivo oculto com `accept="image/png, image/jpeg, image/svg+xml, image/webp"`.
    - Área de arrastar/clicar e botão "Escolher Logotipo".
    - Exibição de preview da imagem atual e botão "Remover Logotipo".
    - Indicador de upload em andamento (`isUploadingLogo` com spinner).
    - Campo retrátil/opcional para colar URL externa direta da imagem.
  - Implementar os **Seletores de Cores**:
    - Primária, Secundária e Destaque com `<input type="color">` e `<input type="text">` sincronizados.
  - Implementar a **Barra de Paletas Corporativas Pré-definidas (1-Clique)**:
    - DuoLife Clássico (`#0e4a5a`, `#7fa8b2`, `#00d4e0`)
    - Esmeralda Corporativo (`#064e3b`, `#34d399`, `#10b981`)
    - Azul Royal (`#1e3a8a`, `#60a5fa`, `#3b82f6`)
    - Grafite & Âmbar (`#18181b`, `#a1a1aa`, `#f59e0b`)
    - Ruby Elegance (`#4c0519`, `#fb7185`, `#e11d48`)
  - Implementar o **Live Preview em Tempo Real**:
    - Card interativo no tema claro simulando o cabeçalho público com logotipo, slogan, badge de desconto e botão CTA aplicando as cores selecionadas em tempo real.
- [ ] **Step 3.3:** Executar `npx vitest run tests/unit/portal-branding-ui.test.tsx` e validar 100% de sucesso.

---

### Task 4: Verificação de Regressão, TypeScript e Build
**Files:**
- Run: `npm test`
- Run: `npx tsc --noEmit`
- Run: `npm run build`

- [ ] **Step 4.1:** Rodar toda a suíte de testes unitários (`npm test`) garantindo que todos os 350+ testes passem sem falhas.
- [ ] **Step 4.2:** Executar verificação de tipos TypeScript (`npx tsc --noEmit`) garantindo 0 erros.
- [ ] **Step 4.3:** Executar `npm run build` garantindo geração completa das 83+ rotas do Next.js sem erros.

---

### Task 5: Documentação e Sincronização de Memória
**Files:**
- Modify: `~/Desktop/ORACULO/MEMORY.md`

- [ ] **Step 5.1:** Atualizar `~/Desktop/ORACULO/MEMORY.md` registrando as novas funcionalidades de White-Label e upload de logotipo.
- [ ] **Step 5.2:** Apresentar resumo final e opções para commit & push.
