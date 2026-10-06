# Análise de Segurança & Postura Arquitetural — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Auditoria de segurança estática baseada na inspeção de 100% das rotas e serviços.

---

## 1. Postura Geral de Segurança

O DuoLife Hub adota boas práticas de segurança defensiva em suas camadas centrais, com forte proteção contra os principais riscos do OWASP Top 10 (especialmente Injeção de SQL, Quebra de Autenticação e IDOR). Contudo, foram identificadas vulnerabilidades arquiteturais relevantes no armazenamento de credenciais dinâmicas em banco e na ausência de limitadores de taxa em rotas de ingestão externa.

---

## 2. Matriz de Achados e Riscos de Segurança

| Identificador | Severidade | Classificação | Descrição do Risco | Impacto Potencial | Evidência no Código |
|---|:---:|:---:|---|---|---|
| **SEC-01** | **ALTO** | `Confirmado` | **Credenciais e Chaves de API armazenadas em texto plano na tabela `system_settings`** | Em caso de dump acidental, backup exposto ou invasão do banco de dados, chaves mestre de produção da Wix, Asaas e ZapSign são comprometidas. | `src/lib/system-settings.ts` e `app/api/admin/chaves-api` persistem tokens diretamente sem criptografia em repouso. |
| **SEC-02** | **ALTO** | `Confirmado` | **Ausência de Rate Limiting em rotas de Webhook e Cobrança** | Endpoints `/api/webhook/asaas`, `/api/webhook/zapsign`, `/api/webhook/wix` e `/api/portal/cotacoes/[id]/gerar-pagamento` não possuem limitação de taxa. | Susceptibilidade a ataques de flooding/DDoS ou abuso de chamadas que cobram créditos no gateway financeiro. |
| **SEC-03** | **MÉDIO** | `Confirmado` | **Rate Limiter implementado em Memória Local de Processo** | O limitador de taxa `src/lib/rate-limit.ts` armazena contadores em `Map` na memória do Node.js. Em clusters conteinerizados com réplicas no Coolify, o limite pode ser contornado alternando requisições entre réplicas. | Falta de consistência em escalonamento horizontal. Requer migração para Redis ou banco compartilhado. |
| **SEC-04** | **MÉDIO** | `Confirmado` | **Dimensionamento Fixo do Pool de Conexões (`max: 10`)** | O driver `postgres` em `src/lib/pg.ts` fixa o pool em 10 conexões ativas por processo Node.js sem multiplexação por PgBouncer. | Risco de saturação do pool e erros 504 Gateway Timeout durante concorrência de reconciliações financeiras em lote com múltiplos webhooks. |
| **SEC-05** | **BAIXO** | `Confirmado` | **Bypass Excessivo de Token Público no Middleware Edge** | O middleware `proxy.ts` libera todo o prefixo `/api/portal/*` caso o cabeçalho `x-public-token` esteja presente. | Endpoints administrativos de equipe dependem unicamente de seus handlers internos para barrar chamadas públicas. |
| **SEC-06** | **BAIXO** | `Confirmado` | **Variáveis de Link sem Escape em Templates de E-mail** | O compilador de templates `email-service.ts` não sanitiza variáveis cujo nome contenha `url` ou `link`. | Risco teórico de injeção de atributos HTML em clientes de e-mail caso uma URL manipulada contenha aspas não tratadas. |
| **SEC-07** | **INFORMATIVO** | `Confirmado` | **Scripts de Reparo de Valores (* 100) Executados no Boot** | `schema.ts` executa comandos SQL `UPDATE cotacoes` com varredura textual `ILIKE` a cada inicialização em desenvolvimento. | Risco de corromper propostas legítimas de alto valor contratadas no futuro. |
| **SEC-08** | **ALTO** | `Adversarial` | **Race Condition na Geração de Cobranças Asaas sem Lock Pessimista** | Cliques simultâneos ou retentativas paralelas chamam a API do Asaas gerando cobranças duplicadas ativas no gateway. | `app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts` e `src/lib/asaas-service.ts` (linhas 65-100) realizam `SELECT` sem transação nem `FOR UPDATE`. |
| **SEC-09** | **MÉDIO** | `Adversarial` | **Ausência de Helper Centralizado de Acesso Multi-tenant para Vendas e Clientes** | O helper `getAccessibleQuoteById` blinda apenas cotações. Vendas e clientes dependem de filtros manuais escritos ad-hoc em cada tela. | `src/lib/access.ts` contém exclusivamente a função para a entidade de cotação. |

---

## 3. Avaliação Técnica por Categoria OWASP

### 3.1 Injeção de SQL (SQLi): TOTALMENTE MITIGADA (SEGURO)
- **Diagnóstico:** O sistema utiliza a biblioteca `postgres` (Porsager) com tagged template literals (ex: `await sql`SELECT * FROM cotacoes WHERE id = ${id}``).
- **Evidência:** O driver trata todos os valores interpolados como parâmetros posicionais (`$1, $2, ...`) transmitidos no protocolo binário do PostgreSQL. Não foram identificadas concatenações manuais de strings de query ou chamadas inseguras a `sql.unsafe()` nas rotas ativas.

### 3.2 IDOR & Quebra de Controle de Acesso: PARCIALMENTE MITIGADO
- **Diagnóstico:** O controle de acesso a Cotações no Portal (`/api/portal/cotacoes/[id]/*`) executa `getAccessibleQuoteById` (`src/lib/access.ts`), validando com sucesso o tenant (`partner_id` ou `corretora_id`).
- **Limitação Crítica:** Não existe padronização arquitetural equivalente para as entidades `sales`, `commissions` e `insurance_clients`. O isolamento dessas entidades depende de cláusulas manuais `WHERE s.corretora_id = ...` em cada query Server Component.
- **Documentos de Corretora:** As rotas de download de documentos corporativos exigem `verifyAdminAuth()` e perfil de plataforma (`duolife_admin` ou `duolife_dev`), mas não checam se a corretora está ativa.

### 3.3 Autenticação de Webhooks e Prevenção de Ataques de Timing: EXCELENTE (SEGURO)
- **Diagnóstico:** A verificação de segredos compartilhados de webhooks (Asaas, ZapSign e Wix) é centralizada em `src/lib/webhook-auth.ts`.
- **Implementação:** A validação calcula hashes SHA-256 de tamanho fixo para as strings recebidas e esperadas, comparando-as por meio de `crypto.timingSafeEqual()`, eliminando qualquer vulnerabilidade a ataques de temporização (*timing attacks*).

### 3.4 Cross-Site Scripting (XSS) & Cabeçalhos HTTP: MUITO BOM (SEGURO)
- **Cabeçalhos de Segurança (`next.config.ts`):**
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy (CSP):` Restringe origens de script, estilo e conexões estritamente a fontes autorizadas (Cloudflare, Asaas, ZapSign, Wix, Google Fonts).
- **Proteção contra Clickjacking:** `frame-ancestors 'self'` impede o aninhamento da aplicação em iframes externos maliciosos.

### 3.5 Cross-Site Request Forgery (CSRF): MITIGADO (SEGURO)
- **Cookies de Sessão:** Definidos com `httpOnly: true`, `sameSite: 'lax'` e `secure: true` em produção.
- **APIs de Mutação:** Operam sob verbos POST/PATCH exigindo cabeçalhos `Content-Type: application/json`, o que impede submissões cegas via formulários HTML tradicionais.

---

## 4. Recomendações Prioritárias de Engenharia de Segurança

1. **Criptografia em Repouso de Segredos:**
   - Implementar uma camada de criptografia envelope utilizando AES-256-GCM com chave mestra no `.env` (`SETTINGS_ENCRYPTION_KEY`) para cifrar os valores sensíveis gravados na tabela `system_settings`.
2. **Rate Limiting nas Rotas Críticas:**
   - Adicionar limitadores de taxa estritos em `/api/webhook/*` (ex: 120 requisições/min por IP) e na rota `/api/portal/cotacoes/[id]/gerar-pagamento` (ex: 10 requisições/min por usuário).
3. **Restringir o Bypass de Middleware:**
   - Ajustar `proxy.ts` para permitir o cabeçalho `x-public-token` exclusivamente nas rotas necessárias para a auto-contratação (`/api/portal/cotacoes/[id]/gerar-contrato`, `/api/portal/cotacoes/[id]/gerar-pagamento`, `/api/portal/planos`).
