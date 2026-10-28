# Catálogo de Dívidas Técnicas — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Dívidas técnicas mapeadas a partir de evidências concretas no repositório.

---

## 1. Visão Geral das Dívidas Técnicas

Este documento reúne débitos técnicos arquiteturais, de banco de dados, frontend e segurança identificados durante a auditoria profunda do DuoLife Hub. **Nenhuma alteração foi realizada**; os itens estão catalogados para subsidiar o planejamento de sprints de refatoração futuras.

---

## 2. Catálogo Estruturado de Dívidas Técnicas

### TD-001 — Incompletude da Trilha de Migrações para Criação do Schema Base [RESOLVIDO]
- **Status:** **Resolvido em 23/10/2026**
- **Descrição Original:** As migrações versionadas em `db/migrations/` (001 a 024) não possuíam um script de criação inicial (`000-initial-schema.sql`).
- **Solução Implementada:** Criado o arquivo `db/migrations/000-initial-schema.sql` 100% autônomo e idempotente contendo o DDL de todas as 23 tabelas fundamentais e seeds essenciais anteriores à migração 001. A trilha oficial `node scripts/migrate.mjs` agora pode ser executada do zero em bancos novos com 100% de sucesso.
- **Arquivos Envolvidos:** `db/migrations/000-initial-schema.sql`, `scripts/migrate.mjs`.
- **Prioridade:** **Alta**

---

### TD-002 — Dualidade de Governança de Esquema (DDL em Runtime vs Migrações) [RESOLVIDO]
- **Status:** **Resolvido em 23/10/2026**
- **Descrição Original:** O sistema possuía dois motores concorrentes de esquema: `scripts/migrate.mjs` e `ensureSchema()` emitindo mais de 70 instruções DDL a cada requisição.
- **Solução Implementada:** Desacoplado o DDL em tempo de requisição. `shouldRunRuntimeSchemaSetup()` foi refatorado para executar DDL estritamente sob flag explícita `ALLOW_RUNTIME_SCHEMA=true`. Por padrão (inclusive em dev e produção), o runtime executa apenas `verifyRequiredSchema()`, uma validação estática de leitura única (~1ms) conferindo as 35 tabelas obrigatórias no `information_schema.tables`. O script de desenvolvimento `scripts/dev-clean.mjs` e o script de inicialização do contêiner `package.json` (`node scripts/migrate.mjs && next start`) cuidam da sincronização estrutural pré-boot.
- **Arquivos Envolvidos:** `src/lib/schema.ts`, `scripts/dev-clean.mjs`, `.env.example`, `.env.local`.
- **Prioridade:** **Alta**

---

### TD-003 — Armazenamento Inline de Arquivos Base64 na Tabela `corretoras`
- **Descrição:** A tabela `corretoras` armazena 5 arquivos pesados (Contrato Social, Cartão CNPJ, Documento de Identidade do Sócio, Comprovante Bancário e Logotipo) diretamente em colunas `TEXT` no formato Base64.
- **Impacto:** Inchaço severo da tabela (*table bloat*), uso excessivo de tabelas TOAST e consumo desnecessário de memória e tráfego de rede em consultas gerais como `SELECT * FROM corretoras`.
- **Risco:** **Médio a Alto**
- **Arquivos Envolvidos:** `db/migrations/018-*.sql`, `db/migrations/020-*.sql`, `src/lib/schema.ts`, `app/api/admin/corretoras/route.ts`.
- **Prioridade:** **Média**
- **Sugestão Futura:** Migrar os uploads para um serviço de Object Storage compatível com S3 (AWS S3, Cloudflare R2 ou MinIO) e manter no PostgreSQL apenas a chave de armazenamento (`storage_key`) e metadados.

---

### TD-004 — Chaves Primárias com Tipo `TEXT` em vez de `UUID` Nativo
- **Descrição:** Todas as tabelas que utilizam identificadores aleatórios utilizam `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`.
- **Impacto:** Chaves armazenadas como strings de 36 caracteres consomem 36 bytes por registro mais overhead de codificação, enquanto o tipo nativo `UUID` do PostgreSQL ocupa exatamente 16 bytes. Isso reduz a densidade de páginas dos índices B-Tree e eleva o consumo de RAM do pool de buffers.
- **Risco:** **Médio** (degradação de performance em longo prazo à medida que o volume de apólices e logs crescer).
- **Arquivos Envolvidos:** `src/lib/schema.ts` e todas as migrações SQL.
- **Prioridade:** **Média**
- **Sugestão Futura:** Em novos módulos ou em uma grande migração planejada, adotar o tipo nativo `UUID` para chaves primárias e estrangeiras.

---

### TD-005 — Armazenamento de Segredos e Tokens em Texto Plano em `system_settings`
- **Descrição:** Chaves mestras de integração (Wix, Asaas, ZapSign) salvas dinamicamente pelo painel administrativo em `/admin/chaves-api` são gravadas na coluna `value TEXT` da tabela `system_settings` sem criptografia.
- **Impacto:** Qualquer usuário com acesso de leitura ao banco de dados ou a dumps de backup pode extrair credenciais de produção de parceiros financeiros.
- **Risco:** **Alto**
- **Arquivos Envolvidos:** `src/lib/system-settings.ts`, `app/api/admin/chaves-api/page.tsx`.
- **Prioridade:** **Alta**
- **Sugestão Futura:** Implementar criptografia de campo com AES-256-GCM utilizando uma chave mestra declarada no `.env` antes de persistir em `system_settings`.

---

### TD-006 — Rotina de Reparo de Valores Monetários (* 100) no Boot da Aplicação
- **Descrição:** O arquivo `src/lib/schema.ts` (linhas 970 a 1025) contém comandos `UPDATE cotacoes` que buscam padrões de texto como `ILIKE '%100k%'` para dividir valores de prêmio por 100 ou fixar coberturas, contornando corrupções de dados legadas originadas no Wix.
- **Impacto:** Toda inicialização do runtime DDL executa updates varrendo a tabela de cotações. Se uma proposta legítima de R$ 10.000.000,00 for contratada no futuro, ela corre risco de sofrer truncamento indevido.
- **Risco:** **Médio**
- **Arquivos Envolvidos:** `src/lib/schema.ts`, `db/migrations/014-repair-corrupted-plan-coverage.sql`.
- **Prioridade:** **Média**
- **Sugestão Futura:** Remover o bloco de update do `schema.ts`, mantendo a correção exclusivamente como registro histórico da migração 014.

---

### TD-007 — Remoção da Integridade Referencial (FK) em `refresh_tokens`
- **Descrição:** A migração 013 e o `schema.ts` executam `ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_partner_user_id_fkey` para permitir que o mesmo campo armazene IDs de `partner_users` ou de `corretora_users`.
- **Impacto:** Perda de integridade referencial: exclusões de usuários no banco deixam tokens órfãos e não há garantia de que o ID pertença a um usuário real.
- **Risco:** **Baixo a Médio**
- **Arquivos Envolvidos:** `db/migrations/013-allow-corretora-refresh-tokens.sql`, `src/lib/schema.ts`.
- **Prioridade:** **Baixa**
- **Sugestão Futura:** Adicionar colunas estruturadas `user_id TEXT` e `user_type TEXT` ('partner' | 'corretora' | 'admin') com validação limpa.

---

### TD-008 — Validações Imperativas no Frontend vs Schemas Zod Declarativos no Backend
- **Descrição:** `DynamicCotacaoForm.tsx` valida as transições das etapas 1 a 4 com múltiplos blocos imperativos `if (...) setError(...)`, enquanto o backend mantém schemas Zod em `src/lib/product-schemas/registry.ts`.
- **Impacto:** Risco de desalinhamento: se um campo novo for adicionado ou tornado obrigatório no schema Zod, o formulário frontend pode permitir o avanço do usuário sem exigir o preenchimento na interface.
- **Risco:** **Médio**
- **Arquivos Envolvidos:** `src/components/portal/DynamicCotacaoForm.tsx`, `src/lib/product-schemas/registry.ts`.
- **Prioridade:** **Média**
- **Sugestão Futura:** Integrar a função `buildRamoStepXSchema().safeParse()` diretamente nos gatilhos de avanço de etapa no frontend.

---

### TD-009 — Cotações sem Salvamento de Rascunho nas Etapas Iniciais (1 a 4)
- **Descrição:** O formulário dinâmico só executa a requisição `POST /api/cotacoes` para persistir os dados no banco na Etapa 5 (ao clicar em "Ir para Assinatura").
- **Impacto:** Se o corretor preencher os dados do proponente, especialidades e declarações de risco (etapas 2, 3 e 4) e a página for recarregada ou fechar acidentalmente, todo o trabalho é perdido.
- **Risco:** **Médio (Fricção de UX e Perda de Conversão)**
- **Arquivos Envolvidos:** `src/components/portal/DynamicCotacaoForm.tsx`, `app/api/cotacoes/route.ts`.
- **Prioridade:** **Média**
- **Sugestão Futura:** Implementar salvamento automático de rascunho com debounce a partir do preenchimento da Etapa 2.

---

### TD-010 — Ausência de Runner Unificado de Testes Automatizados no Pipeline [RESOLVIDO]
- **Status:** **Resolvido em 28/10/2026**
- **Descrição Original:** `package.json` possuía `"test": "echo \"No tests configured\""`. O repositório possuía ótimos scripts de teste em `scripts/`, porém dependiam de execução manual via CLI e não havia suíte formal integrada a pipelines de integração contínua.
- **Solução Implementada:** Integrado o **Vitest** v5 como test runner oficial do projeto via `vitest.config.mts` e scripts `npm test` / `npm run test:watch` no `package.json`. Criada a suíte de testes unitários na pasta `tests/` cobrindo sanidade do ambiente (`smoke.test.ts`), validação documental de CPF/CNPJ (`documento.test.ts`) e cálculo temporal de dias úteis e feriados nacionais (`business-days.test.ts`). Implementada pipeline automatizada no GitHub Actions (`.github/workflows/ci.yml`) com execução em `push` e `pull_request` nas branches `main` e `develop`, executando setup de Node.js v22 com cache npm, checagem estrita de TypeScript (`npx tsc --noEmit`), suíte Vitest (`npm test`) e validação de build Next.js (`npm run build`).
- **Arquivos Envolvidos:** `package.json`, `vitest.config.mts`, `tests/smoke.test.ts`, `tests/documento.test.ts`, `tests/business-days.test.ts`, `.github/workflows/ci.yml`, `docs/TESTING.md`.
- **Prioridade:** **Média**

---

### TD-011 — Ausência de Lock Pessimista na Geração de Cobranças Externas
- **Descrição:** A rota de geração de cobranças no Asaas (`app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts` e `src/lib/asaas-service.ts`) consulta se já existe cobrança sem bloqueio de linha (`FOR UPDATE`).
- **Impacto:** Requisições concorrentes geram chamadas HTTP simultâneas para o gateway financeiro, criando cobranças duplicadas antes de gravar no banco de dados.
- **Risco:** **Alto (Financeiro e Operacional)**
- **Arquivos Envolvidos:** `app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts`, `src/lib/asaas-service.ts`.
- **Prioridade:** **Alta**
- **Sugestão Futura:** Envolver a checagem em `sql.begin` com lock pessimista na cotação antes de qualquer chamada HTTP para o Asaas.

---

### TD-012 — Tabelas de Controle de Cupom sem Rotina de Incremento
- **Descrição:** As tabelas `cupom_usos` e `cupom_uso_eventos` foram criadas no PostgreSQL e são consultadas pelo motor de preços, mas nenhuma função de negócio executa `INSERT` ou `UPDATE` nelas após a aprovação da venda.
- **Impacto:** Limites de utilização de cupons promocionais cadastrados na Wix não possuem efetividade no DuoLife Hub.
- **Risco:** **Alto (Comercial)**
- **Arquivos Envolvidos:** `src/lib/pricing.ts`, `src/lib/insurance-ops.ts`.
- **Prioridade:** **Alta**
- **Sugestão Futura:** Adicionar a inserção atômica em `cupom_usos` e `cupom_uso_eventos` dentro da transação `ensureSaleForPaidQuote` em `src/lib/insurance-ops.ts`.

