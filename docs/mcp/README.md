# DuoLife Hub — Camada MCP (Model Context Protocol) para Vendas Assistidas por IA

> **Status:** Documentação de Engenharia (Fase 1)  
> **Versão da Camada MCP:** 1.0.0  
> **Data de Homologação:** Outubro de 2026  
> **Público-Alvo:** Engenheiros de Software, Integradores de IA e Operadores de Vendas via WhatsApp.

---

## 1. Visão Geral

A camada **MCP (Model Context Protocol)** do DuoLife Hub é uma interface padronizada, segura e orientada a contratos que capacita agentes autônomos de Inteligência Artificial — atuando em canais conversacionais como o WhatsApp — a conduzir propostas comerciais assistidas de seguros de Responsabilidade Civil (RC).

A solução foi projetada sob o princípio de menor privilégio e isolamento absoluto entre **conversa** e **decisão negocial**:
- **A IA conversa com o proponente:** acolhe o cliente, interpreta a linguagem natural, extrai respostas factuais e transmite orientações amigáveis.
- **O DUOLife decide:** calcula preços, aplica tabelas atuariais, valida documentos, avalia risco de underwriting, emite minutas com dupla assinatura e gera cobranças financeiras exclusivamente por serviços server-side determinísticos.

---

## 2. Princípio Arquitetural Fundamental

```
┌──────────────────────────────────────────────────────────┐
│                      A IA CONVERSA                       │
│      (Extração de intenção, acolhimento, diálogo)        │
└────────────────────────────┬─────────────────────────────┘
                             │ Tools RPC Estritas
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     O DUOLIFE DECIDE                     │
│  (Pricing, Underwriting, Regras SUSEP, ZapSign, Asaas)   │
└──────────────────────────────────────────────────────────┘
```

A IA operando no WhatsApp **NUNCA** pode definir ou alterar:
1. Preço de tabela ou prêmio final.
2. Franquia obrigatória ou coberturas contratuais.
3. Quantidade máxima de parcelas ou acréscimo financeiro.
4. Concessão de desconto comercial fora da parametrização autorizada no backend.
5. Aprovação subjetiva de underwriting ou dispensa de questionário de risco.
6. Status de pagamento ou confirmação manual de recebimento.
7. Emissão de apólice de seguro.

Todo valor financeiro e decisão jurídica é computado deterministicamente pelo motor do backend do DuoLife Hub (`src/lib/pricing.ts`, `src/lib/insurance-ops.ts`, `src/lib/product-schemas/`).

---

## 3. Escopo Inicial de Produtos Homologados

A camada MCP suporta inicialmente todo o catálogo de Responsabilidade Civil Profissional disponível na plataforma:

1. **RC Advogados** (`rc-advogados` / `RC-ADV-001` / `prod-rc-001`): planos de R$ 100k a R$ 500k, registro na OAB, questionário declarativo simplificado ou completo.
2. **RC Médicos** (`rc-medicos` / `RC-MED-001`): planos de R$ 100k a R$ 500k, CRM/UF, RQE, especialidades clínicas e cirúrgicas.
3. **RC Odontologia** (`rc-odonto` / `RC-ODONTO-001`): planos de R$ 100k a R$ 500k, CRO/UF, áreas de ortodontia, implantodontia e harmonização.
4. **RC Engenharia** (`rc-engenheiros` / `RC-ENG-001`): planos de R$ 100k a R$ 500k, CREA/CAU/UF, ART/RRT, projetos estruturais e obras.
5. **RC Contadores** (`rc-contadores` / `RC-CONT-001`): planos de R$ 100k a R$ 500k, CRC/UF, escrita fiscal, folha e obrigações acessórias.

A arquitetura utiliza o catálogo declarativo `src/lib/product-schemas/` (`RAMOS_REGISTRY`), estando 100% preparada para novos produtos (ex: D&O Executivos) sem alteração de código na camada MCP.

---

## 4. Índice da Documentação de Engenharia

Para consultar a especificação completa de cada pilar da camada MCP:

- [Arquitetura Geral & Componentes (`docs/mcp/ARCHITECTURE.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/ARCHITECTURE.md)
- [Catálogo de Tools MCP & Contratos JSON (`docs/mcp/TOOLS.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/TOOLS.md)
- [Fluxo de Venda & Máquina de Estados (`docs/mcp/SALES_FLOW.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/SALES_FLOW.md)
- [Postura de Segurança, Sanitização & Prompt Injection (`docs/mcp/SECURITY.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/SECURITY.md)
- [Autenticação Server-to-Server & Scopes (`docs/mcp/AUTHENTICATION.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/AUTHENTICATION.md)
- [Modelo de Dados & Migrações SQL (`docs/mcp/DATA_MODEL.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/DATA_MODEL.md)
- [Catálogo Estruturado de Erros (`docs/mcp/ERRORS.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/ERRORS.md)
- [Estratégia de Testes Automatizados (`docs/mcp/TESTING.md`)](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/mcp/TESTING.md)
