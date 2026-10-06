# Variáveis de Ambiente & Configurações — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Mapeamento extraído de `.env.example`, `src/lib/secrets.ts` e arquivos de configuração.  
> **Regra de Segurança Estrita:** Nenhum valor real, credencial ou segredo de produção está registrado neste documento. Apenas a especificação sintática e a finalidade de cada parâmetro.

---

## 1. Relação Completa de Variáveis de Ambiente

| Nome da Variável | Finalidade Técnica | Obrigatória? | Onde Utilizada no Código | Exemplo de Formato Sintético |
|---|---|:---:|---|---|
| `DATABASE_URL` | String de conexão com o banco de dados PostgreSQL. | **SIM** | `src/lib/pg.ts`, `scripts/migrate.mjs` | `postgresql://user:password@host:5432/duolife_db` |
| `JWT_SECRET` | Chave simétrica usada para assinar e validar os tokens JWT de sessão (`HS256`). | **SIM** | `proxy.ts`, `src/lib/secrets.ts`, `src/lib/auth.ts` | Hexadecimal de 32 a 64 caracteres |
| `JWT_EXPIRES_IN` | Tempo de expiração do cookie de sessão `duolife_token`. | Não (default: `8h`) | `src/lib/auth.ts` | `8h`, `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Tempo de vida dos refresh tokens de longa duração em dias. | Não (default: `30`) | `src/lib/refresh-token.ts` | `30` |
| `NEXT_PUBLIC_APP_URL` | URL canônica pública da aplicação (usada na geração de links e e-mails). | **SIM** | `src/lib/referral.ts`, `src/lib/email-service.ts` | `https://duolife.com.br` |
| `ALLOW_RUNTIME_SCHEMA` | Flag que autoriza ou bloqueia a execução de comandos DDL (`ensureSchema`) na inicialização. | **SIM** | `src/lib/schema.ts` | `false` (produção), `true` (desenvolvimento) |
| `BOOTSTRAP_ADMIN_NAME` | Nome do administrador padrão para seed inicial do banco de dados. | Opcional | `src/lib/schema.ts` | `Admin DuoLife` |
| `BOOTSTRAP_ADMIN_EMAIL`| E-mail do administrador para acesso inicial de emergência. | Opcional | `src/lib/schema.ts` | `admin@duolife.com.br` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha provisória do usuário de bootstrap inicial. | Opcional | `src/lib/schema.ts` | String alfanumérica segura |
| `WEBHOOK_SECRET` | Segredo para validação de webhooks genéricos ou de contingência. | Opcional | `src/lib/webhook-auth.ts` | String aleatória segura |
| `CRON_SECRET` | Token Bearer exigido para autorizar a execução da rota do cron de ciclo de vida. | **SIM** | `app/api/cron/lifecycle/route.ts` | Token de alta entropia |
| `ASAAS_API_KEY` | Chave de API para integração REST v3 com o gateway financeiro Asaas. | **SIM** | `src/lib/asaas-charges.ts`, `src/lib/asaas-service.ts` | Formato Asaas API Key (`$aact_...`) |
| `ASAAS_BASE_URL` | URL base da API do Asaas (Produção vs Sandbox). | Não (default prod) | `src/lib/asaas-charges.ts` | `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_SECRET` | Token secreto enviado no cabeçalho `asaas-access-token` nos webhooks do Asaas. | **SIM** | `app/api/webhook/asaas/route.ts` | String aleatória configurada no painel do Asaas |
| `ZAPSIGN_API_TOKEN` | Token de autorização Bearer para a API de assinatura digital ZapSign. | **SIM** | `src/lib/zapsign-direct-docs.ts` | Token de API da ZapSign |
| `ZAPSIGN_BASE_URL` | URL base da API da ZapSign. | Não (default prod) | `src/lib/zapsign-direct-docs.ts` | `https://api.zapsign.com.br/api/v1` |
| `ZAPSIGN_WEBHOOK_SECRET` | Segredo de verificação para as notificações da ZapSign. | Opcional | `app/api/webhook/zapsign/route.ts` | String alfanumérica |
| `WIX_API_KEY` | Chave de autorização para consumo das APIs de dados do Wix (Data API v2). | **SIM** | `src/lib/wix-client.ts` | Chave de API gerada no Wix Studio / Developer |
| `WIX_SITE_ID` | Identificador único do site/MetaSite da Net4Life no Wix. | **SIM** | `src/lib/wix-client.ts` | UUID do MetaSite Wix |
| `SMTP_HOST` | Host do servidor SMTP para envio transacional de e-mails em fallback. | Opcional | `src/lib/mailer.ts` | `smtp.provedor.com` |
| `SMTP_PORT` | Porta de conexão do servidor SMTP. | Opcional | `src/lib/mailer.ts` | `587` ou `465` |
| `SMTP_USER` | Usuário de autenticação do servidor SMTP. | Opcional | `src/lib/mailer.ts` | `usuario_smtp` |
| `SMTP_PASS` | Senha de autenticação do servidor SMTP. | Opcional | `src/lib/mailer.ts` | Senha de app / SMTP |
| `EMAIL_FROM` | Endereço de e-mail remetente padrão exibido aos clientes. | Não (default: noreply)| `src/lib/mailer.ts` | `noreply@duolife.com.br` |

---

## 2. Parâmetros Dinâmicos em Banco (`system_settings`)

Além das variáveis de ambiente de processo, determinados parâmetros de integração podem ser sobrescritos dinamicamente sem necessidade de reiniciar os contêineres, sendo persistidos na tabela `system_settings`:

- `WIX_API_KEY` & `WIX_SITE_ID`: Chaves dinâmicas da integração Wix.
- `ASAAS_API_KEY`: Chave do gateway Asaas.
- `ZAPSIGN_API_TOKEN`: Chave de assinaturas ZapSign.
- `RENEWAL_WINDOWS`: Janelas regressivas de aviso de renovação (default: `60,30,15,0`).
- `INADIMPLENCIA_A_VENCER_DAYS`: Dias de aviso antes do vencimento da parcela (default: `3,1`).
- `INADIMPLENCIA_VENCIDAS_DAYS`: Dias de régua após o vencimento (default: `1,3,7,15`).
- `RENEWAL_ENABLED` & `INADIMPLENCIA_ENABLED`: Flags booleanas de ativação da régua de relacionamento.

---

## 3. Diretrizes de Gestão e Segurança de Segredos

1. **Separação de Ambientes no Coolify:** Variáveis sensíveis de produção (`DATABASE_URL`, chaves de API reais e JWT secrets) devem ser declaradas exclusivamente no painel do Coolify com a opção `runtime-only` ativada, impedindo que os valores vazem para as camadas de cache da imagem Docker durante o build.
2. **Arquivos `.env.local` e `.env`:** Devem permanecer estritamente listados no `.gitignore`. Nunca realize commits de arquivos de ambiente no repositório Git.
3. **Produção vs Sandbox:** Para ambientes de teste ou homologação, utilize as URLs oficiais de sandbox:
   - Asaas Sandbox: `https://sandbox.asaas.com/v3`
   - ZapSign Sandbox: `https://sandbox.zapsign.com.br/api/v1`
