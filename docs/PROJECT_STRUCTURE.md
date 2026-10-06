# Estrutura do Projeto — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Mapeamento exato de todos os diretórios e arquivos arquiteturalmente relevantes.

---

## 1. Visão Geral da Árvore de Diretórios

O projeto segue a estrutura padrão do **Next.js App Router** com código de suporte em `src/`, migrações SQL em `db/` e utilitários de linha de comando em `scripts/`.

```
duolife-hub/
├── .agent/                    # Regras e contextos de operação do agente Antigravity
├── app/                       # Roteamento do Next.js (Páginas, Layouts e APIs)
├── db/                        # Migrações versionadas em SQL puro
├── public/                    # Ativos estáticos públicos (logos, imagens, favicons)
├── scripts/                   # Scripts CLI de manutenção, testes automatizados e migração
├── src/                       # Código-fonte da aplicação (Componentes, Hooks, Libs e Tipos)
├── Dockerfile                 # Imagem multi-estágio de produção (Node 22-Alpine)
├── docker-compose.yml         # Ambiente local de banco de dados PostgreSQL 16
├── next.config.ts             # Configuração do Next.js, Headers de Segurança e Turbopack
├── package.json               # Dependências e scripts de execução
├── proxy.ts                   # Middleware de borda (Autenticação JWT e RBAC)
└── tsconfig.json              # Configuração do compilador TypeScript
```

---

## 2. Detalhamento do Diretório `app/`

O diretório `app/` é subdividido em contextos bem delimitados:

### 2.1 Rotas Públicas e Institucionais
- `app/page.tsx`: Landing page principal da DuoLife com apresentação institucional, prova social e canais de contato.
- `app/(site)/`: Agrupamento de rotas com layout de cabeçalho e rodapé institucional:
  - `contato/page.tsx`: Formulário de contato e suporte direto.
  - `quem-somos/page.tsx`: Página institucional sobre a história e valores da DuoLife.
  - `seja-parceiro/page.tsx`: Formulário de captação de novos corretores e corretoras parceiras.
  - `solucoes/page.tsx`: Catálogo descritivo dos ramos de seguros oferecidos.
  - `unidades/page.tsx`: Localização física e endereços de atendimento.

### 2.2 Autenticação e Recuperação de Senha
- `app/login/page.tsx` & `_client.tsx`: Tela de autenticação unificada para operadores administrativos, corretores e gestores.
- `app/login/esqueci-a-senha/page.tsx`: Solicitação de link de redefinição de senha com envio de e-mail.
- `app/login/redefinir-senha/page.tsx`: Formulário de definição de nova senha mediante validação de token seguro.

### 2.3 Auto-Contratação White-Label
- `app/contratar/page.tsx`: Entrada pública que valida parâmetros de indicação (`?ref=...`) ou cookie de sessão.
- `app/contratar/[token]/page.tsx` & `_client.tsx`: Experiência completa de auto-contratação do cliente final, hidratando a identidade visual da corretora parceira e as condições comerciais fixadas pelo link.

### 2.4 Portal do Parceiro / Corretor (`app/portal/`)
- `layout.tsx`: Layout mestre protegido por `verifyPartnerAuth()`, provendo a casca de navegação (`PortalShell`).
- `page.tsx`: Dashboard executivo do corretor com KPIs de produção, volume faturado e links rápidos.
- `cotacoes/`:
  - `page.tsx`: Listagem com filtros avançados, paginação e status da proposta.
  - `nova/page.tsx`: Início de nova esteira de cotação com seleção de ramo e planos.
  - `[id]/page.tsx`: Detalhes completos da cotação, dados do proponente, minutas ZapSign e faturas Asaas.
- `vendas/`:
  - `page.tsx`: Relação de apólices ativas e vendas concluídas.
  - `[id]/page.tsx`: Detalhes da venda, número de apólice e comissão gerada.
- `clientes/`:
  - `page.tsx`: Carteira de segurados com visualização híbrida (tabela desktop e cards mobile).
  - `[id]/page.tsx`: Ficha cadastral detalhada do cliente, histórico de propostas e parcelas.
- `equipe/page.tsx` & `_client.tsx`: Área de gestão de força de vendas subordinada (exclusiva para gestores).
- `perfil/page.tsx`: Gestão de dados cadastrais do parceiro, logo e alteração de senha.
- `comissoes/page.tsx`: Extrato financeiro de comissões calculadas.

### 2.5 Painel Administrativo Central (`app/admin/`)
- `layout.tsx`: Layout administrativo protegido por `verifyAdminAuth()`, provendo a casca corporativa (`AdminShell`).
- `page.tsx`: Visão geral da operação nacional com filtro de período mensal ou customizado.
- `cotacoes/`, `vendas/`, `clientes/`: Gestão global sem barreiras de tenant.
- `parceiros/page.tsx` & `[id]/page.tsx`: Credenciamento, configuração de comissões e gestão de corretores.
- `corretoras/page.tsx` & `[id]/page.tsx`: Cadastro de Corretoras Master com gestão de 4 documentos regulatórios obrigatórios.
- `relatorios/page.tsx`: Consolidação executiva de faturamento, cancelamentos e pendências.
- `sync/page.tsx`: Central de sincronizações bidirecionais (Wix, ZapSign e Asaas).
- `ranking/page.tsx`: Ranking oficial de produção e premiações da rede de corretores.
- `produtos/page.tsx`: Manutenção de catálogo de produtos, faixas de preço e cupons.
- `emails/page.tsx`: Editor visual e parametrização de templates transacionais.
- `gatilhos/page.tsx`: Gerenciador de eventos e árvores de decisão automatizadas.
- `auditoria-webhooks/page.tsx`: Central de monitoramento e reprocessamento de webhooks.
- `auditoria-emails/page.tsx`: Rastreamento de entregabilidade e logs de disparos SMTP.
- `comparativo-wix/page.tsx`: Ferramenta técnica para conciliação com bancos legados (dev-only).
- `importar-csv/page.tsx`: Assistente de importação em lote com drag-and-drop de arquivos (dev-only).
- `chaves-api/page.tsx`: Gestão de tokens de integração e parametrizações globais do sistema.

### 2.6 Endpoints de API (`app/api/`)
- `auth/*`: Login, logout, sessão atual (`me`), recuperação e renovação de refresh tokens.
- `admin/*`: Operações exclusivas dos operadores internos da DuoLife.
- `portal/*`: Ações operacionais do parceiro (geração de contrato, emissão de cobrança, gestão de equipe).
- `webhook/*`: Receptores externos de eventos:
  - `asaas/route.ts`: Notificações de pagamento e compensação bancária.
  - `zapsign/route.ts`: Eventos de assinatura de minutas contratuais.
  - `wix/route.ts`: Notificações de novos leads originados no site externo.
- `public/*`: Resolução de tokens públicos de contratação.
- `cron/lifecycle/route.ts`: Gatilho seguro para o agendador de ciclo de vida e inadimplência.
- `health/route.ts`: Endpoint de telemetria de saúde (Docker/Coolify).

---

## 3. Detalhamento do Diretório `src/lib/` (Núcleo de Negócio)

Este diretório concentra as regras de negócio e os serviços compartilhados:

| Arquivo / Subdiretório | Responsabilidade de Domínio |
|---|---|
| `access.ts` | Regras de autorização por tenant e resolução de cotações acessíveis por usuário. |
| `admin-reporting.ts` | Consultas analíticas consolidadas e CTEs para o dashboard administrativo. |
| `asaas-charges.ts` | Cliente de integração direta com a API REST v3 do gateway Asaas. |
| `asaas-service.ts` | Criação de clientes, faturas e parcelamentos no Asaas para cotações. |
| `asaas-sync.ts` | Reconciliação bancária em lote e rotinas de prevenção de anacronismo. |
| `atuacao.ts` | Parser e sanitizador de especialidades jurídicas e áreas de atuação. |
| `auth.ts` | Utilitários de verificação de sessão JWT e extração de contexto de acesso. |
| `business-days.ts` | Cálculo de prazos de vencimento em dias úteis ignorando finais de semana e feriados nacionais. |
| `corretora-resolver.ts`| Resolução de dados e identidade visual da Corretora Master vinculada à proposta. |
| `cotacao-status.ts` | Normalização e máquina de estados das propostas comerciais. |
| `csv-import.ts` | Motor de processamento em lotes de 50 registros para importação de CSVs legados. |
| `csv-parser.ts` | Parser RFC 4180 puro sem dependências nativas de SO (compatível com navegador). |
| `documento.ts` | Validações matemáticas estritas de CPF e CNPJ (cálculo de dígitos verificadores). |
| `email-service.ts` | Renderizador de templates de e-mail com interpolação de variáveis e escape HTML. |
| `format.ts` | Formatadores canônicos para moeda (BRL), percentual, datas BR e máscaras de documentos. |
| `insurance-ops.ts` | Transações de emissão de apólices em `sales` e cálculo de comissões com lock `FOR UPDATE`. |
| `lifecycle-service.ts` | Motor da régua de renovação (D-60 a D-0) e inadimplência (D-3 a D+15). |
| `logger.ts` | Logger estruturado instanciado via biblioteca Pino. |
| `mailer.ts` | Camada de transporte de e-mails (Net4Life Info API com fallback para Nodemailer SMTP). |
| `password-reset.ts` | Criação e validação de tokens temporários de redefinição de senha com hash SHA-256. |
| `pdf-contract-generator.ts`| Renderizador de contratos em PDF vetorial com auto-wrap e âncoras para ZapSign. |
| `pg.ts` | Cliente singleton de conexão com o banco de dados via driver `postgres` (Porsager). |
| `pricing.ts` | Motor matemático de precificação, juros de parcelamento e travas de desconto manual. |
| `rate-limit.ts` | Limitador de taxa de requisições por IP e chave em memória. |
| `referral.ts` | Resolução hierárquica de origens de venda (token público, Wix code, slug). |
| `refresh-token.ts` | Criação, rotação e revogação de tokens de longa duração (30 dias). |
| `roles.ts` | Predicados de validação isolada para os 10 papéis de usuário do sistema. |
| `schema.ts` | Definição estrutural de DDL em runtime e validação de catálogo de tabelas. |
| `secrets.ts` | Leitor seguro de segredos de ambiente com validação defensiva contra valores vazios. |
| `system-settings.ts` | Leitura e gravação de parâmetros globais na tabela `system_settings`. |
| `webhook-auth.ts` | Comparação em tempo constante (`timingSafeEqual`) de segredos de webhook. |
| `webhook-processor.ts` | Motor centralizado de ingestão, normalização defensiva e reprocessamento de webhooks. |
| `wix-client.ts` | Cliente HTTP para consumo da Wix Data API v2 com controle de timeout. |
| `wix-sales-sync.ts` | Sincronização de vendas históricas e faturas legadas originadas no Wix. |
| `zapsign-direct-docs.ts`| Envio direto de arquivos PDF e configuração da esteira sequencial de dupla assinatura. |
| `product-schemas/` | Schemas Zod declarativos divididos por ramos de seguro (Advogados, Médicos, etc.). |
| `triggers/` | Motor de regras de eventos e avaliação de nós de árvores de decisão (`engine.ts`). |

---

## 4. Detalhamento dos Componentes (`src/components/`)

- `src/components/portal/DynamicCotacaoForm.tsx`: Componente mestre da esteira de cotação em 6 etapas.
- `src/components/portal/DescontoDrawer.tsx`: Gaveta lateral interativa para simulação e aplicação de descontos autorizados.
- `src/components/portal/ClienteSearchSelector.tsx`: Seletor de busca com autocompletar para segurados existentes.
- `src/components/admin/AdminShell.tsx`: Casca corporativa com navegação lateral, submenus de desenvolvimento e drawer mobile.
- `src/components/portal/PortalShell.tsx`: Casca do portal do corretor com perfil, dados da corretora mãe e navegação adaptativa.
- `src/components/ui/TableScrollContainer.tsx`: Contêiner de rolagem horizontal isolada a 120fps via aceleração por hardware (GPU).
- `src/components/ui/toast/`: Sistema próprio de alertas temporários e notificações de feedback visual.

---

## 5. Diretório `db/migrations/` e `scripts/`

- `db/migrations/`: Conjunto de 20 arquivos SQL sequenciais (`001-product-catalog.sql` a `020-add-expanded-corretora-fields.sql`) aplicados na inicialização do contêiner via `scripts/migrate.mjs`.
- `scripts/`:
  - `migrate.mjs`: Executor transacional das migrações SQL com rastreamento na tabela `schema_migrations`.
  - `dev-clean.mjs` & `dev-clean.sh`: Detecta e finaliza processos zumbis na porta 3000 antes de iniciar o Next.js.
  - `test-cotacao-schema-resilience.ts`: Suíte de validação de resiliência e integridade do endpoint de cotações.
  - `test-dashboard-partner-period.ts`: Testes automatizados das consultas analíticas com filtros temporais.
  - `gerar-contratos-teste-usuario.ts`: Script utilitário para renderização local e inspeção visual de PDFs.
