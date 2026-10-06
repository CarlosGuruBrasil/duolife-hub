# Fluxos e Jornadas de Usuário — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Jornadas reais mapeadas nos componentes de interface e serviços backend.

---

## 1. Fluxo de Autenticação e Recuperação de Senha

O fluxo de autenticação atende a todos os perfis autenticados da plataforma (Administradores, Gestores de Corretora e Corretores).

```mermaid
sequenceDiagram
    autonumber
    actor User as Operador / Corretor
    participant LoginUI as /login
    participant AuthAPI as /api/auth/login
    participant DB as PostgreSQL
    participant App as /portal ou /admin

    User->>LoginUI: Informa e-mail e senha
    LoginUI->>AuthAPI: POST { email, password }
    AuthAPI->>DB: Busca usuário em admin_users, corretora_users ou partner_users
    AuthAPI->>AuthAPI: Valida hash de senha com bcrypt.compare
    AuthAPI->>DB: Verifica is_active = true e status da corretora = 'active'
    AuthAPI->>AuthAPI: Gera JWT (8h) e Refresh Token (30 dias)
    AuthAPI->>DB: Salva hash do refresh token em refresh_tokens
    AuthAPI-->>LoginUI: Define cookies HttpOnly (duolife_token, duolife_refresh)
    LoginUI-->>App: Redireciona com base no papel (duolife_* -> /admin, outros -> /portal)
```

### 1.1 Recuperação de Senha ("Esqueci minha Senha")
1. O usuário acessa `/login/esqueci-a-senha` e digita seu e-mail cadastrado.
2. A rota `POST /api/auth/forgot-password` gera um token criptográfico aleatório, armazena o hash SHA-256 na tabela `password_reset_tokens` com validade de 2 horas.
3. Dispara um e-mail transacional contendo o link `https://duolife.com.br/login/redefinir-senha?token=...`.
4. O usuário abre o link, digita a nova senha (mínimo 6 caracteres).
5. A rota `POST /api/auth/reset-password` valida o token, atualiza o `password_hash` com bcrypt (10 rounds) e invalida o token com `used = true`.

---

## 2. Fluxo da Esteira Dinâmica de Cotação (6 Etapas)

Este é o fluxo principal executado em `/portal/cotacoes/nova` ou pelo formulário `DynamicCotacaoForm.tsx`.

```mermaid
flowchart TD
    E1["Etapa 1: Cobertura\n(Escolha do Plano: 100k, 300k, 500k, 1mi)"] --> E2
    E2["Etapa 2: Proponente\n(Nome, CPF/CNPJ, E-mail, Celular, Endereço ViaCEP)"] --> E3
    E3["Etapa 3: Perfil Profissional\n(Registro de Classe ex: OAB, Especialidades, Faturamento)"] --> E4
    E4["Etapa 4: Underwriting\n(Seguro Anterior, Questionário de Sinistros, PPE)"] --> E5
    E5["Etapa 5: Pagamento\n(Parcelas 1x a 6x, Cupom/Desconto, Forma Asaas)"] --> Persist["Clique em 'Ir para Assinatura'"]
    Persist --> Save["POST /api/cotacoes\n(Salva cotação no PostgreSQL como rascunho)"]
    Save --> Zap["POST /api/portal/cotacoes/[id]/gerar-contrato\n(Gera PDF vetorial e envia à ZapSign)"]
    Zap --> E6["Etapa 6: Assinatura & Cobrança\n(Quadro de assinatura e link ZapSign liberado)"]
```

---

## 3. Fluxo de Auto-Contratação via Link Público White-Label

Utilizado quando o corretor envia seu link personalizado para o cliente final.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente Segurado
    participant Link as /contratar/[token]
    participant PublicAPI as /api/public/contratacao/[token]
    participant Form as DynamicCotacaoForm
    participant Backend as /api/cotacoes & /gerar-contrato

    Cliente->>Link: Acessa o link compartilhado pelo corretor
    Link->>PublicAPI: GET /api/public/contratacao/[token]
    PublicAPI-->>Link: Valida validade e retorna dados da Corretora e Desconto %
    Link->>Form: Inicializa formulário com branding da corretora mãe e desconto travado
    Cliente->>Form: Preenche dados cadastrais, profissionais e escolhe pagamento
    Cliente->>Backend: Submete proposta com cabeçalho 'x-public-token'
    Backend-->>Form: Retorna cotação gravada e envelope ZapSign gerado
    Form-->>Cliente: Exibe tela de assinatura digital instantânea
```

---

## 4. Esteira de Dupla Assinatura ZapSign

Garante a validade jurídica com a assinatura prévia da Corretora Master e subsequente do Segurado.

```mermaid
sequenceDiagram
    autonumber
    participant DuoLife as DuoLife Hub
    participant ZapSign as ZapSign API
    actor Corretora as Corretora Master (Signatário 1)
    actor Segurado as Segurado Proponente (Signatário 2)

    DuoLife->>ZapSign: POST /docs/ com PDF vetorial (âncoras invisíveis)
    Note over DuoLife,ZapSign: Signatário 1: order=1, âncora {{assinatura_corretora}}<br/>Signatário 2: order=2, âncora {{assinatura_proponente}}
    ZapSign-->>DuoLife: Retorna signUrlCorretora e signUrlProponente
    ZapSign->>Corretora: Envia e-mail de notificação para a Corretora assinar
    Corretora->>ZapSign: Assina digitalmente (Rubrica + Token SMS/E-mail)
    ZapSign->>ZapSign: Marca Signatário 1 como concluído
    ZapSign->>Segurado: Libera e envia e-mail para o Proponente assinar
    Segurado->>ZapSign: Assina digitalmente
    ZapSign->>DuoLife: Webhook POST /api/webhook/zapsign (status: signed)
    DuoLife->>DuoLife: Atualiza cotação para 'assinado' e salva PDF assinado
    DuoLife->>DuoLife: Dispara automaticamente a geração da cobrança Asaas
```

---

## 5. Liquidação Financeira, Webhook Asaas e Emissão de Apólice

Processamento atômico de pagamento com blindagem contra duplicidade.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente Segurado
    participant Asaas as Asaas Gateway
    participant Webhook as /api/webhook/asaas
    participant Ops as insurance-ops.ts
    participant DB as PostgreSQL

    Cliente->>Asaas: Efetua pagamento via PIX Copia e Cola ou Boleto
    Asaas->>Webhook: POST /api/webhook/asaas (PAYMENT_RECEIVED)
    Webhook->>DB: Registra evento em webhook_events
    Webhook->>DB: Atualiza parcela em payment_installments (status: 'paid')
    Webhook->>DB: Recalcula total pago em payment_orders
    Webhook->>Ops: Chama ensureSaleForPaidQuote
    Ops->>DB: Transação sql.begin()
    Ops->>DB: SELECT id FROM cotacoes WHERE id = ... FOR UPDATE (Lock)
    Ops->>DB: Verifica se venda já existe em 'sales' (Idempotência)
    Ops->>DB: INSERT INTO sales (Emite Apólice DL-RC-XXXXXXXX)
    Ops->>DB: INSERT INTO commissions (Lança comissão da corretora)
    Ops->>DB: UPDATE cotacoes SET status = 'aprovada'
    Ops-->>Webhook: Retorna sucesso
    Webhook-->>Asaas: Retorna HTTP 200 OK
```

---

## 6. Onboarding e Credenciamento de Corretora Master

Fluxo corporativo executado pelo administrador para ativar uma nova Corretora no ecossistema.

```mermaid
flowchart TD
    A[Admin acessa /admin/corretoras] --> B[Clica em 'Cadastrar Corretora']
    B --> C[Preenche Dados da Corretora: Razão Social, CNPJ, SUSEP, Telefone]
    C --> D[Preenche Quadro Societário: Nome, CPF, RG, E-mail e Telefone do Sócio]
    D --> E[Preenche Dados Bancários: Banco, Agência, Conta e Chave PIX]
    E --> F[Anexa os 4 Documentos Obrigatórios em PDF/Imagem:\n1. Contrato Social\n2. Cartão CNPJ\n3. RG/CNH do Sócio\n4. Comprovante Bancário]
    F --> G[Submete formulário com payload JSON + Base64]
    G --> H[Backend valida Zod, dígitos de CNPJ/CPF e mimes]
    H --> I[Cria registro em 'corretoras' com arquivos em colunas dedicadas]
    I --> J[Cria usuário gestor em 'corretora_users' com senha provisória]
    J --> K[Dispara e-mail de boas-vindas com credenciais de acesso]
    K --> L[Exibe modal de sucesso com credenciais copiáveis]
```

---

## 7. Gestão de Equipe Comercial pelo Gestor

Fluxo de delegação e supervisão comercial no Portal do Parceiro (`/portal/equipe`).

1. O gestor da corretora (`corretora_admin`) acessa a aba **Equipe**.
2. Visualiza a lista de corretores ativos, quantidade de propostas emitidas e vendas confirmadas de cada membro.
3. Para cadastrar um novo corretor:
   - Clica em **"Cadastrar Vendedor / Corretor"**.
   - Preenche: Nome completo, CPF, E-mail, Celular e define uma senha inicial provisória.
   - O backend cria o registro na tabela `partner_users` vinculado à sua corretora.
   - Um e-mail de convite é disparado ao corretor com o link de acesso ao portal.
4. O gestor pode a qualquer momento: redefinir a senha do corretor, editar seus dados de contato ou suspender seu acesso alterando `is_active = false`.

---

## 8. Auditoria e Reprocessamento de Webhooks

Fluxo de suporte e diagnóstico de contingência em `/admin/auditoria-webhooks`.

1. O operador técnico acessa a Central de Auditoria de Webhooks.
2. Analisa os cards de KPI no topo: Taxa de Sucesso, Total de Eventos, Falhas e distribuição por provedor (Asaas, ZapSign, Wix).
3. Na tabela de eventos, filtra por status (`failed`) ou busca pelo ID do cliente ou transação.
4. Clica em **"Inspecionar"**: abre o modal com a visualização do JSON bruto do payload recebido e os cabeçalhos HTTP.
5. Se o erro foi causado por instabilidade transitória do banco ou timeout, clica no botão **"Reprocessar Evento"**.
6. O backend reexecuta `reprocessWebhookEvent()`, incrementa o contador `retry_count`, atualiza o status para `processed = true` e concretiza o evento pendente (ex: aprovação da venda ou avanço de status).
