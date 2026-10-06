# Arquitetura do Sistema — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Arquitetura real implementada no ecossistema DuoLife Hub.

---

## 1. Visão Geral da Arquitetura

O **DuoLife Hub** adota o padrão arquitetural de **Monólito Modular Moderno** construído sobre o framework **Next.js (App Router)** com execução no runtime Node.js v22. A aplicação consolida em um único repositório a interface pública de conversão, os portais operacionais autenticados (Admin e Parceiros), a camada de serviços de domínio e os endpoints de API RESTful que orquestram os gateways e integrações de terceiros.

A persistência de dados é centralizada em uma instância dedicada do **PostgreSQL 16**, acessada por meio de conexão nativa de alto desempenho via biblioteca `postgres` (Porsager) com suporte nativo a transações atômicas e consultas tipadas com *tagged template literals*.

---

## 2. Diagramas C4

### 2.1 Diagrama de Contexto de Sistema (C4 — Nível 1)

```mermaid
flowchart TB
    subgraph Atores ["Usuários do Sistema"]
        Cliente["Cliente / Proponente Segurado"]
        Corretor["Corretor de Seguros / Parceiro"]
        Admin["Equipe Interna DuoLife"]
    end

    subgraph DuoLifeHubSystem ["DuoLife Hub (Sistema Central)"]
        DuoLife["Plataforma DuoLife Hub\n(Next.js / TypeScript / Node.js 22)"]
    end

    subgraph SistemasExternos ["Sistemas & Serviços Externos"]
        WixAPI["Wix Data API v2\n(Catálogo de Planos & Espelho)"]
        ZapSignAPI["ZapSign API\n(Assinatura Eletrônica Avançada)"]
        AsaasAPI["Asaas Gateway v3\n(Cobranças PIX, Boleto e Cartão)"]
        EmailService["Net4Life Info / Nodemailer\n(Disparos de E-mail Transacionais)"]
        ViaCEPAPI["ViaCEP / BrasilAPI\n(Consulta de CEP e Endereços)"]
    end

    Cliente -->|Acessa Link Público / Assina / Paga| DuoLife
    Corretor -->|Simula / Emite Proposta / Gere Clientes| DuoLife
    Admin -->|Gerencia Corretoras / Sincronizações / Auditoria| DuoLife

    DuoLife -->|Consulta Catálogo & Leads| WixAPI
    DuoLife -->|Gera Minutas & Envia Assinaturas| ZapSignAPI
    ZapSignAPI -->|Notifica Assinatura (Webhook)| DuoLife
    DuoLife -->|Gera Faturas & Parcelamentos| AsaasAPI
    AsaasAPI -->|Notifica Liquidação (Webhook)| DuoLife
    DuoLife -->|Dispara Propostas & Cobranças| EmailService
    DuoLife -->|Autocompleta Endereço| ViaCEPAPI
```

---

### 2.2 Diagrama de Contêineres (C4 — Nível 2)

```mermaid
flowchart TB
    subgraph Browser ["Navegador do Usuário (Cliente Web)"]
        ReactUI["React 19 SPA (Client Components)\nFormulários Dinâmicos / Lucide / Tailwind 4"]
    end

    subgraph NextServer ["Servidor de Aplicação Next.js (Node.js 22-Alpine)"]
        EdgeProxy["Middleware / proxy.ts\n(JWT Guard & Bypass de Token Público)"]
        
        subgraph ServerComponents ["Camada de Apresentação & SSR"]
            PagesAdmin["Admin Shell & Páginas (/admin/*)"]
            PagesPortal["Portal Shell & Páginas (/portal/*)"]
            PagesPublic["Landing Pages & (/contratar/*)"]
        end

        subgraph APIRoutes ["Camada de API & Route Handlers (/api/*)"]
            AuthRoutes["/api/auth/*"]
            AdminRoutes["/api/admin/*"]
            PortalRoutes["/api/portal/*"]
            WebhookRoutes["/api/webhook/* (Asaas, ZapSign, Wix)"]
            CronRoutes["/api/cron/lifecycle"]
        end

        subgraph CoreServices ["Módulos de Domínio e Serviços (src/lib/*)"]
            PricingModule["pricing.ts\n(Motor de Precificação & Descontos)"]
            InsuranceOpsModule["insurance-ops.ts\n(Emissão de Apólice & Locks)"]
            PdfGeneratorModule["pdf-contract-generator.ts\n(Renderizador Vetorial pdf-lib)"]
            AsaasSyncModule["asaas-sync.ts & asaas-charges.ts\n(Conciliação Financeira)"]
            ZapSignDocsModule["zapsign-direct-docs.ts\n(Dupla Assinatura Eletrônica)"]
            WebhookProcessor["webhook-processor.ts\n(Idempotência & Reprocessamento)"]
            LifecycleService["lifecycle-service.ts\n(Régua de Relacionamento)"]
            DbClient["pg.ts\n(Driver postgres singleton pool max: 10)"]
        end
    end

    subgraph DatabaseLayer ["Camada de Banco de Dados"]
        PostgresDB[(PostgreSQL 16 Dedicado\n35 Tabelas Relacionais)]
    end

    Browser -->|HTTP HTTPS / Cookies HttpOnly| EdgeProxy
    EdgeProxy --> ServerComponents
    EdgeProxy --> APIRoutes

    ServerComponents --> CoreServices
    APIRoutes --> CoreServices

    CoreServices --> DbClient
    DbClient -->|TCP Porta 5432 / SQL Parametrizado| PostgresDB
```

---

## 3. Fluxo de Execução das Principais Operações

O diagrama de sequência abaixo demonstra o fluxo completo de uma contratação, desde o início da proposta pelo corretor até a aprovação bancária e emissão da apólice definitiva:

```mermaid
sequenceDiagram
    autonumber
    actor Corretor as Corretor no Portal
    participant API as DuoLife API (/api)
    participant Engine as pricing.ts & insurance-ops.ts
    participant DB as PostgreSQL
    participant ZapSign as ZapSign API
    actor Cliente as Cliente Segurado
    participant Asaas as Asaas API
    participant Webhook as /api/webhook/asaas

    Corretor->>API: POST /api/cotacoes (Dados do segurado, plano e parcelas)
    API->>Engine: calcularPrecoServidor(tipoDePlano, parcelas, cupom)
    Engine-->>API: Preço oficial validado (Desconto máximo 40%)
    API->>DB: INSERT INTO cotacoes (status: 'rascunho')
    API-->>Corretor: Retorna ID da cotação

    Corretor->>API: POST /api/portal/cotacoes/[id]/gerar-contrato
    API->>Engine: renderContratoPdf (Gera PDF vetorial com âncoras invisíveis)
    API->>ZapSign: POST /docs/ (Submete PDF com 2 signatários em ordem sequencial)
    ZapSign-->>API: Retorna doc_token e signUrls individuais
    API->>DB: INSERT INTO signature_documents & UPDATE cotacoes (status: 'contrato_gerado')
    API-->>Corretor: Retorna link ZapSign da Corretora

    Note over Corretor,ZapSign: 1º Signatário (Corretora) assina eletronicamente o contrato
    Note over Cliente,ZapSign: ZapSign notifica e 2º Signatário (Cliente) assina o contrato

    ZapSign->>API: POST /api/webhook/zapsign (Evento: doc_signed)
    API->>DB: UPDATE signature_documents (status: 'signed')
    API->>Asaas: POST /customers & POST /payments (Gera PIX / Boleto ou Carnê)
    Asaas-->>API: Retorna checkoutId, invoiceUrl e pixQrCode
    API->>DB: INSERT INTO payment_orders & payment_installments
    API->>DB: UPDATE cotacoes (status: 'pagamento_gerado')

    Cliente->>Asaas: Efetua pagamento via PIX ou Boleto
    Asaas->>Webhook: POST /api/webhook/asaas (PAYMENT_RECEIVED)
    Webhook->>DB: INSERT INTO webhook_events (Valida token timingSafeEqual)
    Webhook->>Engine: ensureSaleForPaidQuote (Lock FOR UPDATE na cotação)
    Engine->>DB: INSERT INTO sales (Emite Apólice 'POL-YYYY-XXXXX')
    Engine->>DB: INSERT INTO commissions (Comissão da Corretora / Parceiro)
    Engine->>DB: UPDATE cotacoes (status: 'aprovada')
    Webhook-->>Asaas: Retorna HTTP 200 OK
```

---

## 4. Detalhamento dos Componentes Arquiteturais

### 4.1 Frontend e Camada de Interface
- **Next.js 16 (App Router):** Roteamento baseado em pastas com separação estrutural entre rotas públicas `(site)`, auto-contratação `/contratar/[token]`, portal autenticado do parceiro `/portal` e administração geral `/admin`.
- **Server Components por Padrão:** Todas as páginas realizam checagem de perfil e busca inicial de dados diretamente no servidor (`async Page()`), enviando apenas o HTML hidratado e JSON serializado ao navegador, maximizando a segurança contra exposição de queries.
- **Client Components (`'use client'`):** Utilizados pontualmente para formulários dinâmicos (`DynamicCotacaoForm.tsx`), gavetas interativas (`DescontoDrawer.tsx`), seletores de busca com debounce (`ClienteSearchSelector.tsx`) e componentes de tabela com ordenação e filtros em tempo real.
- **Design System Light Mode Estrito:** Cores fixadas em tokens no `globals.css` (`--surface: #f7faf9; --primary: #0e4a5a; --accent: #00d4e0;`). Bloqueio intencional de modo escuro via `color-scheme: light;`.

### 4.2 Backend e Serviços de Domínio
- **Motor de Precificação (`src/lib/pricing.ts`):** Centraliza o cálculo matemático de parcelamento, juros progressivos, deduções e aplicação de cupons. Bloqueia sumariamente valores alterados no client-side.
- **Operações de Seguro & Concorrência (`src/lib/insurance-ops.ts`):** Executa transações ACID via `sql.begin(async tx => ...)`. Utiliza `SELECT ... FOR UPDATE` para impedir que webhooks financeiros concorrentes gerem apólices duplicadas.
- **Gerador de Minutas em PDF (`src/lib/pdf-contract-generator.ts`):** Renderiza documentos em formato PDF puro no padrão gráfico institucional sem depender de navegadores headless (Puppeteer/Chromium), garantindo que a geração ocorra em menos de 100ms por minuta.
- **Processador Central de Webhooks (`src/lib/webhook-processor.ts`):** Decodifica payloads com parser defensivo contra double-encoding, persiste cabeçalhos saneados, controla contadores de retentativa e permite reexecução manual em 1 clique pelo painel administrativo.

### 4.3 Camada de Dados e Persistência
- **Driver `postgres` (Porsager):** Implementação singleton com pool configurado para `max: 10`, `idle_timeout: 20` e `connect_timeout: 10`.
- **Modelagem Relacional Híbrida:** 35 tabelas estruturadas com integridade referencial por chaves estrangeiras, combinadas com colunas `JSONB` (`client_data`, `metadata`, `address`, `permissions`) para suportar flexibilidade dinâmica de dados específicos de cada categoria profissional sem necessidade de migrações DDL contínuas.

### 4.4 Infraestrutura e DevOps
- **Contêiner Docker:** Imagem multi-estágio (`node:22-alpine`) gerando uma imagem de produção enxuta sem dependências de desenvolvimento.
- **Coolify:** Orquestração de deploy contínuo em servidor VPS dedicado com monitoramento de integridade via endpoint `/api/health`.
- **PostgreSQL Dedicado:** Instância isolada no Coolify (`duolife-postgres`), eliminando riscos de contenção de recursos de bancos compartilhados.
