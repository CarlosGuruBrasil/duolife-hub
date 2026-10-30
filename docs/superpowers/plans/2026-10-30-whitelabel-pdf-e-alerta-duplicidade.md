# Plano de Implementação — White-Label PDF Branding & Alerta Imediato de Conflito Cadastral

## 1. Visão Geral
Este plano visa implementar as melhorias 1 e 2 aprovadas para a área White-Label do ecossistema DuoLife Hub:
1. **Item 1: Branding Dinâmico no PDF do Contrato/Termo de Adesão (Gotenberg Chromium e PDF-Lib Fallback)**
   - Renderização dinâmica e hierárquica (Parceiro White-Label -> Corretora Mãe -> DuoLife Padrão) de logotipo, razão social, nome fantasia, CNPJ, canais de contato (telefone/e-mail), endereço e website no cabeçalho e rodapé.
2. **Item 2: Alerta Imediato de Conflito Cadastral para o Vendedor**
   - Disparo de e-mail transacional prioritário para o vendedor responsável quando um cliente preencher proposta com duplicidade cadastral (`pendente_duplicidade`), com dados do cliente e link direto para o comparador no Portal `/portal/cotacoes/[id]`.

---

## 2. Tarefas e Arquitetura Detalhada

### Tarefa 1: Suporte White-Label Hierárquico no `corretora-resolver.ts`
- **Arquivo:** `src/lib/corretora-resolver.ts`
- **Mudanças:**
  - Estender `CorretoraContratoInfo` com campos opcionais: `website?: string`, `footerText?: string`, `primaryColor?: string`, `isWhiteLabel?: boolean`.
  - No `getCorretoraParaContrato(cotacaoId: string)`:
    - Expandir a consulta SQL para incluir dados e `metadata` da tabela `partners` associada a `c.partner_id`.
    - Integrar `resolveHierarchicalWhiteLabel(row.partner_metadata, corretora?.metadata)`.
    - Fazer merge dos atributos do parceiro (razão social, nome fantasia, CNPJ/CPF, e-mail, telefone, site, endereço e logo) garantindo que, se o parceiro for White-Label, sua identidade sobressaia.
    - Se houver `logoUrl` no parceiro/white-label, carregar o buffer via `loadLogoBuffer`.
- **Testes:** `tests/unit/corretora-resolver.test.ts` / `tests/unit/gotenberg-whitelabel-branding.test.ts`.

### Tarefa 2: Aplicação do Branding no Cabeçalho e Rodapé dos Motores de PDF
- **Arquivos:**
  - `src/lib/gotenberg-contract-generator.ts`
  - `src/lib/pdf-contract-generator.ts`
- **Mudanças:**
  - Em `gotenberg-contract-generator.ts`:
    - Atualizar `renderA4SheetHtml` para aceitar `corretoraEndereco`, `corretoraContato`, `corretoraWebsite`, `footerText`, `corretoraCnpj`, `primaryColor`.
    - No rodapé do HTML Gotenberg: renderizar dinamicamente o endereço e os canais de contato/site do parceiro/corretora, mantendo fallback elegante para a Kev/DuoLife se nenhum dado específico estiver presente.
    - Em `buildContractDataForQuote` e `renderContractHtmlForQuote`: repassar os campos da `corretora` para `renderA4SheetHtml`.
  - Em `pdf-contract-generator.ts`:
    - Atualizar `renderTimbradoHeaderAndFooter` para usar `corretora.footerText` / `corretora.enderecoFormatado` e `corretora.website` / `corretora.phone` nas linhas de rodapé (com sanitização WinAnsi).
- **Testes:** `tests/unit/gotenberg-whitelabel-branding.test.ts`.

### Tarefa 3: Template de E-mail de Conflito Cadastral no `email-service.ts`
- **Arquivo:** `src/lib/email-service.ts`
- **Mudanças:**
  - Adicionar o template `alerta_conflito_cadastral_vendedor` ao array `DEFAULT_TEMPLATES`.
  - Estrutura do e-mail:
    - Assunto: `[Ação Necessária] Conflito cadastral identificado na proposta #{{cotacao_id}} - {{cliente_nome}}`
    - Design Light Mode moderno com suporte a `{{whitelabel_header_html}}`, `{{whitelabel_footer_html}}`, cores dinâmicas `{{cor_primaria}}` e `{{cor_destaque}}`.
    - Box explicativo da duplicidade e LGPD.
    - Dados do proponente preenchido (Nome, CPF/CNPJ mascarado, e-mail, telefone, produto).
    - Botão CTA com `{{link_resolucao}}` direcionando diretamente para a tela de conferência no Portal (`/portal/cotacoes/[id]`).

### Tarefa 4: Notificação do Vendedor e Integração de Evento de Domínio
- **Arquivos:**
  - `src/lib/cadastral-alerts.ts` (novo serviço focado ou em `src/lib/insurance-ops.ts`)
  - `src/lib/triggers/types.ts`
  - `app/api/cotacoes/route.ts`
- **Mudanças:**
  - Adicionar `'CONFLITO_CADASTRAL_DETECTADO'` no enum `EventoDominio` em `src/lib/triggers/types.ts`.
  - Criar função `notificarVendedorConflitoCadastral(...)`:
    - Localiza o e-mail do vendedor (`partner_users` onde `id = userId` ou fallback `partners` onde `id = targetPartnerId`).
    - Resolve base URL (`APP_BASE_URL` ou headers da requisição) para montar o link `/portal/cotacoes/[id]`.
    - Resolve contexto White-Label via `resolveWhiteLabelForPartnerId(targetPartnerId)`.
    - Executa `sendTemplatedEmail` com `templateCode: 'alerta_conflito_cadastral_vendedor'`.
    - Dispara opcionalmente `dispatchDomainEvent('CONFLITO_CADASTRAL_DETECTADO', ...)`.
  - Em `app/api/cotacoes/route.ts`:
    - Logo após salvar a cotação no banco, se `integrityResult.hasDuplicateConflict === true`, invocar `void notificarVendedorConflitoCadastral(...)` sem bloquear a resposta HTTP.

### Tarefa 5: Suíte de Testes Unitários e Validação Completa
- Criar `tests/unit/gotenberg-whitelabel-branding.test.ts` para testar a renderização do HTML Gotenberg e PDF com branding customizado de parceiro vs fallback.
- Criar `tests/unit/alerta-conflito-cadastral-email.test.ts` para testar o disparo de alerta de duplicidade cadastral ao vendedor e resolução de destinatário.
- Rodar `npx vitest run` para garantir 100% de testes passando.
- Rodar `npx tsc --noEmit` para garantir ausência de erros de tipos.
- Rodar `npm run build` para garantir integridade do Next.js.
- Atualizar a memória em `~/Desktop/ORACULO/MEMORY.md`.
