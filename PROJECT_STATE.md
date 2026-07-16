# PROJECT_STATE.md — DuoLife Hub

Atualizado em: 2026-07-16 15:10 BRT

## Objetivo operacional
Transformar a DuoLife em um portal/admin operacional estável, com banco isolado, integrações preservadas, documentação de retomada e execução por squad virtual.

## Estado atual confirmado
- Produção pública respondendo em `https://duolife.com.br` e `https://www.duolife.com.br`
- `GET /api/health` respondendo `200`
- Login administrativo validado em produção com `carlos@guru.dev.br`
- Banco dedicado criado no Coolify:
  - recurso: `duolife-postgres`
  - uuid: `r2ux7wb4r1nhug69ym1unjr2`
  - db: `duolife_db`
  - status: `running:healthy`
- Aplicação DuoLife já apontando para o banco novo:
  - container ativo: `nne294wcr9butmdbvc6ph33a-180314730471`
  - host do `DATABASE_URL`: `r2ux7wb4r1nhug69ym1unjr2`
- `DATABASE_URL` ajustado para `runtime-only` no Coolify
- Healthcheck do app ativado no Coolify em `/api/health`
- Base antiga no cluster compartilhado preservada como rollback temporário

## Squad virtual
### 1. Arquiteto / coordenação
- Dono da ordem de execução
- Controla escopo, risco e checkpoints
- Responsável por decisões finais de arquitetura

### 2. Infra / DevOps
- Coolify
- Postgres
- backup
- rollback
- variáveis de ambiente
- healthchecks
- limpeza de legado

### 3. Backend / segurança
- auth
- schema
- migrações
- remoção de bootstrap inseguro
- revisão de permissões e segredos

### 4. Integrações
- Wix pull/mirror
- webhooks
- contratos de dados
- idempotência
- monitoramento de sync

### 5. Portal / admin / UX interna
- fluxos operacionais
- telas admin
- consistência entre UI e APIs
- mensagens de erro e estados vazios

### 6. QA / documentação
- checklist funcional
- regressão
- runbooks
- checkpoint de retomada

## Fases de execução
### Fase 1 — concluída
- Isolar banco da DuoLife
- Migrar `duolife_db`
- Apontar produção para banco novo
- Validar login e health

### Fase 2 — próxima
- Remover segredos hardcoded do código
- Revisar bootstrap admin
- Revisar `ensureSchema()` espalhado em runtime
- Definir trilha de migração controlada

### Fase 3
- Auditar integrações Wix ponta a ponta
- Validar mirror, webhook e admin sync
- Revisar contratos de dados críticos

### Fase 4
- Limpar legado restante
- Decidir separação futura entre site público e portal
- Encerrar rollback temporário da base antiga

## Pendências críticas
- Remover credenciais sensíveis hardcoded de `src/lib/schema.ts`
- Parar de depender de criação de schema distribuída em runtime
- Validar fluxo real do admin sync do Wix em produção
- Validar fluxos de cotação/venda que hoje estão vazios na base
- Decidir quando eliminar a base antiga do cluster compartilhado

## Regras de checkpoint
- Antes de qualquer mudança estrutural: registrar objetivo, risco e rollback
- Depois de cada mudança: registrar resultado e evidência mínima
- Se os tokens acabarem: retomar sempre por este arquivo e pelo ORÁCULO

## Próximo passo exato
1. Auditar `src/lib/schema.ts`, `src/lib/auth.ts`, `app/api/auth/*`, `app/api/admin/sync/wix/pull/route.ts` e `app/api/webhook/wix/route.ts`
2. Remover segredos hardcoded e preparar mecanismo seguro de bootstrap
3. Planejar substituição gradual do `ensureSchema()` por migração controlada
