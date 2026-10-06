# Problemas Conhecidos & Inconsistências — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Comportamentos divergentes e inconsistências catalogadas sem alterações no código.

---

## 1. Visão Geral dos Problemas Conhecidos

Este documento lista inconsistências operacionais, divergências documentais e comportamentos suspeitos comprovados durante a auditoria técnica da base de código.

---

## 2. Catálogo Estruturado de Problemas Conhecidos

### ISSUE-001 — Divergência entre Comentários e Implementação na Paginação de PDFs
- **Descrição:** O comentário de documentação no topo de `src/lib/pdf-contract-generator.ts` declara que o plano de 100k deve gerar 2 páginas e os planos de 300k+ devem gerar 4 páginas. Na implementação real das funções (`renderProposta100kNovo`, `renderProposta100kRenovacao` e `renderPropostaOficial`), os modelos de 100k geram estritamente **1 página** e os planos de 300k+ geram **2 páginas**.
- **Evidência:** Funções `renderProposta100kNovo` (linha 350) e `renderPropostaOficial` (linha 650) adicionam 1 e 2 páginas via `doc.addPage()`. A sessão recente de refatoração reduziu a paginação intencionalmente para otimizar a usabilidade de assinatura, mas os comentários históricos em outros pontos do código não foram atualizados.
- **Impacto:** Confusão para desenvolvedores e agentes de IA que venham a consultar a docstring do arquivo.
- **Como Reproduzir:** Executar `npx tsx scripts/test-novos-modelos-contrato.ts` e inspecionar a contagem de páginas dos PDFs gerados.
- **Arquivos Envolvidos:** `src/lib/pdf-contract-generator.ts`.
- **Severidade:** **Baixa**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-002 — Bloqueio HTTP 401 para Usuários Internos em `/api/vendas` e `/api/comissoes`
- **Descrição:** Os endpoints REST `/api/vendas` e `/api/comissoes` utilizam a função de validação `verifyPartnerAuth(req)`. Quando um administrador ou desenvolvedor interno (`duolife_admin`, `duolife_dev`) tenta consultar essas APIs via requisição HTTP direta, a função rejeita a chamada com HTTP 401 por esperar credenciais de parceiro.
- **Evidência:** `app/api/vendas/route.ts` (linhas 10-14) e `app/api/comissoes/route.ts` (linhas 10-14).
- **Impacto:** Inconsistência de consumo: o painel administrativo precisa buscar os dados diretamente via Server Components (`src/lib/admin-reporting.ts`), enquanto integrações que tentem consumir a rota REST com token de administrador são barradas.
- **Como Reproduzir:** Fazer login como `duolife_admin` e disparar um `fetch('/api/vendas')`.
- **Arquivos Envolvidos:** `app/api/vendas/route.ts`, `app/api/comissoes/route.ts`, `src/lib/auth.ts`.
- **Severidade:** **Média**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-003 — Bypass Excessivo de Token Público no Middleware Edge (`proxy.ts`)
- **Descrição:** O middleware `proxy.ts` libera requisições sem cookie de sessão caso o cabeçalho `x-public-token` esteja presente para qualquer caminho que inicie com `/api/portal`.
- **Evidência:** `proxy.ts`:
  ```typescript
  const isPublicTokenRoute = pathname.startsWith('/api/cotacoes') || pathname.startsWith('/api/portal');
  if (publicToken && isApi && isPublicTokenRoute) {
    return NextResponse.next();
  }
  ```
- **Impacto:** Sub-rotas que exigem perfil administrativo de corretora (como `/api/portal/equipe`) dependem exclusivamente de suas checagens internas com `verifyPartnerAuth` para barrar a chamada, gerando inconsistência de proteção entre as camadas de rede e aplicação.
- **Como Reproduzir:** Enviar requisição para `/api/portal/equipe` contendo o header `x-public-token: token-qualquer` sem cookie; a requisição atravessa o middleware e só falha dentro do route handler.
- **Arquivos Envolvidos:** `proxy.ts`.
- **Severidade:** **Média**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-004 — Módulo de Comissões Ocultado no Menu de Navegação
- **Descrição:** As telas `/portal/comissoes` e `/admin/comissoes` estão plenamente desenvolvidas e conectadas ao banco de dados, mas os itens de navegação correspondentes foram comentados no menu lateral.
- **Evidência:** `src/components/portal/PortalShell.tsx` e `src/components/admin/AdminShell.tsx`.
- **Impacto:** Corretores e gestores não encontram link visual para acompanhar seus repasses financeiros no menu principal, necessitando digitar a URL manualmente.
- **Como Reproduzir:** Acessar o Portal do Parceiro e verificar que o item "Comissões" não consta na barra lateral.
- **Arquivos Envolvidos:** `src/components/portal/PortalShell.tsx`, `src/components/admin/AdminShell.tsx`.
- **Severidade:** **Baixa**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-005 — Validação Incompleta de Schema no Boot em Produção
- **Descrição:** Quando o ambiente opera com `ALLOW_RUNTIME_SCHEMA !== 'true'`, a função `verifyRequiredSchema()` valida a existência de apenas **10 tabelas** das 35 existentes no sistema.
- **Evidência:** Array `REQUIRED_TABLES` em `src/lib/schema.ts` (linhas 8-19) omite tabelas críticas como `cotacoes`, `sales`, `commissions`, `payment_orders`, `payment_installments` e `signature_documents`.
- **Impacto:** Se uma migração falhar silenciosamente ou faltar uma tabela do núcleo financeiro, o contêiner sobe com status 200 no health check e o erro só explode quando um usuário tenta contratar uma apólice.
- **Como Reproduzir:** Iniciar o sistema em produção apontando para um banco que contenha apenas as 10 tabelas de `REQUIRED_TABLES`; o servidor sobe sem acusar erro.
- **Arquivos Envolvidos:** `src/lib/schema.ts`.
- **Severidade:** **Alta**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-006 — Divergência de Rota para Configurações do Sistema
- **Descrição:** A interface de manutenção de chaves de API e parâmetros operacionais está implementada na rota `/admin/chaves-api`, enquanto referências operacionais e documentações anteriores apontam para `/admin/configuracoes`.
- **Evidência:** `app/admin/chaves-api/page.tsx` existe; `/admin/configuracoes` retorna erro 404.
- **Impacto:** Desorientação operacional durante onboarding de operadores.
- **Arquivos Envolvidos:** `app/admin/chaves-api/page.tsx`, `next.config.ts`.
- **Severidade:** **Informativa**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-007 — Ausência de Componentes de Card Mobile para Cotações e Vendas
- **Descrição:** Enquanto a carteira de segurados chaveia perfeitamente para `ClientesCardMobile` em smartphones, as telas de Cotações e Vendas dependem exclusivamente de scroll horizontal no `TableScrollContainer`.
- **Evidência:** `app/portal/cotacoes/page.tsx` e `app/portal/vendas/page.tsx`.
- **Impacto:** Em telas de 375px (smartphones comuns), o corretor precisa rolar horizontalmente uma tabela de mais de 880px de largura para visualizar o status e os botões de ação de suas propostas.
- **Arquivos Envolvidos:** `app/portal/cotacoes/page.tsx`, `app/portal/vendas/page.tsx`.
- **Severidade:** **Média (Usabilidade Mobile)**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-008 — Upload em Lote de Base64 no Cadastro de Corretoras
- **Descrição:** O formulário de cadastro de corretora em `/admin/corretoras` converte 4 arquivos (PDFs de até 5MB cada) para strings Base64 no navegador e os submete em um único payload JSON para a API.
- **Evidência:** `app/admin/corretoras/page.tsx` e `app/api/admin/corretoras/route.ts`.
- **Impacto:** O payload total pode ultrapassar 15MB a 20MB. Proxies reversos e o Cloudflare possuem limite padrão de tamanho de corpo de requisição (Client Max Body Size), podendo retornar erro HTTP 413 (Payload Too Large) ou sofrer timeout em conexões 4G instáveis.
- **Arquivos Envolvidos:** `app/admin/corretoras/page.tsx`, `app/api/admin/corretoras/route.ts`.
- **Severidade:** **Média**
- **Confiança da Análise:** `Confirmado pelo código`

---

### ISSUE-009 — Divergência Contábil no Valor Total de `payment_orders`
- **Descrição:** Em cobranças parceladas com acréscimo, a coluna `payment_orders.amount_total` armazena o valor à vista (`valorTotal`), enquanto o Asaas cobra as parcelas cheias (`installmentValue * installmentCount`).
- **Evidência:** `src/lib/asaas-service.ts` (linha 550) grava `${valorTotal}` no campo `amount_total`.
- **Impacto:** Após a quitação de todas as parcelas, a coluna `paid_amount` torna-se maior que `amount_total`, distorcendo métricas financeiras.
- **Arquivos Envolvidos:** `src/lib/asaas-service.ts`, `src/lib/webhook-processor.ts`.
- **Severidade:** **Média (Inconsistência Contábil)**
- **Confiança da Análise:** `Confirmado pelo código (DOC-AUDIT-005)`

---

### ISSUE-010 — Race Condition e Cobranças Fantasmas no Asaas por Falta de Lock
- **Descrição:** O endpoint de geração de pagamento verifica a existência prévia de cobrança sem transação e sem lock pessimista (`FOR UPDATE`).
- **Evidência:** `app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts` e `src/lib/asaas-service.ts` (linhas 65-100).
- **Impacto:** Duplo clique ou requisições concorrentes paralelas criam duas cobranças distintas no Asaas. A segunda falha no banco devido à constraint UNIQUE, deixando uma cobrança fantasma aberta no Asaas sem controle do DuoLife.
- **Arquivos Envolvidos:** `app/api/portal/cotacoes/[id]/gerar-pagamento/route.ts`, `src/lib/asaas-service.ts`.
- **Severidade:** **Alta**
- **Confiança da Análise:** `Confirmado pelo código (DOC-AUDIT-006)`

---

### ISSUE-011 — Ausência de Validação de Teto de Cobertura em `cotacoes.importancia_segurada`
- **Descrição:** O schema de validação aceita qualquer valor numérico positivo para a importância segurada, persistindo-o no banco sem confrontar contra a cobertura máxima do produto contratado.
- **Evidência:** `app/api/cotacoes/route.ts` (linhas 41-52).
- **Impacto:** Requisições via API podem forjar coberturas milionárias em planos de 100k ou 300k, poluindo relatórios atuariais.
- **Arquivos Envolvidos:** `app/api/cotacoes/route.ts`.
- **Severidade:** **Média**
- **Confiança da Análise:** `Confirmado pelo código (DOC-AUDIT-010)`

---

### ISSUE-012 — Cupons com Limite de Uso Não Incrementam Contador no Banco
- **Descrição:** A tabela `cupom_usos` possui estrutura para registrar utilizações de cupons, mas nenhuma rota do sistema executa comandos de incremento (`INSERT` ou `UPDATE`) ao emitir apólices.
- **Evidência:** `src/lib/pricing.ts` (linha 62) apenas lê da tabela; nenhuma linha em todo o repositório escreve nela.
- **Impacto:** Cupons promocionais com limite de quantidade (ex: primeiros 50 clientes) nunca expiram pelo uso no DuoLife Hub.
- **Arquivos Envolvidos:** `src/lib/pricing.ts`, `src/lib/insurance-ops.ts`.
- **Severidade:** **Alta (Risco Comercial)**
- **Confiança da Análise:** `Confirmado pelo código (DOC-AUDIT-001)`

