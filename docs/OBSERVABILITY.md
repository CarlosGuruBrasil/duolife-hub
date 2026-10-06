# Observabilidade, Logs & Auditoria — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Recursos reais de telemetria, trilhas de auditoria e monitoramento em operação.

---

## 1. Visão Geral da Observabilidade

O DuoLife Hub adota uma abordagem de **Observabilidade Embarcada em Banco de Dados**, complementada por **logs estruturados via Pino** no stdout e módulos dedicados de auditoria e telemetria no Painel Administrativo.

---

## 2. Logs Estruturados de Aplicação (`src/lib/logger.ts`)

A aplicação utiliza a biblioteca **Pino** (`pino ^10.3.1`) para gerar logs estruturados em JSON de alta performance:

```json
{
  "level": 30,
  "time": 1728232000000,
  "pid": 1,
  "hostname": "duolife-prod-container",
  "name": "duolife-hub",
  "msg": "Cotação criada com sucesso",
  "cotacaoId": "c4b12a88-...",
  "partnerId": "partner-001",
  "premioFinal": 1845.50
}
```

- **Níveis de Log:**
  - `10 (trace)`: Detalhamento de passos internos de algoritmos.
  - `20 (debug)`: Informações de diagnóstico de conexões e payloads intermediários.
  - `30 (info)`: Eventos normais do ciclo de vida da aplicação.
  - `40 (warn)`: Eventos anômalos não impeditivos (ex: falhas de validação Zod secundárias ou rate limits atingidos).
  - `50 (error)`: Falhas graves de transações ou integrações externas.
  - `60 (fatal)`: Erros irrecuperáveis que impedem o bootstrap da aplicação.

---

## 3. Trilhas de Auditoria Persistidas no Banco de Dados

O banco de dados PostgreSQL mantém **5 tabelas dedicadas exclusivamente à observabilidade e auditoria**:

| Tabela de Auditoria | O que Registra | Retenção / Volume |
|---|---|---|
| `webhook_events` | Todos os webhooks recebidos de parceiros externos (Asaas, ZapSign, Wix), contendo payload bruto, cabeçalhos HTTP saneados, tempo de resposta e contadores de retentativa. | Permanente. Alimentada a cada requisição de webhook. |
| `email_dispatch_logs` | Histórico completo de e-mails transacionais enviados, destinatários, assunto, template utilizado, provedor ativo (Net4Life vs SMTP) e erros de entrega. | Permanente. Permite preview do HTML exato disparado ao cliente. |
| `sync_log` | Histórico de sincronizações bidirecionais entre a DuoLife e plataformas externas (Wix Data API, CV CRM, Meta Ads). | Permanente. Usado para rastrear inconsistências de espelhamento. |
| `lifecycle_cron_logs` | Métricas de cada execução do cronjob diário de renovação de seguros e cobrança de inadimplência (tempo em ms, apólices escaneadas e erros). | Permanente. Rastreia o histórico diário de execução. |
| `automation_trigger_logs`| Execuções das árvores de decisão e automações, registrando quais nós da árvore foram avaliados como verdadeiros e quais ações foram disparadas. | Permanente. Permite depurar por que um gatilho foi ou não acionado. |

---

## 4. Telas Administrativas de Observabilidade e Diagnóstico

A seção "Desenvolvimento" do Painel Administrativo disponibiliza consoles visuais em tempo real:

### 4.1 Central de Auditoria de Webhooks (`/admin/auditoria-webhooks`)
- **KPIs em Tempo Real:** Taxa de Sucesso (%), Total de Requisições, Falhas/Alertas e distribuição por provedor (Asaas, ZapSign, Wix).
- **Filtros Dinâmicos:** Busca por payload, ID externo, status e intervalo de datas.
- **Modal de Inspeção Detalhada:** Visualizador de JSON formatado com syntax highlighting, visualização de headers HTTP e botão para **Reprocessar Evento** em caso de falha transitória.

### 4.2 Central de Auditoria de E-mails (`/admin/auditoria-emails`)
- **KPIs de Entregabilidade:** Total de Disparos, Taxa de Sucesso, Falhas e Provedor Ativo (Net4Life Info vs Nodemailer SMTP).
- **Modal de Preview:** Permite ao operador visualizar o e-mail renderizado exatamente como o destinatário o recebeu no cliente de e-mail.
- **Disparo de Teste / Diagnóstico:** Modal seguro com trava anti-open-relay que permite testar o envio de qualquer template exclusivamente para o e-mail do operador logado.

### 4.3 Central de Sincronizações (`/admin/sync`)
- Diagnóstico em 1 clique de integridade bancária:
  - Detecção e expurgo de cobranças anacrônicas no Asaas.
  - Auditoria de cotações com contrato assinado no ZapSign que ainda não possuem fatura emitida no gateway.

### 4.4 Comparativo Técnico Wix (`/admin/comparativo-wix`)
- Ferramenta exclusiva para perfil `duolife_dev` que compara linha a linha o banco de dados local com as coleções remotas do Wix Data API (`Import1`), destacando clientes sincronizados (`synced`) e divergentes (`divergent`).

---

## 5. Health Check e Monitoramento de Contêiner

- **Endpoint:** `GET /api/health`.
- **Finalidade:** Monitoramento de liveness e readiness pelo orquestrador Docker / Coolify.
- **Resposta:**
  ```json
  {
    "ok": true,
    "timestamp": "2026-10-06T16:30:00.000Z",
    "uptime": 12345
  }
  ```
- **Comportamento em Falha:** Se a conexão com o PostgreSQL estiver caída ou o processo em deadlock, o endpoint não responde ou retorna HTTP 500, disparando a reinicialização automática do contêiner pelo orquestrador.

---

## 6. Lacunas de Observabilidade Identificadas

1. **Ausência de APM Dedicado (Application Performance Monitoring):**
   - O projeto não possui ferramentas como DataDog, New Relic, Sentry ou OpenTelemetry instaladas. Erros não tratados no frontend no navegador do cliente não são capturados automaticamente por um serviço centralizado.
2. **Falta de Métricas Prometheus / Grafana:**
   - Métricas de sistema (uso de CPU, consumo de memória do Node.js, tempo médio de resposta de requisições e saturação do pool de conexões do banco) dependem exclusivamente das métricas básicas do servidor hospedeiro no Coolify.
