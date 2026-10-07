# Arquitetura da Camada MCP — DuoLife Hub

> **Status:** Especificação Técnica de Engenharia  
> **Classificação de Certeza:** Arquitetura oficial homologada para integração com agentes de IA.

---

## 1. Visão Geral da Arquitetura em Camadas

A arquitetura do servidor MCP adota o padrão de **Camadas Estritas (Layered Architecture)** com desacoplamento total entre o protocolo de transporte (JSON-RPC sobre HTTP/SSE) e a lógica de negócio do DuoLife Hub.

```
┌─────────────────────────────────────────────────────────────┐
│           Cliente MCP Externo (Agente WhatsApp / IA)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP POST / SSE (/api/mcp)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Transport / Controller                │
│    (Parse JSON-RPC 2.0, Autenticação Bearer, Rate Limit)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ DTOs Validados (Zod)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Application Services                  │
│       • McpSalesService           • McpProductService       │
│       • McpUnderwritingService    • McpAuditService         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Chamadas de Funções Tipadas
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DuoLife Domain Services                  │
│       • pricing.ts (Cálculo atuarial & parcelamento)        │
│       • insurance-ops.ts (Locks & emissão de apólices)      │
│       • product-schemas/ (Catálogo declarativo e regras)    │
│       • zapsign-direct-docs.ts (Minutas PDF e assinaturas)  │
│       • asaas-service.ts (Faturas, PIX e reconciliação)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ SQL Parametrizado (Tagged Templates)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               PostgreSQL 16 & Gateways Externos             │
│    (Tabelas: ai_sales_sessions, mcp_audit_logs, cotacoes)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Princípios de Isolamento e Segurança

1. **Sem Acesso Genérico ao Banco:** Nenhuma tool MCP aceita comandos SQL, nomes arbitrários de tabelas ou cláusulas de filtro genéricas. Acesso a dados é feito estritamente via repositórios de domínio encapsulados.
2. **Sem Execução Arbitrária de Código:** Nenhuma tool avalia código JavaScript ou invoca comandos de shell.
3. **Sem SSRF (Server-Side Request Forgery):** Nenhuma tool recebe URLs arbitrárias do cliente para download ou chamada remota.
4. **Isolamento de Tenant e Canal:** Toda sessão de venda está vinculada ao canal emissor e às credenciais do cliente MCP autenticado.
5. **Auditoria Integral:** Cada invocação de tool é registrada na tabela `mcp_audit_logs` com medição de latência e mascaramento automático de dados sensíveis (LGPD).

---

## 3. Diagrama de Sequência — Ciclo de Vida da Sessão Comercial

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente (WhatsApp)
    participant IA as Agente IA (MCP Client)
    participant MCP as Camada MCP (/api/mcp)
    participant AppSvc as McpSalesService
    participant Domain as pricing.ts / insurance-ops.ts
    participant DB as PostgreSQL 16
    participant ZapSign as ZapSign API
    participant Asaas as Asaas API

    Cliente->>IA: "Olá, sou advogado e quero cotar seguro RC"
    IA->>MCP: insurance_list_products()
    MCP-->>IA: Lista produtos disponíveis (RC Advogados, etc.)

    IA->>MCP: sales_start(channel: 'whatsapp', phone: '48999999999', flowKey: 'rc-advogados')
    MCP->>AppSvc: Criar ou recuperar sessão (idempotência)
    AppSvc->>DB: INSERT / SELECT ai_sales_sessions
    MCP-->>IA: { saleSessionId: 'sess-123', status: 'collecting_data', next: 'plano' }

    IA->>MCP: quote_simulate(saleSessionId: 'sess-123', plan: '300k', installments: 6)
    MCP->>Domain: calcularPrecoServidor(...)
    Domain-->>MCP: Preço recalculado oficialmente no servidor
    MCP-->>IA: Valores oficiais (Total R$ 1.845,50 em 6x de R$ 307,58)

    loop Coleta Determinística de Dados
        IA->>MCP: sales_next_step(saleSessionId: 'sess-123')
        MCP-->>IA: { next: { field: 'cpfCnpj', type: 'cpf_cnpj', label: 'CPF' } }
        Cliente->>IA: "Meu CPF é 123.456.789-01"
        IA->>MCP: sales_update(saleSessionId: 'sess-123', data: { cpfCnpj: '12345678901' })
        MCP->>AppSvc: Valida Zod e persiste em collected_data
    end

    IA->>MCP: quote_confirm(saleSessionId: 'sess-123')
    MCP->>AppSvc: Valida underwriting e cria cotacao oficial
    AppSvc->>DB: INSERT INTO cotacoes (...)
    MCP-->>IA: { cotacaoId: 'cot-999', status: 'quoted' }

    IA->>MCP: contract_create(saleSessionId: 'sess-123')
    MCP->>Domain: gerarContratoPdfBuffer() + criarDocumentoZapSignDireto()
    Domain->>ZapSign: Envia minuta com âncoras {{assinatura_corretora}} e {{assinatura_proponente}}
    ZapSign-->>Domain: Retorna docToken e signUrl
    MCP-->>IA: { signUrl: 'https://app.zapsign.com.br/verificar/...' }
    IA->>Cliente: "Por favor, assine o contrato no link abaixo..."

    Note over Cliente,ZapSign: Corretora e Cliente assinam na ZapSign
    Note over MCP,Asaas: Webhook do ZapSign ou tool contract_status confirma assinatura

    IA->>MCP: payment_get(saleSessionId: 'sess-123')
    MCP->>Domain: generateAsaasPaymentForQuote()
    Domain->>Asaas: Gera PIX / Boleto
    MCP-->>IA: { pixQrCode: '...', bankSlipUrl: '...', invoiceUrl: '...' }
    IA->>Cliente: "Aqui está o seu PIX Copia e Cola para pagamento..."
```

---

## 4. Integração com Serviços de Domínio Existentes

A camada MCP reutiliza estritamente os serviços de domínio consolidados:

| Domínio | Serviço Reutilizado | Garantia Arquitetural |
|---|---|---|
| **Precificação** | `src/lib/pricing.ts` (`calcularPrecoServidor`) | Recálculo obrigatório no servidor. Desconto manual travado em no máximo 40%. Bloqueio de parcelamento em planos 100k. |
| **Emissão de Apólice** | `src/lib/insurance-ops.ts` (`ensureSaleForPaidQuote`) | Lock pessimista `FOR UPDATE`. Cálculo de IOF 7,38% e comissões do parceiro. |
| **Geração de Minutas** | `src/lib/pdf-contract-generator.ts` + `zapsign-direct-docs.ts` | Geração em PDF puro com âncoras invisíveis. Dupla assinatura ordenada. |
| **Gateway Financeiro** | `src/lib/asaas-service.ts` (`generateAsaasPaymentForQuote`) | Emissão exclusivamente após assinatura válida. Prevenção de anacronismo e deduplicação de carnês. |
| **Catálogo Declarativo** | `src/lib/product-schemas/` (`RAMOS_REGISTRY`) | Schemas Zod, questionários de risco e regras de validação por especialidade profissional. |
