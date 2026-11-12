# Contingência ZapSign — recuperação de contratos assinados

Mecanismo de **contingência** para quando o webhook da ZapSign não chega ou falha. Não é um fluxo
paralelo de negócio: ao detectar um contrato concluído, o cron entrega à mesma função usada pelo
webhook (`processZapSignPayload`) um payload equivalente ao evento `doc_signed`.

## Como funciona

1. `GET|POST /api/cron/zapsign-recovery` (autenticado) abre uma execução em `zapsign_recovery_runs`.
2. Seleciona documentos em `signature_documents` que:
   - são da ZapSign e foram criados nos **últimos 5 dias úteis** (fuso de Brasília, feriados nacionais);
   - não estão `signed`, `cancelled`, `refused` ou `expired` no sistema;
   - pertencem a cotação em `contrato_gerado`, `enviada` ou `rascunho`, sem `statusAssinatura = todas_assinadas`;
   - ainda não têm a conclusão reivindicada (`signature_completion_claims`);
   - têm token real (ignora tokens sintéticos `ZAP-*`, `CSV-ZAP-*`, `WIX-ZAP-*`).
3. Consulta `GET /docs/{token}/` na ZapSign (lote de até 100, 2 em paralelo, 300 ms entre chamadas,
   1 nova tentativa em 429/erro de rede).
4. Classifica: **assinado** (status `signed`/`completed` ou todos os signatários assinaram) →
   processa como webhook; **pendente** → nada; **cancelado/recusado/expirado/404** → ignora e registra.
5. Grava o resultado por contrato em `zapsign_recovery_runs.details` e nos logs (`zapsign.recovery.*`).

## Idempotência

| Risco | Proteção |
| --- | --- |
| Webhook e cron processando o mesmo contrato (em sequência ou ao mesmo tempo) | `signature_completion_claims`: `INSERT … ON CONFLICT DO NOTHING` por documento. Só quem insere dispara `CONTRATO_ASSINADO` (e-mails) e a cobrança Asaas. Usado pelo webhook, pelo cron, pela verificação manual do portal e pelo reprocessamento. |
| Duas execuções do cron simultâneas | Índice único parcial `WHERE status = 'running'` em `zapsign_recovery_runs`. Execuções presas há mais de 30 min são marcadas `abandoned`. |
| Agendador chamando com frequência maior que a desejada | Intervalo mínimo `ZAPSIGN_RECOVERY_INTERVAL_MINUTES` (resposta `skipped`). |
| Cobrança duplicada | Trava acima + checagem existente de `payment_orders` + single-flight de `generateAsaasPaymentForQuote`. |
| Trava indisponível | Webhook: fail-open (mantém o comportamento histórico). Cron: fail-closed (não dispara nada). |

Mudança de comportamento no webhook (intencional): antes, cada evento "assinado" com chave diferente
(ex.: `doc_signed` seguido de `signer_signed` final) disparava os e-mails de novo; agora dispara
**uma vez por documento**. Um contrato regerado (nova minuta) é outro documento e dispara normalmente.
O reprocessamento administrativo **com** disparos continua executando (decisão explícita do admin).

## Falhas da ZapSign

- Erro em um contrato não interrompe os demais (item `error`, execução `partial`, HTTP 207).
- 5 falhas consecutivas (5xx/timeout/rede) abrem o circuit breaker: o restante do lote vira `aborted`
  e é retentado na próxima execução (os contratos continuam elegíveis).

## Configuração no servidor

### 1. Aplicar a migração

`npm start` já roda `node scripts/migrate.mjs`, que aplica `db/migrations/036-zapsign-signature-recovery.sql`.
Em ambientes sem esse fluxo, rodar manualmente:

```bash
node scripts/migrate.mjs
```

### 2. Segredo e intervalo

- `CRON_SECRET` — o mesmo do cron de lifecycle (Admin → Chaves de API, ou variável de ambiente).
- `ZAPSIGN_RECOVERY_INTERVAL_MINUTES` — intervalo mínimo em minutos (padrão `15`). Pode ser definido
  como variável de ambiente ou como chave em `system_settings` (o banco tem prioridade).

### 3. Agendar a chamada

O agendador deve chamar **pelo menos** na frequência desejada; o endpoint respeita o intervalo mínimo.
O segredo vai sempre em cabeçalho (query string é rejeitada).

crontab (a cada 15 minutos):

```cron
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU_DOMINIO/api/cron/zapsign-recovery >> /var/log/duolife-zapsign-recovery.log 2>&1
```

Coolify / Railway / outro agendador: criar uma tarefa agendada com o mesmo comando `curl`.

### 4. Testar com segurança

Simulação (consulta a ZapSign, não altera nada nem dispara e-mails/cobranças):

```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"dryRun":true}' https://SEU_DOMINIO/api/cron/zapsign-recovery
```

Parâmetros: `dryRun` (simulação), `limit` (lote, máx. 500) e `force` (ignora o intervalo — **só com
sessão de administrador**; vindo do agendador é ignorado).

### 5. Acompanhar

```sql
SELECT started_at, status, triggered_by, checked, recovered, still_pending, ignored, errors, error_message
FROM zapsign_recovery_runs ORDER BY started_at DESC LIMIT 20;
```

Logs: `zapsign.recovery.started`, `zapsign.recovery.item.<ação>`, `zapsign.recovery.finished`,
`signature.completion.claimed` / `already_claimed`.

## Limitações conhecidas

- Critério conservador: contratos de 1 assinatura cujo documento na ZapSign tenha 2 signatários e só o
  cliente tenha assinado **não** são recuperados pelo cron (o webhook os conclui; o portal também).
- Contratos fora da janela de 5 dias úteis continuam dependendo da reconciliação manual
  (`/api/admin/sync/zapsign`, que só sincroniza estado e não dispara e-mails nem cobranças).
