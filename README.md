# DuoLife Hub

Portal de vendas, cotações e gestão de parceiros e comissões da DuoLife.

## Tecnologias

- Next.js (App Router)
- Tailwind CSS
- Banco de Dados via PostgreSQL (Supabase / Coolify)

## Scripts

- `npm run dev`: Inicia o servidor local de desenvolvimento.
- `npm run build`: Cria a build de produção.
- `npm start`: Inicia o servidor de produção.

## Hospedagem

Este projeto é projetado e configurado para ser hospedado no **Coolify**, com deploys automatizados baseados em push na branch principal (`main`) ou gatilhos via webhook.

## Bootstrap e segurança

- Em produção, a aplicação deve rodar com `ALLOW_RUNTIME_SCHEMA=false` por padrão.
- Com `ALLOW_RUNTIME_SCHEMA=false`, `ensureSchema()` apenas valida se a base obrigatória já existe e falha de forma explícita se faltar estrutura.
- Use `ALLOW_RUNTIME_SCHEMA=true` apenas de forma temporária e controlada, por exemplo em bootstrap inicial ou manutenção planejada.
- Se o runtime schema estiver habilitado, o bootstrap do admin exige:
  - `BOOTSTRAP_ADMIN_NAME`
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`
- Em desenvolvimento local, o projeto mantém um fallback apenas para não travar o ambiente local.
- Antes de qualquer deploy de produção, garanta também:
  - `JWT_SECRET`
  - `WEBHOOK_SECRET`
  - `WIX_API_KEY`
  - `WIX_SITE_ID`
