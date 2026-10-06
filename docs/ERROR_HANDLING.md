# Tratamento de Erros & Resiliência — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Estratégias reais de captura, propagação, logging e exibição de falhas.

---

## 1. Filosofia de Tratamento de Erros

O DuoLife Hub adota uma estratégia defensiva baseada em:
1. **Falha Limpa com Diagnóstico Estruturado:** Erros de validação e regras de negócio retornam mensagens detalhadas e códigos HTTP semânticos em vez de falhas genéricas.
2. **Rollback Transacional Automático:** Operações financeiras e de banco são envolvidas em blocos transacionais com reversão total em caso de exceção.
3. **Mecanismos de Fallback em Cascata:** Serviços externos essenciais (Precificação, Envio de E-mails e Busca de Endereços) possuem camadas de contingência automáticas.
4. **Idempotência e Reprocessamento de Webhooks:** Eventos externos com falha são gravados com seu payload bruto e mensagem de erro, permitindo retentativas programadas ou manuais.

---

## 2. Como os Erros são Gerados e Propagados

```mermaid
flowchart TD
    Req[Requisição de Entrada] --> Val{Validação Zod Schema}
    Val -- Falha --> Err400[Retorna HTTP 400 + Campo a Campo]
    Val -- Sucesso --> Svc[Serviço de Domínio / Regra de Negócio]
    Svc --> DB{Operação no PostgreSQL}
    DB -- Constraint / Timeout --> DBRollback[Rollback Automático tx + HTTP 500]
    DB -- Sucesso --> Ext{Chamada a API Externa (Asaas/ZapSign)}
    Ext -- Timeout / Erro 4xx/5xx --> ExtFallback{Possui Fallback?}
    ExtFallback -- Sim --> ExecFallback[Aciona Provedor Secundário]
    ExtFallback -- Não --> LogErr[logger.error + Retorna Erro Amigável ao Usuário]
```

### 2.1 Erros de Validação de Dados (Zod Schemas)
- Quando uma requisição viola o schema Zod (ex: CPF com tamanho incorreto, e-mail malformado ou campos obrigatórios ausentes), o backend captura o `ZodError` e retorna:
  ```json
  {
    "error": "Dados da cotação inválidos (Nome incompleto, CPF inválido)",
    "details": [
      {
        "field": "clientCpfCnpj",
        "message": "CPF deve conter 11 dígitos numéricos"
      }
    ]
  }
  ```
- O erro é acompanhado de um `logger.warn` contendo os campos específicos violados para acelerar a depuração.

### 2.2 Exceções de Banco de Dados
- Em caso de violação de unicidade (ex: tentativa de cadastrar corretora com CNPJ já existente ou documento de assinatura duplicado), o driver `postgres` emite um erro de constraint (ex: `23505 unique_violation`).
- Os route handlers interceptam a exceção e transformam o erro bruto do SQL em uma mensagem compreensível ao operador:
  ```json
  {
    "error": "Já existe uma corretora cadastrada com este CNPJ no sistema."
  }
  ```

---

## 3. Estratégias de Fallback Implementadas

| Serviço / Domínio | Provedor Primário | Provedor de Fallback | Comportamento em Falha |
|---|---|---|---|
| **Catálogo de Preços (RC Advogados)** | Coleção `Planos` do Wix Data API v2 | Tabela estática local `rcAdvogadosConfig.planos` | Se a API do Wix falhar ou retornar vazia, o sistema calcula o prêmio pela tabela local em `pricing.ts`, evitando indisponibilidade do checkout. |
| **Envio de E-mails Transacionais** | API Net4Life Info / FluxoSend | Nodemailer via SMTP direto (`SMTP_HOST`) | Se o endpoint da Net4Life retornar erro ou timeout, o `mailer.ts` tenta automaticamente o disparo pelo servidor SMTP. |
| **Consulta de Endereços por CEP** | BrasilAPI (`brasilapi.com.br`) | ViaCEP (`viacep.com.br`) | Se a BrasilAPI falhar ou demorar mais de 3s, consulta o ViaCEP de forma transparente. |
| **Geração de Contrato** | Geração Direta em PDF vetorial (`dynamic_pdf`) | Modelo Estático ZapSign (`template_id`) | Se a geração direta falhar por inconsistência de dados, pode utilizar os templates pré-cadastrados. |

---

## 4. Como os Erros são Exibidos ao Usuário no Frontend

- **Toasts Reativos:** Notificações flutuantes no canto superior direito via hook `useToast()` com estados visuais (`success`, `error`, `warning`).
- **Cards de Alerta em Light Mode:** Mensagens de erro persistentes utilizam o padrão de contraste do Design System:
  ```html
  <div class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl">
    <!-- Mensagem de erro legível -->
  </div>
  ```
- **Feedback de Campo em Formulários:** Erros específicos de digitação (ex: CNPJ inválido ou senha fraca) são destacados em vermelho sob o próprio input com texto auxiliar.

---

## 5. Auditoria de Falhas e Reprocessamento

- **Fila de Webhooks (`webhook_events`):** Quando um webhook externo falha em ser processado, o evento não é descartado:
  - O payload recebido e os headers são persistidos com `processed = false`.
  - A coluna `error_message` armazena o stack trace ou motivo da falha.
  - O painel em `/admin/auditoria-webhooks` exibe o badge de erro e disponibiliza o botão **"Reprocessar Evento"**, que reexecuta o processamento após o ajuste da causa raiz.
