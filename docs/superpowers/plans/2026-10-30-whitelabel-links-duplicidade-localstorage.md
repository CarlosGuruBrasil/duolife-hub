# Links White-Label Exclusivos, Persistência LocalStorage e Resolução de Duplicidade Cadastral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo completo de links White-Label com suporte a modalidades Geral vs. Exclusivo (com CPF/CNPJ alvo e uso único), preenchimento resiliente com auto-save em LocalStorage no navegador do cliente, validação zero-trust de identidade por token de sessão, retenção de dados duplicados e modal comparador lado a lado para decisão obrigatória do vendedor no Portal.

**Architecture:**
1. **Schema & Persistência (`src/lib/schema.ts`):** Adição de colunas em `public_sale_links` (`is_exclusive`, `target_document`, `target_name`, `max_uses`, `used_count`), suporte a `client_session_token` em `insurance_clients.metadata` e estrutura `cadastral_conflict` em `cotacoes` com o novo status `'pendente_duplicidade'`.
2. **Criação e Gestão de Links no Portal (`GerarLinkClienteModal.tsx` e `app/api/portal/links/route.ts`):** Alternância entre Link Geral e Link Exclusivo (com validação de CPF/CNPJ alvo e teto de 1 uso), com feedback de contagem de usos e bloqueio automático de links exclusivos já utilizados.
3. **Persistência em LocalStorage & Token Security (`DynamicCotacaoForm.tsx`):** Salvamento automático contínuo do rascunho por token no navegador do cliente (`duolife_draft_${token}`), com recuperação automática inteligente e envio do `client_session_token` local (`duolife_client_token_${cpf}`).
4. **Motor de Detecção de Duplicidade (`src/lib/insurance-ops.ts` / API de Cotações):** 
   - Se o documento não existe: cria novo cliente e gera `client_session_token`.
   - Se o documento existe e o token do LocalStorage confere: atualiza os dados em `insurance_clients` diretamente (próprio titular na mesma máquina).
   - Se o documento existe e o token não confere (ou inexiste): retém os novos dados na cotação, marca status `'pendente_duplicidade'` e bloqueia geração de contrato/pagamento até decisão do vendedor.
5. **Modal Comparador e Resolução no Portal (`app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts` e UI):**
   - Comparador de campos lado a lado (Original vs Novo) destacando divergências.
   - Escolha obrigatória do vendedor: "Manter Dados Originais" ou "Atualizar com Novos Dados".
   - Registro de auditoria em `action_audit_logs` e liberação imediata do fluxo da proposta.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Tailwind CSS, Postgres.js, Zod, Lucide React, Vitest, React Testing Library.

---

## Global Constraints
- Todas as respostas em português brasileiro.
- Todos os arquivos codificados estritamente em UTF-8.
- Padrão de Estilo Visual: Tema Claro (Light Mode) obrigatório (`bg-white`, `border-gray-200`, `text-gray-900`, `bg-gray-50`). Proibido `bg-slate-900` em cards.
- Área de toque mínima de 44x44px em botões e seletores mobile.
- Nenhuma regressão nos 368 testes unitários existentes.
- Validação estrita de TypeScript (`npx tsc --noEmit`) com zero erros.
- Build de produção (`npm run build`) validado com sucesso.
- Ao finalizar a sessão, atualizar `~/Desktop/ORACULO/MEMORY.md`.

## Review Focus
1. Link exclusivo com CPF alvo: se o cliente digitar um CPF diferente do configurado no link exclusivo, a submissão deve ser rejeitada com mensagem clara.
2. Link exclusivo de uso único: ao concluir uma proposta com sucesso, o link deve ter `used_count` incrementado e `status = 'used'`, bloqueando acessos subsequentes.
3. Segurança LGPD: mesmo que o CPF digitado já exista, a tela pública NUNCA pré-carrega nem exibe dados previamente cadastrados.
4. Auto-save no LocalStorage: se o cliente fechar e reabrir o link, o rascunho local deve ser restaurado, permitindo continuar de onde parou ou limpar o formulário.
5. Sobrescrita direta segura: somente se o `client_session_token` do LocalStorage bater com o token registrado no banco para aquele documento os dados serão atualizados diretamente; caso contrário, a proposta obrigatoriamente entra em pendência de duplicidade.
6. Bloqueio de avanço: propostas com `status = 'pendente_duplicidade'` não podem emitir contrato nem cobrança até que o vendedor tome a decisão no modal comparador.

---

### Task 1: Expansão do Schema e Migração Idempotente
**Files:**
- Modify: `src/lib/schema.ts`
- Test: `tests/unit/whitelabel-links-schema.test.ts`

- [ ] **Step 1.1:** Criar teste unitário `tests/unit/whitelabel-links-schema.test.ts` validando:
  - Adição de colunas `is_exclusive`, `target_document`, `target_name`, `max_uses` e `used_count` em `public_sale_links`.
  - Estrutura de dados para conflito de duplicidade cadastral (`cadastral_conflict`).
  - Idempotência do `ensureSchema()`.
- [ ] **Step 1.2:** Alterar `src/lib/schema.ts`:
  - Adicionar as colunas em `public_sale_links` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - Criar índices se aplicáveis (`target_document`, `is_exclusive`).
- [ ] **Step 1.3:** Executar `npx vitest run tests/unit/whitelabel-links-schema.test.ts` e confirmar aprovação.

---

### Task 2: API e Modal de Criação de Links (Geral vs. Exclusivo)
**Files:**
- Modify: `app/api/portal/links/route.ts`
- Modify: `app/api/public/contratacao/[token]/route.ts`
- Modify: `src/components/portal/GerarLinkClienteModal.tsx`
- Test: `tests/unit/portal-exclusive-links.test.ts`

- [ ] **Step 2.1:** Criar teste unitário `tests/unit/portal-exclusive-links.test.ts` testando:
  - Criação de Link Geral com desconto percentual.
  - Criação de Link Exclusivo com CPF/CNPJ e Nome alvo (com `max_uses = 1`).
  - Validação na API pública: bloqueio se o documento informado não coincidir com o `target_document` do link exclusivo.
  - Bloqueio se o link exclusivo já atingiu o limite de usos (`used_count >= max_uses`).
- [ ] **Step 2.2:** Atualizar `app/api/portal/links/route.ts`:
  - Expandir schema Zod para receber `isExclusive`, `targetDocument`, `targetName`, `maxUses`.
  - Sanitizar documento com `somenteDigitos`.
  - Persistir campos na tabela `public_sale_links`.
- [ ] **Step 2.3:** Atualizar `GerarLinkClienteModal.tsx`:
  - Adicionar radio button ou switcher para selecionar "Link Geral (Aberto)" vs "Link Exclusivo (Cliente Específico)".
  - Se Exclusivo: exibir campos para CPF/CNPJ e Nome do cliente, com badge explicativo de "Uso Único".
  - Enviar os novos campos no payload da requisição.
- [ ] **Step 2.4:** Atualizar `app/api/public/contratacao/[token]/route.ts`:
  - Verificar se `max_uses` foi atingido.
  - Retornar `isExclusive`, `targetDocument` (mascarado para a UI se necessário) e `targetName`.
- [ ] **Step 2.5:** Executar `npx vitest run tests/unit/portal-exclusive-links.test.ts` e verificar aprovação.

---

### Task 3: Persistência no LocalStorage e Gestão de Token de Sessão do Cliente
**Files:**
- Modify: `src/components/portal/DynamicCotacaoForm.tsx`
- Modify: `app/contratar/[token]/_client.tsx`
- Test: `tests/unit/contratacao-localstorage-token.test.ts`

- [ ] **Step 3.1:** Criar teste unitário `tests/unit/contratacao-localstorage-token.test.ts` validando:
  - Serialização e restauração de rascunho de formulário a partir do `localStorage`.
  - Limpeza de rascunho ao reiniciar ou concluir contratação.
  - Geração e leitura do `client_session_token` local associado ao documento.
- [ ] **Step 3.2:** Implementar hooks/helpers em `DynamicCotacaoForm.tsx`:
  - Efeito de auto-save com debounce de 500ms gravando `form`, `step`, `planoSel`, `parcelaSel` em `localStorage.getItem(`duolife_draft_${publicToken}`)`.
  - Banner informativo se rascunho for detectado: *"Encontramos um preenchimento em andamento neste navegador. Deseja continuar?"* com botão *"Continuar"* e *"Limpar Rascunho"*.
  - Envio do `client_session_token` armazenado em `localStorage` (`duolife_client_token_${somenteDigitos(form.cpfCnpj)}`) no momento da criação/salvamento da cotação.
  - Ao receber novo token da API, persistir no `localStorage`.
- [ ] **Step 3.3:** Executar `npx vitest run tests/unit/contratacao-localstorage-token.test.ts` e verificar aprovação.

---

### Task 4: Motor de Detecção de Duplicidade Cadastral & Validação Zero-Trust
**Files:**
- Modify: `src/lib/insurance-ops.ts`
- Modify: `app/api/cotacoes/route.ts`
- Test: `tests/unit/cadastral-duplicate-detection.test.ts`

- [ ] **Step 4.1:** Criar teste unitário `tests/unit/cadastral-duplicate-detection.test.ts` cobrindo:
  - Documento novo: cadastra cliente e emite token de sessão.
  - Documento existente + token de sessão idêntico: atualiza os dados em `insurance_clients` diretamente.
  - Documento existente + sem token ou token divergente:
    - `insurance_clients` original permanece intacto.
    - Cotação é criada com status `'pendente_duplicidade'`.
    - Campo `metadata.cadastralConflict` armazena dados originais vs novos e lista de campos divergentes.
- [ ] **Step 4.2:** Implementar a lógica em `src/lib/insurance-ops.ts` e na rota de criação de cotações (`app/api/cotacoes/route.ts`):
  - Função `evaluateCadastralIntegrity(documentNumber, clientToken, submittedData)`.
  - Se divergente/duplicado, registrar snapshot em `cadastralConflict` e marcar cotação com pendência.
- [ ] **Step 4.3:** Bloquear avanço de `gerar-contrato` e `gerar-pagamento` caso a cotação esteja em `pendente_duplicidade`.
- [ ] **Step 4.4:** Executar `npx vitest run tests/unit/cadastral-duplicate-detection.test.ts` e validar aprovação.

---

### Task 5: Modal Comparador Lado a Lado e Resolução de Duplicidade pelo Vendedor
**Files:**
- Create: `app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts`
- Create: `src/components/portal/ModalResolverDuplicidade.tsx`
- Modify: `src/components/portal/CotacaoDetalheView.tsx` (ou componente correspondente de visualização da proposta no portal)
- Test: `tests/unit/resolver-duplicidade-cadastral.test.ts`

- [ ] **Step 5.1:** Criar teste unitário `tests/unit/resolver-duplicidade-cadastral.test.ts` testando:
  - Endpoint de resolução com permissões de parceiro.
  - Opção `MANTER_ORIGINAL`: restaura dados cadastrais na cotação para os originais e remove pendência.
  - Opção `USAR_NOVOS`: atualiza `insurance_clients` com os novos dados digitados pelo cliente e remove pendência.
  - Rejeição de valores inválidos de escolha.
  - Auditoria em `action_audit_logs`.
- [ ] **Step 5.2:** Implementar `app/api/portal/cotacoes/[id]/resolver-duplicidade/route.ts`:
  - Validar autorização do corretor/parceiro da cotação.
  - Processar escolha transacionalmente.
  - Atualizar status da cotação para prosseguir com assinatura e pagamento.
- [ ] **Step 5.3:** Criar componente `ModalResolverDuplicidade.tsx`:
  - Tabela comparativa com colunas "Cadastro Original no Banco" e "Novos Dados Informados pelo Cliente".
  - Destaque visual (badge ou fundo suave) nos campos divergentes (e-mail, telefone, endereço, etc.).
  - Botão 1: "Manter Dados Originais".
  - Botão 2: "Atualizar com Novos Dados".
  - Notificações de confirmação e recarregamento da proposta.
- [ ] **Step 5.4:** Integrar o banner de alerta e o modal na tela de detalhes da proposta no portal do parceiro.
- [ ] **Step 5.5:** Executar `npx vitest run tests/unit/resolver-duplicidade-cadastral.test.ts` e aprovar.

---

### Task 6: Validação Completa, TypeScript, Build e Registro de Memória
**Files:**
- Modify: `~/Desktop/ORACULO/MEMORY.md`

- [ ] **Step 6.1:** Executar suíte completa de testes no Vitest: `npx vitest run` e assegurar 100% de aprovação.
- [ ] **Step 6.2:** Executar verificação estrita de TypeScript: `npx tsc --noEmit` com 0 erros.
- [ ] **Step 6.3:** Validar compilação do Next.js: `npm run build` com sucesso.
- [ ] **Step 6.4:** Atualizar a memória em `~/Desktop/ORACULO/MEMORY.md` detalhando as novas funcionalidades e padrões implementados.
