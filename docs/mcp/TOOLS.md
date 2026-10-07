# Catálogo de Tools MCP — DuoLife Hub

> **Status:** Especificação Oficial de Contratos de API MCP  
> **Protocolo:** Model Context Protocol (MCP) v1.x / JSON-RPC 2.0  
> **Público-Alvo:** Desenvolvedores de Agentes e Sistemas Integradores.

---

## 1. Visão Geral

Este documento define os contratos de entrada e saída das **12 tools MCP** disponibilizadas pelo servidor DuoLife. Cada tool é validada no backend via esquemas estritos do Zod antes de qualquer processamento negocial.

---

## 2. Inventário de Tools

### 2.1 `insurance_list_products`
Retorna a lista de produtos securitários homologados e habilitados para venda assistida por IA.

- **Escopo Exigido:** `insurance:catalog:read`
- **Idempotência:** Leitura segura (Safe/Idempotent).
- **Parâmetros de Entrada:**
  ```json
  {}
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "products": [
      {
        "productId": "prod-rc-001",
        "flowKey": "rc-advogados",
        "name": "RC Profissional — Advogados & Escritórios",
        "shortName": "RC Advogados",
        "targetAudience": "Advogados autônomos e sociedades de advogados",
        "available": true
      },
      {
        "productId": "prod-rc-med-001",
        "flowKey": "rc-medicos",
        "name": "RC Profissional — Médicos",
        "shortName": "RC Médicos",
        "targetAudience": "Médicos e clínicas médicas",
        "available": true
      }
    ]
  }
  ```

---

### 2.2 `insurance_get_product`
Retorna a estrutura completa de um produto ou ramo, incluindo faixas de cobertura, planos, franquias, limites de parcelamento, conselho profissional exigido e questionário de risco.

- **Escopo Exigido:** `insurance:catalog:read`
- **Idempotência:** Leitura segura.
- **Parâmetros de Entrada:**
  ```json
  {
    "productId": "prod-rc-001",
    "flowKey": "rc-advogados"
  }
  ```
  *(Pelo menos um dos dois deve ser fornecido)*.
- **Resposta de Sucesso:**
  ```json
  {
    "productId": "prod-rc-001",
    "flowKey": "rc-advogados",
    "name": "RC Profissional — Advogados & Escritórios",
    "shortName": "RC Advogados",
    "targetAudience": "Advogados autônomos e sociedades de advogados",
    "policyPrefix": "DL-RC-ADV",
    "registroProfissional": {
      "key": "oab",
      "label": "Número de Inscrição na OAB",
      "required": true
    },
    "maxInstallments": 6,
    "hasUnderwriting": true,
    "planos": [
      {
        "tipoDePlano": "100k",
        "nome": "Plano 100k Essencial",
        "cobertura": "R$ 100.000,00",
        "franquia": "Isento",
        "maxParcelas": 1,
        "valorBase": 720.00
      },
      {
        "tipoDePlano": "300k",
        "nome": "Plano 300k Intermediário",
        "cobertura": "R$ 300.000,00",
        "franquia": "R$ 5.000,00",
        "maxParcelas": 6,
        "valorBase": 1845.50
      }
    ],
    "especialidades": [
      { "key": "civel", "label": "Direito Cível" },
      { "key": "trabalhista", "label": "Direito Trabalhista" }
    ]
  }
  ```

---

### 2.3 `sales_start`
Inicia ou recupera de forma idempotente uma sessão comercial no canal indicado.

- **Escopo Exigido:** `insurance:sale:create`
- **Idempotência:** Idempotente por par `(channel, externalConversationId)`.
- **Parâmetros de Entrada:**
  ```json
  {
    "channel": "whatsapp",
    "externalConversationId": "wa-5548999999999",
    "externalCustomerId": "cust-001",
    "phone": "48999999999",
    "flowKey": "rc-advogados",
    "productId": "prod-rc-001"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "collecting_data",
    "flowKey": "rc-advogados",
    "resumed": false,
    "nextStep": {
      "field": "tipoDePlano",
      "label": "Plano de Cobertura Desejado",
      "type": "select"
    }
  }
  ```

---

### 2.4 `sales_update`
Atualiza os dados cadastrais, atuariais ou respostas do questionário coletadas durante a conversa.

- **Escopo Exigido:** `insurance:sale:create`
- **Idempotência:** Idempotente por submissão de dados.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "nome": "Dr. Carlos Eduardo",
      "cpfCnpj": "123.456.789-01",
      "oab": "12345/SC",
      "email": "carlos@exemplo.adv.br",
      "cep": "88010-000",
      "logradouro": "Rua Felipe Schmidt",
      "numero": "100",
      "bairro": "Centro",
      "cidade": "Florianópolis",
      "uf": "SC"
    }
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "collecting_data",
    "updatedFields": ["nome", "cpfCnpj", "oab", "email", "cep", "logradouro", "numero", "bairro", "cidade", "uf"],
    "isComplete": false
  }
  ```

---

### 2.5 `sales_next_step`
Determina deterministicamente no backend qual campo ou pergunta ainda precisa ser formulada ao cliente.

- **Escopo Exigido:** `insurance:sale:read`
- **Idempotência:** Leitura segura.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Resposta de Sucesso (Campo Pendente):**
  ```json
  {
    "status": "collecting_data",
    "progressPercent": 45,
    "next": {
      "field": "oab",
      "label": "Número da Inscrição na OAB",
      "type": "text",
      "required": true,
      "placeholder": "Ex: 12345/SC"
    }
  }
  ```
- **Resposta de Sucesso (Todos os Dados Coletados):**
  ```json
  {
    "status": "ready_to_quote",
    "progressPercent": 100,
    "next": null
  }
  ```

---

### 2.6 `quote_simulate`
Executa o cálculo financeiro atuarial de uma simulação via motor `pricing.ts`.

- **Escopo Exigido:** `insurance:quote`
- **Idempotência:** Leitura segura.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "plan": "300k",
    "installments": 6,
    "couponCode": "PROMO10"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "plan": "300k",
    "coverage": "R$ 300.000,00",
    "deductible": "R$ 5.000,00",
    "originalPrice": 1845.50,
    "discountPercent": 10,
    "discountValue": 184.55,
    "total": 1660.95,
    "installments": 6,
    "installmentValue": 276.82,
    "currency": "BRL"
  }
  ```

---

### 2.7 `quote_confirm`
Converte os dados da sessão comercial em uma cotação formal registrada no banco de dados (`cotacoes`).

- **Escopo Exigido:** `insurance:quote`
- **Idempotência:** Estritamente idempotente. Se a sessão já possui `cotacao_id`, retorna o registro existente.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "plan": "300k",
    "installments": 6
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "cotacaoId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "status": "quoted",
    "premioFinal": 1845.50,
    "importanciaSegurada": 300000.00,
    "alreadyExisted": false
  }
  ```

---

### 2.8 `contract_create`
Gera a minuta contratual em PDF com âncoras e registra o envelope no ZapSign com dupla assinatura sequencial.

- **Escopo Exigido:** `insurance:contract:create`
- **Idempotência:** Idempotente. Retorna o envelope existente enquanto não expirar.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "awaiting_signature",
    "docToken": "zap-doc-token-12345",
    "signUrl": "https://app.zapsign.com.br/verificar/zap-doc-token-12345",
    "expiresAt": "2026-10-14T14:30:00.000Z",
    "alreadyExisted": false
  }
  ```

---

### 2.9 `contract_status`
Verifica a situação jurídica da assinatura eletrônica na ZapSign e banco local.

- **Escopo Exigido:** `insurance:sale:read`
- **Idempotência:** Leitura segura.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "signed",
    "brokerSigned": true,
    "customerSigned": true,
    "signedAt": "2026-10-07T14:35:00.000Z",
    "signedFileUrl": "https://zapsign.s3.amazonaws.com/docs/signed.pdf"
  }
  ```

---

### 2.10 `payment_get`
Recupera os meios de pagamento (PIX QR Code, Copia e Cola e Boleto) emitidos após assinatura formal.

- **Escopo Exigido:** `insurance:payment:read`
- **Pré-requisito:** Contrato obrigatoriamente assinado (`signed`).
- **Idempotência:** Leitura segura / Geração sob demanda idempotente.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "awaiting_payment",
    "amount": 1845.50,
    "installments": 6,
    "dueDate": "2026-10-10",
    "invoiceUrl": "https://www.asaas.com/i/inv-12345",
    "bankSlipUrl": "https://www.asaas.com/b/pdf/slip-12345",
    "pixQrCode": "00020126580014br.gov.bcb.pix...",
    "pixCopyPaste": "00020126580014br.gov.bcb.pix..."
  }
  ```

---

### 2.11 `sale_status`
Retorna uma visão consolidada de 360 graus do progresso da venda assistida.

- **Escopo Exigido:** `insurance:sale:read`
- **Idempotência:** Leitura segura.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "awaiting_payment",
    "quote": {
      "cotacaoId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "importanciaSegurada": 300000.00,
      "premioFinal": 1845.50
    },
    "signature": {
      "status": "signed",
      "docToken": "zap-doc-token-12345"
    },
    "payment": {
      "status": "pending",
      "installments": 6
    },
    "policy": null,
    "nextAction": "WAIT_PAYMENT"
  }
  ```

---

### 2.12 `sales_handoff`
Transfere a condução do atendimento para um operador humano e congela as mutações pela IA.

- **Escopo Exigido:** `insurance:sale:create`
- **Idempotência:** Idempotente.
- **Parâmetros de Entrada:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "underwriting_review",
    "note": "Proponente declarou sinistro prévio na área de responsabilidade médica."
  }
  ```
- **Motivos Válidos:**
  - `underwriting_review` (Sinistro, recusa prévia ou questão afirmativa de risco)
  - `customer_requested` (Solicitação expressa do cliente de falar com um corretor)
  - `inconsistent_data` (Dados cadastrais conflitantes ou CPF inválido recorrente)
  - `unsupported_product` (Solicitação de produto fora do catálogo de RC)
  - `system_error` (Falha transitória em gateway terceiro)
  - `compliance_review` (Pessoa Politicamente Exposta ou restrição de compliance)
  - `unusual_request` (Comportamento anômalo ou tentativa de manipulação de prompt)
- **Resposta de Sucesso:**
  ```json
  {
    "saleSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "human_handoff",
    "handoffReason": "underwriting_review",
    "transferredAt": "2026-10-07T14:40:00.000Z"
  }
  ```
