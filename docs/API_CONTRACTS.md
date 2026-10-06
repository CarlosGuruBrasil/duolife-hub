# Catálogo e Contratos de API — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Mapeamento completo de 84 rotas de API em `app/api/`.

---

## 1. Padrões Globais de API

- **Formato:** Todas as requisições e respostas operam sob `application/json; charset=utf-8` (exceto downloads de documentos que utilizam seus respectivos MIME types).
- **Tratamento de Sessão:** Sessões ativas são transportadas via cookie HttpOnly `duolife_token`.
- **Bypass Público:** Requisições originadas em links públicos de venda enviam o cabeçalho `x-public-token: <TOKEN>`, que é validado contra a tabela `public_sale_links`.
- **Respostas de Sucesso:** HTTP 200 OK ou HTTP 201 Created com payload JSON estruturado.
- **Respostas de Erro:** Retornam `{ error: string, details?: unknown }` com códigos HTTP semânticos (400, 401, 403, 404, 429, 500).

---

## 2. Contratos de Autenticação e Sessão (`/api/auth/*`)

### POST `/api/auth/login`
- **Objetivo:** Autenticar usuários internos, gestores de corretora ou corretores parceiros.
- **Autenticação:** Pública.
- **Body:**
  ```json
  {
    "email": "usuario@exemplo.com.br",
    "password": "senha_do_usuario"
  }
  ```
- **Resposta Sucesso (200 OK):**
  ```json
  {
    "user": {
      "id": "uuid-text",
      "name": "Nome do Usuário",
      "email": "usuario@exemplo.com.br",
      "role": "corretora_admin",
      "corretoraId": "corretora_net4life_001"
    }
  }
  ```
  *Define cookies HttpOnly: `duolife_token` (8h) e `duolife_refresh` (30 dias).*
- **Erros:** 400 (dados inválidos), 401 (credenciais incorretas ou usuário inativo).

### POST `/api/auth/logout`
- **Objetivo:** Encerrar a sessão ativa.
- **Autenticação:** Autenticado.
- **Resposta Sucesso (200 OK):** `{ "ok": true }` *(remove cookies de autenticação)*.

### GET `/api/auth/me`
- **Objetivo:** Retornar o perfil e permissões do usuário logado.
- **Autenticação:** Exige cookie `duolife_token`.
- **Resposta Sucesso (200 OK):** Dados do usuário, papel, permissões e corretora vinculada.

### POST `/api/auth/forgot-password`
- **Objetivo:** Solicitar link de redefinição de senha por e-mail.
- **Autenticação:** Pública.
- **Body:** `{ "email": "usuario@exemplo.com.br" }`
- **Resposta Sucesso (200 OK):** `{ "ok": true, "message": "Se o e-mail existir, um link de recuperação será enviado." }`

### POST `/api/auth/reset-password`
- **Objetivo:** Redefinir senha com token temporário.
- **Autenticação:** Pública via token.
- **Body:** `{ "token": "hash-token", "password": "nova_senha_min_6_chars" }`
- **Resposta Sucesso (200 OK):** `{ "ok": true }`

### POST `/api/auth/refresh`
- **Objetivo:** Rotacionar o JWT de sessão utilizando o cookie `duolife_refresh`.
- **Autenticação:** Exige cookie `duolife_refresh`.
- **Resposta Sucesso (200 OK):** `{ "ok": true }` *(renova os cookies)*.

---

## 3. Contratos de Administração Central (`/api/admin/*`)

### GET `/api/admin/corretoras`
- **Objetivo:** Listar todas as Corretoras Master cadastradas.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Resposta (200 OK):** Array com dados cadastrais, bancários e flags de documentos anexados (`has_contrato_social`, `has_cartao_cnpj`, `has_socio_documento`, `has_comprovante_bancario`).

### POST `/api/admin/corretoras`
- **Objetivo:** Cadastrar nova Corretora Master com uploads obrigatórios.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Body (Multipart/JSON):**
  - Dados da Empresa: `razao_social`, `nome_fantasia`, `cnpj`, `susep`, `email`, `telefone_cadastro`.
  - Dados do Sócio: `socio_nome`, `socio_cpf`, `socio_rg`, `socio_email`, `socio_telefone`.
  - Dados Bancários: `banco`, `agencia`, `conta`, `pix_tipo_chave`, `pix_chave`.
  - 4 Documentos em Base64: `contrato_social_base64`, `cartao_cnpj_base64`, `socio_documento_base64`, `comprovante_bancario_base64`.
- **Resposta (201 Created):** Retorna os dados da corretora criada e as credenciais geradas para o primeiro gestor em `corretora_users`.

### GET `/api/admin/corretoras/[id]/documento/[tipo]`
- **Objetivo:** Download ou visualização inline de documento regulatório da corretora.
- **Tipos Permitidos:** `contrato-social`, `cartao-cnpj`, `socio-documento`, `comprovante-bancario`.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Resposta (200 OK):** Stream binário do arquivo com headers `Content-Type` e `Content-Disposition: inline`.

### GET `/api/admin/webhooks/auditoria`
- **Objetivo:** Listar trilha de webhooks recebidos com KPIs consolidados.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Query Params:** `provider`, `status`, `page`, `limit`, `search`.
- **Resposta (200 OK):** Lista paginada de eventos da tabela `webhook_events` e totais agregados.

### POST `/api/admin/webhooks/[id]/reprocessar`
- **Objetivo:** Reprocessar sob demanda um webhook individual que falhou.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Resposta (200 OK):** `{ "success": true, "result": ... }`.

### POST `/api/admin/sync/asaas/assinadas-sem-fatura`
- **Objetivo:** Auditar e emitir em lote cobranças no Asaas para contratos assinados sem fatura gerada.
- **Permissões:** `duolife_dev`, `duolife_admin`.
- **Resposta (200 OK):** Quantidade de faturas geradas e diagnósticos de execução.

---

## 4. Contratos do Portal e Cotações (`/api/portal/*` e `/api/cotacoes`)

### POST `/api/cotacoes`
- **Objetivo:** Criar proposta ou salvar rascunho de cotação.
- **Autenticação:** Cookie de parceiro OU cabeçalho `x-public-token`.
- **Body:**
  ```json
  {
    "productId": "prod-rc-001",
    "clientName": "Dr. Carlos Santos",
    "clientCpfCnpj": "12345678901",
    "clientEmail": "cliente@exemplo.com.br",
    "clientPhone": "48999999999",
    "importanciaSegurada": 300000,
    "premioFinal": 1845.50,
    "qtdParcelas": 6,
    "clientData": {
      "tipoDePlano": "300k",
      "isRenovacao": "Não",
      "formaPagamento": "BOLETO",
      "oab": "12345/SC",
      "especialidades": ["Trabalhista", "Cível"]
    }
  }
  ```
- **Resposta Sucesso (201 Created):** `{ "cotacao": { "id": "uuid-text", ... } }`.
- **Validações:** Validação de formato de documento (11 ou 14 dígitos), recálculo de preço no servidor via `pricing.ts` e sanitização de dados.

### POST `/api/portal/cotacoes/[id]/gerar-contrato`
- **Objetivo:** Gerar o documento PDF vetorial e registrar o envelope na ZapSign com dupla assinatura.
- **Autenticação:** Sessão de parceiro OU cabeçalho `x-public-token`.
- **Resposta Sucesso (200 OK):**
  ```json
  {
    "success": true,
    "docToken": "zapsign-doc-token",
    "signUrl": "https://app.zapsign.com.br/verificar/...",
    "status": "contrato_gerado"
  }
  ```

### POST `/api/portal/cotacoes/[id]/gerar-pagamento`
- **Objetivo:** Emitir as cobranças (PIX / Boleto / Cartão) no Asaas para uma cotação com contrato assinado.
- **Autenticação:** Sessão de parceiro OU cabeçalho `x-public-token`.
- **Resposta Sucesso (200 OK):**
  ```json
  {
    "success": true,
    "orderId": "order-uuid",
    "invoiceUrl": "https://www.asaas.com/i/...",
    "bankSlipUrl": "https://www.asaas.com/b/pdf/...",
    "pixQrCode": "00020126580014br.gov.bcb.pix...",
    "status": "pagamento_gerado"
  }
  ```

### POST `/api/portal/cotacoes/[id]/verificar-assinatura`
- **Objetivo:** Consultar ativamente na API ZapSign se os signatários já assinaram o contrato.
- **Autenticação:** Sessão de parceiro OU cabeçalho `x-public-token`.
- **Resposta Sucesso (200 OK):** `{ "signed": true, "status": "signed" }`.

### POST `/api/portal/validar-cupom`
- **Objetivo:** Validar vigência e obter percentual de desconto de um cupom comercial.
- **Autenticação:** Pública.
- **Body:** `{ "codigo": "PROMO10" }`
- **Resposta Sucesso (200 OK):** `{ "valido": true, "desconto": 10 }`.

---

## 5. Contratos de Webhooks (`/api/webhook/*`)

### POST `/api/webhook/asaas`
- **Origem:** Gateway Asaas.
- **Autenticação:** Header `asaas-access-token` validado em tempo constante contra `ASAAS_WEBHOOK_SECRET`.
- **Eventos Principais:** `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`.
- **Comportamento:** Registra o evento, atualiza o status das parcelas em `payment_installments`, recalcula o montante pago em `payment_orders` e executa a transação atômica `ensureSaleForPaidQuote` com lock na cotação.
- **Resposta:** HTTP 200 OK `{ "received": true }`.

### POST `/api/webhook/zapsign`
- **Origem:** ZapSign.
- **Autenticação:** Token secreto configurado na query string ou cabeçalho.
- **Eventos Principais:** `doc_signed`, `signature_request_refused`, `deadline_exceeded`.
- **Comportamento:** Quando `doc_signed`, atualiza o status da cotação para `assinado`, registra o documento assinado e dispara automaticamente a criação da cobrança no Asaas.
- **Resposta:** HTTP 200 OK.

---

## 6. Rotas de Telemetria e Ciclo de Vida

### GET `/api/health`
- **Objetivo:** Health check de contêiner e monitoramento (Coolify / Docker).
- **Autenticação:** Pública.
- **Resposta Sucesso (200 OK):**
  ```json
  {
    "ok": true,
    "timestamp": "2026-10-06T16:30:00.000Z",
    "uptime": 12345
  }
  ```

### POST `/api/cron/lifecycle`
- **Objetivo:** Acionador diário da régua de renovação de apólices e cobrança de inadimplência.
- **Autenticação:** Header `Authorization: Bearer <CRON_SECRET>`.
- **Resposta Sucesso (200 OK):** Resumo da varredura com total de apólices notificadas e logs de execução.
