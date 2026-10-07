# Catálogo Estruturado de Erros MCP — DuoLife Hub

> **Status:** Especificação Técnica de Tratamento de Exceções  
> **Classificação de Certeza:** Formato padronizado JSON-RPC 2.0 com extensões semânticas.

---

## 1. Visão Geral do Formato de Erro

Para permitir que agentes autônomos de IA interpretem falhas programaticamente sem ambiguidade, todas as respostas de erro retornam um objeto estruturado orientado à máquina.

Stack traces de exceções internas **NUNCA são expostos** ao cliente MCP por razões de segurança defensiva. Falhas técnicas são registradas com stack trace completo internamente no Pino logger e na tabela `mcp_audit_logs`.

### 1.1 Envelope Padrão de Erro MCP
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Mensagem textual amigável em português.",
    "data": {
      "errorCode": "CODIGO_DE_ERRO_ESTRUTURADO",
      "recoverable": true,
      "details": {},
      "suggestedAction": "Instrução para a IA de como prosseguir ou orientar o cliente."
    }
  },
  "id": "request-id-ou-null"
}
```

---

## 2. Catálogo Oficial de Códigos de Erro

| Código (`errorCode`) | Recuperável? | Descrição Negocial | Ação Recomendada para a IA |
|---|:---:|---|---|
| `UNAUTHORIZED` | Não | Chave de API ausente, malformada ou inválida. | Abortar conexão e alertar operador de infraestrutura. |
| `FORBIDDEN` | Não | Credencial sem o escopo necessário para a tool solicitada. | Abortar execução da tool e verificar permissões. |
| `RATE_LIMITED` | Sim | Limite de requisições por minuto excedido (HTTP 429). | Aguardar o intervalo `retryAfterMs` antes de retentar. |
| `SESSION_NOT_FOUND` | Não | A sessão comercial informada em `saleSessionId` não existe. | Iniciar uma nova sessão via `sales_start`. |
| `INVALID_INPUT` | Sim | Parâmetros de entrada rejeitados pelo schema Zod. | Corrigir a tipagem dos dados e reenviar. |
| `MISSING_REQUIRED_FIELD` | Sim | Faltam campos obrigatórios para avançar na proposta. | Invocar `sales_next_step` e solicitar o dado pendente ao cliente. |
| `INVALID_PRODUCT` | Sim | O produto ou ramo indicado não existe ou está inativo. | Apresentar os produtos disponíveis via `insurance_list_products`. |
| `INVALID_PLAN` | Sim | O plano selecionado não é válido para a cobertura do ramo. | Apresentar os planos do produto via `insurance_get_product`. |
| `PRICING_FAILED` | Sim | O motor server-side não conseguiu precificar a simulação. | Verificar condições do plano e tentar novamente. |
| `UNDERWRITING_REVIEW_REQUIRED` | Não (IA) | Resposta afirmativa em risco exige análise humana. | Informar ao cliente que a proposta foi encaminhada à subscrição e invocar `sales_handoff`. |
| `CONTRACT_NOT_READY` | Sim | Tentativa de gerar contrato com dados incompletos. | Concluir o preenchimento de todos os passos antes da minuta. |
| `SIGNATURE_PENDING` | Sim | Tentativa de consultar pagamento antes da assinatura. | Lembrar o cliente de assinar a minuta no link da ZapSign. |
| `PAYMENT_NOT_READY` | Sim | Cobrança ainda não disponível para faturamento. | Aguardar o webhook ou retentar após a conclusão da esteira. |
| `HUMAN_HANDOFF_REQUIRED` | Não (IA) | A sessão foi transbordada para atendimento humano. | Suspender novas ações e informar que o corretor assumiu o chat. |
| `INVALID_STATE` | Sim | Sessão está em estado inconsistente para a operação. | Consultar a sessão via `sale_status` para realinhar o fluxo. |
| `INVALID_STATE_TRANSITION` | Sim | Tentativa de transição não permitida pela máquina de estados. | Seguir estritamente o fluxo da máquina de estados. |
| `INTERNAL_ERROR` | Não | Erro inesperado no backend ou falha de conexão de banco. | Informar ao cliente instabilidade momentânea e acionar handoff. |

---

## 3. Exemplos Práticos de Respostas de Erro

### 3.1 Campo Obrigatório Ausente (`MISSING_REQUIRED_FIELD`)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32002,
    "message": "Há informações cadastrais obrigatórias pendentes para este ramo.",
    "data": {
      "errorCode": "MISSING_REQUIRED_FIELD",
      "recoverable": true,
      "details": {
        "missingField": "oab",
        "label": "Número de Inscrição na OAB",
        "expectedType": "text"
      },
      "suggestedAction": "Solicite ao proponente o número de inscrição da OAB antes de confirmar a cotação."
    }
  },
  "id": "req-001"
}
```

### 3.2 Tentativa de Pagamento Pré-Assinatura (`SIGNATURE_PENDING`)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32004,
    "message": "A cobrança financeira somente é disponibilizada após a assinatura formal do contrato.",
    "data": {
      "errorCode": "SIGNATURE_PENDING",
      "recoverable": true,
      "details": {
        "currentSignatureStatus": "awaiting_customer",
        "signUrl": "https://app.zapsign.com.br/verificar/doc-123"
      },
      "suggestedAction": "Envie o link de assinatura ao cliente e aguarde a formalização digital antes de solicitar o pagamento."
    }
  },
  "id": "req-002"
}
```

### 3.3 Análise de Risco de Underwriting (`UNDERWRITING_REVIEW_REQUIRED`)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32005,
    "message": "A proposta requer análise manual da equipe de subscrição e não pode ser aprovada automaticamente.",
    "data": {
      "errorCode": "UNDERWRITING_REVIEW_REQUIRED",
      "recoverable": false,
      "details": {
        "reasonCodes": ["PRIOR_PROFESSIONAL_CLAIM"],
        "descriptions": ["Proponente declarou sinistro ou reclamação profissional anterior."]
      },
      "suggestedAction": "Comunique gentilmente ao proponente que o processo necessita de avaliação técnica e transfira o atendimento via sales_handoff."
    }
  },
  "id": "req-003"
}
```
