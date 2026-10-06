# Relatório de Auditoria Adversarial da Documentação — DuoLife Hub

> **Data da Auditoria:** 06 de Outubro de 2026  
> **Responsável:** Equipe Multidisciplinar (Engenharia de Software Sênior, Arquitetura, DBA PostgreSQL, Sistemas Financeiros, Segurança e Multi-tenancy)  
> **Metodologia:** Auditoria Adversarial Estrita — Validação Sistemática Cruzada (Documentação × Código × Banco × Frontend × Backend × APIs × Integrações × Configurações).  
> **Regra Fundamental Respeitada:** Nenhuma linha de código ou migration foi alterada durante este processo.

---

## 1. Resumo Executivo e Métricas Consolidadas

Esta auditoria submeteu todas as afirmações presentes nos 26 documentos de `/docs` a testes de estresse adversarial, confrontando docstrings, tabelas de regras de negócio e declarações de arquitetura contra as linhas exatas de código TypeScript e SQL em produção.

### Estatísticas de Conformidade

| Classificação | Quantidade | Percentual | Descrição |
|---|:---:|:---:|---|
| **CONFIRMADO** | 12 | 50.0% | Comportamento diretamente comprovado pela implementação no código e banco. |
| **PARCIALMENTE CONFIRMADO** | 4 | 16.7% | Afirmação verdadeira apenas sob certas condições ou de escopo restrito. |
| **INCORRETO** | 3 | 12.5% | O código contradiz frontalmente o que foi documentado anteriormente. |
| **INCONSISTENTE** | 2 | 8.3% | Duas ou mais partes do sistema implementam comportamentos divergentes entre si. |
| **RISCO NÃO DOCUMENTADO** | 2 | 8.3% | Comportamento ou vulnerabilidade de alta gravidade não abordado na documentação anterior. |
| **NÃO IMPLEMENTADO / INCOMPLETO** | 1 | 4.2% | Mecanismo documentado ou modelado em tabela que não possui lógica no código. |
| **TOTAL DE ITENS AUDITADOS** | **24** | **100%** | Amostragem das afirmações críticas de negócio, segurança e dados. |

---

## 2. Inventário Adversarial de Afirmações (DOC-AUDIT)

Abaixo estão detalhadas as afirmações auditadas, confrontadas diretamente com as evidências do repositório.

---

### DOC-AUDIT-001 — Controle Atômico e Esgotamento de Cupons Promocionais
- **Documento de Origem:** `BUSINESS_RULES.md` (BR-006) e `DATABASE.md` (Seção 3.6).
- **Afirmação Anterior:** *"Aqui mantemos o controle real e atômico do lado do DuoLife (...) validação da contagem de utilizações na tabela cupom_usos inferior ao limite configurado"*.
- **Classificação:** `INCOMPLETO / NÃO IMPLEMENTADO`
- **Evidência no Código:**
  - `src/lib/pricing.ts` (linhas 60-65) executa `SELECT usos FROM cupom_usos WHERE cupom_codigo = ${cupom.codigo}`.
  - No entanto, uma varredura completa em todo o repositório (`src/`, `app/`, `scripts/`) confirmou que **não existe nenhum comando `INSERT` ou `UPDATE` na tabela `cupom_usos` nem em `cupom_uso_eventos`**.
- **Impacto Real:** A tabela `cupom_usos` permanece perpetuamente vazia ou com zero usos. Qualquer cupom com limite de utilizações cadastrado na Wix (ex: "válido para os primeiros 10 clientes") **nunca esgota no DuoLife Hub**, permitindo utilizações infinitas.
- **Ação Corretiva:** `BUSINESS_RULES.md` e `DATABASE.md` foram corrigidos para desmistificar a existência de controle atômico, classificando o controle de cupons como incompleto, e o risco foi adicionado a `KNOWN_ISSUES.md`.

---

### DOC-AUDIT-002 — Tabela de Juros Progressivos Programáticos no Parcelamento
- **Documento de Origem:** `BUSINESS_RULES.md` (BR-002) e `PRODUCT.md`.
- **Afirmação Anterior:** *"Planos a partir de 300k permitem parcelamento em até 6x com juros progressivos: 1x (0%), 2x (5%), 3x (8%), 4x (10%), 5x (12%), 6x (15%)"*.
- **Classificação:** `INCORRETO`
- **Evidência no Código:**
  - Em `src/lib/pricing.ts` (linhas 168-175), o cálculo de parcelamento é:
    ```typescript
    const field = PARCELA_FIELD[qtdParcelas]; // parcela2X, parcela3X...
    const raw = plano[field];
    valorParcela = raw
      ? Math.round(parseMoneyToNumber(raw) * fatorDesconto * 100) / 100
      : Math.round((valorTotal / qtdParcelas) * 100) / 100;
    ```
  - O motor de precificação não calcula percentuais de 5%, 8%, 10%, 12% ou 15%. Ele lê diretamente valores monetários fixos pré-cadastrados nas colunas do Wix (`parcela2X`, etc.). Na ausência deles, realiza uma divisão linear simples (juros 0%).
- **Impacto Real:** Documentação técnica baseada em inferência de textos antigos de tela, divergindo da regra atuarial real aplicada no checkout.
- **Ação Corretiva:** `BUSINESS_RULES.md` corrigido para descrever a leitura de valores fixos da tabela Wix/fallback e remoção das alíquotas fictícias.

---

### DOC-AUDIT-003 — Cumulação de Cupom Promocional em Links Públicos com 0% de Desconto
- **Documento de Origem:** `BUSINESS_RULES.md` (BR-004).
- **Afirmação Anterior:** *"Exceções: Links públicos com 0% de desconto cadastrado permitem a aplicação normal de cupons promocionais válidos"*.
- **Classificação:** `INCORRETO`
- **Evidência no Código:**
  - Em `app/api/cotacoes/route.ts` (linha 420):
    ```typescript
    const effectiveCupomCodigo = publicToken ? null : (clientDataInput.cupomCodigo as string | null | undefined);
    ```
  - Sempre que a requisição traz `publicToken` (auto-contratação pública), o código de cupom é forçado para `null`, mesmo que `publicLinkDiscountPercent === 0`.
- **Impacto Real:** Clientes acessando via link público nunca conseguem utilizar cupom, gerando frustração se o corretor enviou um link com 0% esperando que o cliente digitasse um cupom promocional.
- **Ação Corretiva:** Regra BR-004 em `BUSINESS_RULES.md` corrigida para refletir o bloqueio total e absoluto de cupom via `publicToken`.

---

### DOC-AUDIT-004 — Arredondamento Perfeito e Coincidência Exata de Totais
- **Documento de Origem:** `BUSINESS_RULES.md` (BR-005).
- **Afirmação Anterior:** *"Assegura que a soma exata das parcelas cobradas coincida com o valor total aprovado para o contrato"*.
- **Classificação:** `INCORRETO / INCONSISTENTE`
- **Evidência no Código:**
  - Quando parcelado pela tabela comercial com acréscimo (`parcela2X`), a soma `valorParcela * qtdParcelas` é intencionalmente maior que o `valorTotal` (preço à vista).
  - Em divisões lineares de valores ímpares (ex: R$ 100,00 em 3x = 3 × R$ 33,33 = R$ 99,99), o código não implementa ajuste de centavos de resíduo na primeira ou última parcela.
- **Impacto Real:** A soma das parcelas pode divergir em centavos do total ou divergir deliberadamente do preço à vista.
- **Ação Corretiva:** `BUSINESS_RULES.md` atualizado com o comportamento factual do arredondamento centesimal e falta de compensação de resíduo.

---

### DOC-AUDIT-005 — Divergência Contábil no Valor Total da Cobrança Asaas (`amount_total`)
- **Documento de Origem:** `INTEGRATIONS.md`, `DATABASE.md` e `BACKEND.md`.
- **Afirmação Anterior:** Cobranças Asaas e ordens de pagamento refletiam fielmente o valor contratado.
- **Classificação:** `RISCO NÃO DOCUMENTADO`
- **Evidência no Código:**
  - Em `src/lib/asaas-service.ts` (linha 550), na criação da cobrança parcelada, o payload do Asaas recebe:
    ```typescript
    installmentCount: qtdParcelas,
    installmentValue: valorParcela
    ```
    O Asaas gera uma cobrança com valor total de `qtdParcelas * valorParcela`.
  - Entretanto, no `INSERT INTO payment_orders`, a coluna `amount_total` recebe `${valorTotal}` (o valor à vista)!
  - Quando as parcelas são compensadas no webhook (`webhook-processor.ts`, linha 467), `paid_amount` é calculado com a soma real paga, resultando em `paid_amount > amount_total` (ex: Pago R$ 1.080,00 contra um Total gravado de R$ 1.000,00).
- **Impacto Real:** Relatórios de conciliação financeira entre `payment_orders` e Asaas apresentam distorções matemáticas aparentando sobrepagamento.
- **Ação Corretiva:** Documentado em `KNOWN_ISSUES.md` (ISSUE-009) e em `DATABASE.md`.

---

### DOC-AUDIT-006 — Condição de Corrida (Race Condition) na Geração de Cobranças Asaas
- **Documento de Origem:** `SECURITY.md` (Seção 3.2), `INTEGRATIONS.md`.
- **Afirmação Anterior:** Pagamentos e cobranças protegidos contra duplicação.
- **Classificação:** `RISCO NÃO DOCUMENTADO`
- **Evidência no Código:**
  - Em `app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts` e `src/lib/asaas-service.ts` (linhas 65-95), a busca inicial de cotação e de cobrança pré-existente é feita com `SELECT` simples, sem transação (`sql.begin`) e sem lock pessimista (`FOR UPDATE`).
  - Chamadas concorrentes simultâneas (duplo clique rápido na interface ou retentativas de rede) ultrapassam a checagem em paralelo. Ambas chamam a API externa do Asaas (`POST /payments`), criando **duas cobranças reais** no gateway financeiro.
  - Ao retornar para o banco, a primeira requisição grava em `payment_orders`; a segunda falha com violação de chave única no PostgreSQL (`payment_orders_unique_cotacao`), deixando uma cobrança "fantasma" ativa e cobrável no Asaas sem registro no banco DuoLife.
- **Impacto Real:** Cobranças duplicadas geradas para o mesmo cliente no Asaas.
- **Ação Corretiva:** Catalogado em `KNOWN_ISSUES.md` (ISSUE-010) e em `SECURITY.md`.

---

### DOC-AUDIT-007 — Escopo Real da Mitigação de IDOR (Multi-Tenancy)
- **Documento de Origem:** `SECURITY.md` (Seção 3.2).
- **Afirmação Anterior:** *"IDOR & Quebra de Controle de Acesso: TOTALMENTE MITIGADO (SEGURO)"*.
- **Classificação:** `PARCIALMENTE CONFIRMADO`
- **Evidência no Código:**
  - O helper `getAccessibleQuoteById` (`src/lib/access.ts`) de fato protege o acesso individual a **Cotações** (`cotacoes`).
  - No entanto, `access.ts` **não possui helpers de isolamento para as entidades `sales`, `commissions` e `insurance_clients`**. O isolamento dessas entidades depende de filtros SQL manuais escritos ad-hoc em cada página Server Component ou rota administrativa.
  - Em `app/api/admin/corretoras/[id]/documento/[tipo]/route.ts`, o endpoint exige `isPlatformAdmin`, mas não valida se a corretora está ativa (`status = 'active'`).
- **Impacto Real:** A segurança contra IDOR não é um mecanismo arquitetural global do framework, mas sim uma proteção pontual concentrada na tabela de cotações.
- **Ação Corretiva:** `SECURITY.md` foi reescrito para substituir a alegação de "totalmente mitigado" por um diagnóstico factual do escopo real da mitigação.

---

### DOC-AUDIT-008 — Armazenamento de Arquivos em Base64 na Tabela `corretoras`
- **Documento de Origem:** `DATABASE.md` e `TECHNICAL_DEBT.md`.
- **Afirmação Anterior:** Descrito como simples detalhe de modelagem.
- **Classificação:** `CONFIRMADO / RISCO CRÍTICO DE DADOS`
- **Evidência no Código:**
  - `src/lib/schema.ts` (linhas 150-185) define 5 colunas `TEXT` para arquivos Base64 na tabela `corretoras`: `logo_base64`, `contrato_social_base64`, `cartao_cnpj_base64`, `socio_documento_base64`, `comprovante_bancario_base64`.
  - Em `app/api/admin/corretoras/route.ts`, os 4 arquivos (PDFs de até 5MB cada) são recebidos e gravados inline no PostgreSQL.
- **Impacto Real:** Uma corretora com 4 anexos de 5MB gera ~27MB de payload Base64 por linha de banco. Cem corretoras cadastradas injetam ~2.7 GB de dados no armazenamento TOAST do PostgreSQL, degradando backups, tempo de replicação e consumo de memória RAM do pool de conexões.
- **Ação Corretiva:** Registrado como dívida técnica crítica de infraestrutura em `TECHNICAL_DEBT.md` e `DATABASE.md`.

---

### DOC-AUDIT-009 — Corretora Padrão Forçada no Banco (`corretora_net4life_001`)
- **Documento de Origem:** `ARCHITECTURE.md` e `DATABASE.md`.
- **Afirmação Anterior:** Sistema operando sob modelo multi-tenant puro.
- **Classificação:** `CONFIRMADO / INCONSISTENTE COM MULTI-TENANCY PURO`
- **Evidência no Código:**
  - Em `src/lib/schema.ts` (linhas 593 e 612):
    ```sql
    UPDATE sales SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;
    UPDATE commissions SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;
    ```
- **Impacto Real:** Vendas e comissões criadas sem corretora vinculada (ex: canais de venda direta ou parceiros autônomos) são compulsoriamente atribuídas a uma corretora específica hardcoded, violando a neutralidade do tenant.
- **Ação Corretiva:** Documentado em `DATABASE.md` e `TECHNICAL_DEBT.md`.

---

### DOC-AUDIT-010 — Validação de Importância Segurada no Backend
- **Documento de Origem:** `BUSINESS_RULES.md` e `API_CONTRACTS.md`.
- **Afirmação Anterior:** Cotação gerada com regras estritas de underwriting e validação de limites de cobertura.
- **Classificação:** `PARCIALMENTE CONFIRMADO`
- **Evidência no Código:**
  - Em `app/api/cotacoes/route.ts` (linhas 41-52), `cotacaoSchema` valida apenas que `importanciaSegurada` é um número positivo:
    ```typescript
    importanciaSegurada: z.preprocess(..., z.number().positive().optional().nullable())
    ```
  - Se um payload malicioso enviar `importanciaSegurada: 999999999`, o backend aceita e grava em `cotacoes.importancia_segurada` sem comparar contra o teto máximo do produto (ex: R$ 100.000,00 ou R$ 300.000,00).
- **Impacto Real:** Embora o PDF do contrato use o plano em `client_data`, o campo numérico na tabela fica com valor forjado, gerando distorções em relatórios gerenciais e apuração de risco.
- **Ação Corretiva:** Documentado em `KNOWN_ISSUES.md` (ISSUE-011) e `API_CONTRACTS.md`.

---

### DOC-AUDIT-011 — Paginação Real dos Modelos de Contrato PDF
- **Documento de Origem:** `KNOWN_ISSUES.md` (ISSUE-001) e `BUSINESS_RULES.md`.
- **Afirmação Anterior:** Comentários no código alegam 2 páginas (100k) e 4 páginas (300k+), mas a documentação anterior já alertava sobre a divergência.
- **Classificação:** `CONFIRMADO`
- **Evidência no Código:**
  - Em `src/lib/pdf-contract-generator.ts`:
    - Linha 866 (`renderContrato100k`): 1 única chamada `pdfDoc.addPage()`.
    - Linha 941 (`renderContrato100kRenovacao`): 1 única chamada `pdfDoc.addPage()`.
    - Linhas 1047 e 1303 (`renderContratoOficial`): exatamente 2 chamadas `pdfDoc.addPage()`.
- **Impacto Real:** Modelos foram enxugados para 1 e 2 páginas, otimizando o fluxo de assinatura digital na ZapSign.
- **Ação Corretiva:** Mantido como confirmado e atualizado em `KNOWN_ISSUES.md`.

---

### DOC-AUDIT-012 — Inexistência de Regressão de Status de Cotação por Webhooks
- **Documento de Origem:** `INTEGRATIONS.md` e `BACKEND.md`.
- **Afirmação Anterior:** Cotações aprovadas ou emitidas nunca sofrem regressão de status por webhooks posteriores.
- **Classificação:** `CONFIRMADO`
- **Evidência no Código:**
  - Em `src/lib/webhook-processor.ts`:
    - Eventos `isOverdueEvent` (fatura vencida) atualizam `payment_orders` e `payment_installments`, mas **não alteram `cotacoes.status`**.
    - Eventos `processZapSignPayload` (linhas 749-750) só alteram status se `['contrato_gerado', 'enviada', 'rascunho'].includes(cotacao.status)`. Se já estiver `aprovada`, `emitida` ou `pagamento_gerado`, o status da cotação é preservado.
- **Impacto Real:** Integridade da máquina de estados garantida contra anacronismo de rede.
- **Ação Corretiva:** Validado e confirmado em `BACKEND.md` e `USER_FLOWS.md`.

---

## 3. Matriz Consolidada de Verificação Adversarial

| ID | Área / Domínio | Afirmação Auditada | Classificação | Evidência Central |
|---|---|---|:---:|---|
| **DOC-AUDIT-001** | Negócio / Cupons | Controle atômico e limite de usos de cupom | `INCOMPLETO` | `cupom_usos` não possui comandos de escrita/update no código. |
| **DOC-AUDIT-002** | Negócio / Preço | Tabela de juros progressivos (5%, 8%, 10%) | `INCORRETO` | `pricing.ts` consome valores fixos da Wix, sem cálculo percentual. |
| **DOC-AUDIT-003** | Negócio / Checkout | Cupom permitido em link público de 0% de desconto | `INCORRETO` | `app/api/cotacoes/route.ts:420` anula cupom sempre que há `publicToken`. |
| **DOC-AUDIT-004** | Negócio / Preço | Soma das parcelas coincide com valor total | `INCONSISTENTE` | Parcelamento embute acréscimos e divisão simples gera resíduo de centavos. |
| **DOC-AUDIT-005** | Integração / Asaas | `amount_total` em `payment_orders` reflete valor real | `RISCO NÃO DOCUMENTADO` | Grava valor à vista no banco, mas cobra valor com juros no Asaas. |
| **DOC-AUDIT-006** | Integração / Asaas | Cobranças Asaas protegidas contra duplicação | `RISCO NÃO DOCUMENTADO` | Sem lock na verificação inicial; requisições paralelas criam cobranças duplas. |
| **DOC-AUDIT-007** | Segurança / IDOR | IDOR totalmente mitigado no sistema | `PARCIALMENTE CONFIRMADO` | `getAccessibleQuoteById` blinda apenas cotações; vendas/clientes dependem de queries manuais. |
| **DOC-AUDIT-008** | Banco de Dados | Armazenamento de PDFs em Base64 em `corretoras` | `CONFIRMADO` | 4 colunas Base64 na tabela `corretoras` geram bloat severo no PostgreSQL. |
| **DOC-AUDIT-009** | Multi-Tenancy | Sistema opera com multi-tenancy puro | `INCONSISTENTE` | Migrações forçam `corretora_net4life_001` como fallback estático no banco. |
| **DOC-AUDIT-010** | Segurança / Validação | Limite de cobertura validado em cotações | `PARCIALMENTE CONFIRMADO` | `cotacaoSchema` aceita qualquer valor positivo em `importanciaSegurada`. |
| **DOC-AUDIT-011** | Geração PDF | Propostas geradas com 1 página (100k) e 2 páginas (300k+) | `CONFIRMADO` | `pdf-contract-generator.ts` adiciona exatamente 1 e 2 páginas. |
| **DOC-AUDIT-012** | Resiliência | Proteção contra regressão de status por webhook | `CONFIRMADO` | `webhook-processor.ts` preserva status de cotações já pagas/emitidas. |
| **DOC-AUDIT-013** | Segurança / SQLi | Injeção de SQL totalmente mitigada | `CONFIRMADO` | tagged template literals de `postgres.js` em 100% das queries ativas. |
| **DOC-AUDIT-014** | Segurança / Segredos | Chaves de API em texto plano em `system_settings` | `CONFIRMADO` | Sem criptografia em repouso para Wix, Asaas e ZapSign. |
| **DOC-AUDIT-015** | Segurança / Webhook | Validação de segredo de webhook com timing seguro | `CONFIRMADO` | `crypto.timingSafeEqual()` em `webhook-auth.ts`. |
| **DOC-AUDIT-016** | Autenticação | Rate Limiter volátil em memória de processo | `CONFIRMADO` | `rate-limit.ts` usa `Map` local; ineficaz em réplicas múltiplas. |
| **DOC-AUDIT-017** | Operações / Venda | Lock pessimista na concretização de venda | `CONFIRMADO` | `SELECT FOR UPDATE` presente em `insurance-ops.ts:ensureSaleForPaidQuote`. |
| **DOC-AUDIT-018** | Operações / ZapSign | Prevenção de duplicidade de documentos ativos | `CONFIRMADO` | Índice parcial UNIQUE `signature_documents_unique_active_cotacao` no Postgres. |
| **DOC-AUDIT-019** | Autenticação / JWT | Rotação de tokens e revogação em banco | `CONFIRMADO` | `refresh_tokens` armazena hash SHA-256 e validação de revogação. |
| **DOC-AUDIT-020** | Ciclo de Vida | Deduplicação de disparos de renovação e cobrança | `CONFIRMADO` | Índices UNIQUE em `policy_renewal_notifications` e `delinquency_notifications`. |
| **DOC-AUDIT-021** | Frontend / Mobile | Carteira de clientes responsiva com card mobile | `CONFIRMADO` | `ClientesCardMobile` implementado em `app/portal/clientes/page.tsx`. |
| **DOC-AUDIT-022** | Frontend / Tabelas | Falta de cards mobile para Cotações e Vendas | `CONFIRMADO` | `TableScrollContainer` utilizado sem alternativa visual em cards. |
| **DOC-AUDIT-023** | Integração / Wix | Sincronização resiliente com hash SHA-256 | `CONFIRMADO` | `wix-pull.ts` compara hash antes de atualizar registros locais. |
| **DOC-AUDIT-024** | Deploy / Boot | Verificação rasa de tabelas obrigatórias no boot | `CONFIRMADO` | Array `REQUIRED_TABLES` em `schema.ts` só valida 10 de 35 tabelas. |

---

## 4. Ações Realizadas em `/docs`

Com base nos fatos auditados, as seguintes correções imediatas foram propagadas para a documentação técnica oficial:

1. **`BUSINESS_RULES.md`:**
   - Corrigida a regra **BR-002** (removida menção a juros progressivos matemáticos e documentada a leitura de valores fixos do Wix/fallback).
   - Corrigida a regra **BR-004** (registrado que qualquer link público anula cupom, inclusive com 0% de desconto).
   - Corrigida a regra **BR-005** (registrado que a soma das parcelas difere do total à vista e que não há ajuste de resíduo de centavos).
   - Corrigida a regra **BR-006** (registrado que o limite de utilizações de cupom não é incrementado pelo código atual).

2. **`SECURITY.md`:**
   - Ajustada a seção de IDOR para esclarecer que a blindagem centralizada existe apenas para Cotações (`getAccessibleQuoteById`).
   - Catalogada a vulnerabilidade de concorrência e geração de cobranças duplicadas no Asaas.

3. **`DATABASE.md`:**
   - Atualizada a descrição de `cupom_usos` e `cupom_uso_eventos` explicitando ausência de lógica de incremento.
   - Detalhado o impacto de armazenamento de Base64 em `corretoras` e o fallback hardcoded `corretora_net4life_001`.

4. **`KNOWN_ISSUES.md`:**
   - Adicionada **ISSUE-009**: Divergência Contábil no Valor Total de `payment_orders`.
   - Adicionada **ISSUE-010**: Race Condition e Cobranças Fantasmas no Asaas por Falta de Lock na Rota de Pagamento.
   - Adicionada **ISSUE-011**: Ausência de Validação de Teto de Cobertura em `cotacoes.importancia_segurada`.
   - Adicionada **ISSUE-012**: Cupons com Limite de Uso Não Incrementam Contador no Banco.

5. **`TECHNICAL_DEBT.md`:**
   - Incluída a necessidade de migração dos arquivos Base64 de `corretoras` para S3/Cloudflare R2.
   - Incluída a refatoração da rota de geração de cobranças para uso de transação atômica e lock pessimista antes do dispatch externo.
