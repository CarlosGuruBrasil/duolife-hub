# Checkpoint Admin DuoLife - 2026-07-17

## Corrigido nesta etapa

- Ajustada a linguagem do admin para separar claramente:
  - `Contas parceiras`: empresa + acessos + configuracoes da conta
  - `Equipe DuoLife`: usuarios internos da operacao
- A listagem de parceiros agora mostra saude da conta:
  - contato principal
  - total de acessos
  - acessos ativos
  - existencia ou ausencia de diretor principal
- A tela de parceiro passou a assumir explicitamente o conceito de `conta do parceiro`, com alerta quando ainda nao existe acesso principal cadastrado.
- O dashboard/relatorios deixaram de multiplicar valores por fanout de joins em:
  - performance por produto
  - performance por parceiro
  - relatorio consolidado por parceiro
- O funil foi ajustado:
  - `aguardando assinatura` = `enviada` + `contrato_gerado`
  - `aguardando cobranca` = `assinado` + `pagamento_gerado`
- Pendencias financeiras do relatorio agora respeitam o periodo selecionado.

## Diagnostico mantido

- A estrutura de banco `partners` + `partner_users` + `admin_users` continua correta para a operacao descrita.
- O erro principal estava no produto/admin, que fazia parecer que `parceiro` e `usuario` eram cadastros concorrentes.
- O cadastro publico `/api/parceiros/cadastro` ainda cria apenas a empresa interessada e nao cria o primeiro acesso do parceiro.

## Proximo passo recomendado

- Unificar o onboarding de parceiro:
  - ou coletar senha no cadastro publico
  - ou criar fluxo de convite/primeiro acesso apos aprovacao
  - ou gerar acesso inicial controlado pelo admin com envio de redefinicao de senha
