# PROJECT_STATE.md — DuoLife Hub

Atualizado em: 2026-07-16 15:38 BRT

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
- Parar de depender de criação de schema distribuída em runtime
- Validar fluxo real do admin sync do Wix em produção
- Validar fluxos de cotação/venda que hoje estão vazios na base
- Decidir quando eliminar a base antiga do cluster compartilhado

## Regras de checkpoint
- Antes de qualquer mudança estrutural: registrar objetivo, risco e rollback
- Depois de cada mudança: registrar resultado e evidência mínima
- Se os tokens acabarem: retomar sempre por este arquivo e pelo ORÁCULO

## Evidências do fechamento da Fase 1
- Deploy de produção do commit `8e9b4a719cd51eeae4011ee3e92b952a8b0982a6` concluído no Coolify em `2026-07-16 18:29:24 UTC`
- Novo container ativo em produção: `nne294wcr9butmdbvc6ph33a-182554950156`
- Imagem ativa em produção: `nne294wcr9butmdbvc6ph33a:8e9b4a719cd51eeae4011ee3e92b952a8b0982a6`
- Banco confirmado no container ativo: host `r2ux7wb4r1nhug69ym1unjr2`
- `GET https://duolife.com.br/api/health` validado com `200` em `2026-07-16`
- `POST https://duolife.com.br/api/auth/login` validado com `carlos@guru.dev.br`
- `GET https://duolife.com.br/api/auth/me` validado após login em `2026-07-16`

## Próximo passo exato
1. Aguardar o deploy do commit `ffd7e547fc7d336d312c6c17ddb59ee22a676232` finalizar no Coolify (`mea0frjf2eq1z7lya38fnj3d`)
2. Validar em produção que o container ativo trocou para a imagem `ffd7e547...` e que `health`/login seguem íntegros
3. Seguir para auditoria do sync Wix somente em modo pull, com falha limpa quando credenciais não existirem

## Fase 2 em andamento
- Commit local/publicado: `ffd7e547fc7d336d312c6c17ddb59ee22a676232`
- Objetivo: impedir DDL implícito em produção e transformar `ensureSchema()` em verificação segura por padrão
- Build local aprovado em `2026-07-16`
- Deploy de produção em andamento no Coolify: `mea0frjf2eq1z7lya38fnj3d`

## Estado atual da API Wix NET4LIFE em 2026-07-16
- Produção DuoLife saudável no commit `ffd7e547fc7d336d312c6c17ddb59ee22a676232`
- Causa raiz identificada:
  - o ambiente estava com `WIX_SITE_ID` apontando para o account id `49416bac-8e5b-45c8-9b61-6c27502b9ccb`, que não é um MetaSite válido para as rotas de Data API da NET4LIFE
- Correção aplicada no Coolify:
  - `WIX_SITE_ID` de produção e preview ajustado para `36a9dd1d-86a0-4b88-b6f1-4fe09f75b3a9`
  - `WIX_API_KEY` e `WIX_SITE_ID` mantidos apenas como runtime env
  - redeploy forçado da app `nne294wcr9butmdbvc6ph33a`
- Validação final executada a partir do container ativo de produção `nne294wcr9butmdbvc6ph33a-203648600985`
- Resultado final:
  - `GET https://www.wixapis.com/wix-data/v2/collections` => `200`
  - `POST https://www.wixapis.com/wix-data/v2/items/query` para `Import1` => `200`
  - `GET https://duolife.com.br/api/health` => `200`
- Conclusão operacional:
  - a DuoLife voltou a conectar na API Wix da NET4LIFE em produção
  - a falha não era no cliente da aplicação, mas na configuração do `WIX_SITE_ID`

## Refatoração da área admin em 2026-07-16
- Objetivo desta etapa:
  - aproximar a DuoLife do teor informacional da admin da Net4Life sem copiar a estrutura visual de forma literal
  - organizar a operação RC em uma shell própria, com dashboard executivo-operacional e módulo de relatórios
- Mudanças aplicadas:
  - nova shell admin com navegação por blocos operacionais e de rede
  - dashboard `/admin` refeito com filtros mensais, cards de KPI, funil comercial, parceiros em destaque, eventos recentes e saúde das integrações
  - novo módulo `/admin/relatorios` com visão detalhada de status de cotações, cobrança, parceiros, pendências financeiras e falhas de sync
  - consultas consolidadas movidas para `src/lib/admin-reporting.ts`
- Evidência técnica:
  - `npm run build` aprovado em `2026-07-16`
  - rotas validadas no build: `/admin`, `/admin/relatorios`, `/admin/cotacoes`, `/admin/vendas`, `/admin/comissoes`, `/admin/parceiros`, `/admin/clientes`, `/admin/usuarios`, `/admin/sync`
- Próximo passo recomendado:
  - validar a experiência navegando em produção e decidir a próxima camada: permissões finas por perfil operacional ou aprofundamento dos relatórios/ações
