# Autenticação Server-to-Server & Scopes — DuoLife Hub

> **Status:** Especificação Técnica de Autenticação  
> **Classificação de Certeza:** Autenticação privilegiada mútua server-to-server.

---

## 1. Visão Geral da Autenticação MCP

A camada MCP opera como uma **API Privilegiada Machine-to-Machine (M2M)**. Por ser consumida exclusivamente por microsserviços de IA, backends de WhatsApp ou orquestradores de atendimento, seu ciclo de autenticação é **100% desacoplado dos cookies de sessão do Portal do Parceiro ou Painel Administrativo** (`duolife_token`, `duolife_refresh`).

A autenticação é realizada via cabeçalho HTTP padrão:
```http
Authorization: Bearer <MCP_API_KEY>
```

---

## 2. Estrutura das Chaves de API MCP

As chaves de API seguem o padrão criptográfico de prefixo informativo e segredo de alta entropia:
$$\text{Formato: } \texttt{dlmcp\_live\_[32\_bytes\_hex]}$$
Exemplo: `dlmcp_live_4f9a8b1c7e2d3f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a`

### 2.1 Armazenamento Seguro em Banco (Hash SHA-256)
O valor original da chave **nunca é persistido em texto plano**. O banco de dados armazena apenas o seu hash SHA-256 na tabela `mcp_api_keys`:

| Coluna | Tipo | Finalidade |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Identificador único da credencial (UUID). |
| `name` | `TEXT NOT NULL` | Nome descritivo da aplicação (Ex: "Agente WhatsApp DuoBot"). |
| `key_prefix` | `TEXT NOT NULL` | Primeiros 14 caracteres para identificação visual (Ex: `dlmcp_live_4f9a`). |
| `key_hash` | `TEXT UNIQUE NOT NULL`| Hash SHA-256 hexadecimal da chave completa. |
| `scopes` | `TEXT[] NOT NULL` | Lista estrita de permissões autorizadas. |
| `is_active` | `BOOLEAN DEFAULT true` | Flag de revogação imediata. |
| `rate_limit_per_minute`| `INT DEFAULT 120` | Teto de requisições por minuto por chave. |
| `expires_at` | `TIMESTAMPTZ` | Data limite de validade da credencial. |
| `last_used_at` | `TIMESTAMPTZ` | Timestamp do último acesso bem-sucedido. |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Data de emissão da chave. |

---

## 3. Matriz de Escopos (Scopes) Granulares

Em conformidade com o princípio do menor privilégio, a camada MCP implementa escopos granulares por domínio de negócio:

| Escopo | Descrição da Permissão | Tools MCP Autorizadas |
|---|---|---|
| `insurance:catalog:read` | Consulta pública do catálogo de produtos e planos RC | `insurance_list_products`, `insurance_get_product` |
| `insurance:quote` | Realização de simulações e geração de cotações oficiais | `quote_simulate`, `quote_confirm` |
| `insurance:sale:create` | Abertura de sessões, atualização de dados e handoff | `sales_start`, `sales_update`, `sales_handoff` |
| `insurance:sale:read` | Consulta do status da sessão, próximo passo e minuta | `sales_next_step`, `sale_status`, `contract_status` |
| `insurance:contract:create` | Geração de propostas em PDF e envelopes ZapSign | `contract_create` |
| `insurance:payment:read` | Consulta de links de pagamento após assinatura | `payment_get` |

### 3.1 Proibição Explícita de Escopos Genéricos
São **estritamente vedados** e não reconhecidos pelo sistema escopos com comodatários amplos, como:
- `admin:*` (Acesso administrativo irrestrito)
- `database:*` ou `sql:*` (Operações diretas de banco de dados)
- `payments:*` (Geração arbitrária ou estorno financeiro de cobranças)
- `system:*` (Configurações internas do servidor)

---

## 4. Algoritmo de Validação Timing-Safe

Para mitigar ataques de temporização (*timing attacks*), a validação da chave compara o hash SHA-256 do token recebido utilizando `crypto.timingSafeEqual`:

```typescript
import crypto from 'node:crypto';
import { sql } from '@/lib/pg';

export async function authenticateMcpClient(authHeader: string | null): Promise<McpAuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Credencial ausente ou malformatada', statusCode: 401 };
  }

  const token = authHeader.slice(7).trim();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const [keyRow] = await sql<any[]>`
    SELECT id, name, scopes, is_active, rate_limit_per_minute, expires_at
    FROM mcp_api_keys
    WHERE key_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!keyRow) {
    return { ok: false, error: 'Chave de API MCP inválida', statusCode: 401 };
  }

  if (!keyRow.is_active) {
    return { ok: false, error: 'Chave de API MCP revogada', statusCode: 403 };
  }

  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return { ok: false, error: 'Chave de API MCP expirada', statusCode: 403 };
  }

  // Atualiza timestamp de uso em background
  sql`UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = ${keyRow.id}`.catch(() => {});

  return {
    ok: true,
    clientId: keyRow.id,
    clientName: keyRow.name,
    scopes: keyRow.scopes,
    rateLimit: keyRow.rate_limit_per_minute,
  };
}
```

---

## 5. Respostas de Erro de Autenticação

### 5.1 Token Inválido ou Ausente (HTTP 401)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Chave de autenticação MCP inválida ou ausente.",
    "data": {
      "errorCode": "UNAUTHORIZED"
    }
  },
  "id": null
}
```

### 5.2 Escopo Insuficiente (HTTP 403)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32003,
    "message": "Permissão insuficiente. Escopo necessário: insurance:contract:create.",
    "data": {
      "errorCode": "FORBIDDEN",
      "requiredScope": "insurance:contract:create",
      "clientScopes": ["insurance:catalog:read", "insurance:quote"]
    }
  },
  "id": "req-123"
}
```
