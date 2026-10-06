# Catálogo de Regras de Negócio — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Regras de negócio extraídas diretamente dos serviços de domínio e endpoints.

---

## 1. Visão Geral das Regras de Domínio

As regras de negócio do DuoLife Hub governam a precificação atuarial, travas de segurança comercial, integridade de underwriting, geração documental, conciliação financeira e ciclo de vida de apólices.

---

## 2. Catálogo Estruturado de Regras de Negócio

### BR-001 — Trava Máxima de Desconto Manual Comercial
- **Descrição:** Impõe um teto financeiro inegociável para qualquer desconto percentual concedido manualmente por corretores ou administradores.
- **Condição:** Criação ou edição de cotações, geração de links públicos de venda (`public_sale_links`) e recálculo de preço no servidor.
- **Comportamento:** O sistema limita o desconto a no máximo **40%** (`MAX_MANUAL_DISCOUNT_PERCENT = 40`). Qualquer solicitação com valor superior é truncada para 40% ou rejeitada com erro HTTP 400.
- **Exceções:** Nenhuma. Nem mesmo desenvolvedores ou administradores gerais podem aplicar desconto manual acima de 40% nas rotas de cálculo.
- **Origem no Código:** `src/lib/pricing.ts` (`calcularPrecoServidor`), `app/api/portal/links/route.ts` e constraint no banco `chk_public_sale_links_discount` (migração 016).
- **Status:** `CONFIRMADO`

---

### BR-002 — Tabela de Parcelamento e Restrição do Plano 100K
- **Descrição:** Determina o número máximo de parcelas e a precificação de parcelas por faixa de cobertura.
- **Condição:** Seleção de plano no Passo 1 ou Passo 5 da cotação.
- **Comportamento:**
  - O Plano de **100k** é estritamente **à vista (1x)**. Não permite parcelamento nem no formulário nem no gateway Asaas.
  - Planos a partir de **300k** permitem parcelamento em até **6x**. O motor de cálculo não aplica percentuais dinâmicos de juros; ele consome valores fixos textuais previamente configurados nas colunas da coleção Wix (`parcela2X`, `parcela3X`, etc.) ou no fallback local. Caso esses campos estejam ausentes, divide o valor linearmente (`valorTotal / qtdParcelas`).
- **Exceções:** Se o produto contiver parametrização explícita `maxParcelas === 1`, segue a regra de parcela única independentemente da cobertura.
- **Origem no Código:** `src/lib/pricing.ts` (linhas 157-175) e `src/components/portal/DynamicCotacaoForm.tsx`.
- **Status:** `CORRIGIDO PELA AUDITORIA (DOC-AUDIT-002)`

---

### BR-003 — Precedência de Preços Wix vs Fallback Local
- **Descrição:** Garante resiliência no cálculo de prêmio caso a API da Wix ou a réplica local estejam inacessíveis.
- **Condição:** Execução da função `getPlanoRCAdvogados` durante o cálculo de cotação.
- **Comportamento:** O sistema busca primeiro os valores vigentes na coleção espelho `Planos` do Wix. Caso a coleção não retorne registros ou ocorra erro de conexão, aciona o catálogo estático de contingência `rcAdvogadosConfig.planos`.
- **Exceções:** Ramos diferentes de RC Advogados utilizam exclusivamente suas configurações estáticas em `src/lib/product-schemas/definitions/*`.
- **Origem no Código:** `src/lib/pricing.ts` (`getPlanoRCAdvogados`, linhas 31-40).
- **Status:** `CONFIRMADO`

---

### BR-004 — Bloqueio Absoluto de Cupom em Links Públicos
- **Descrição:** Impede que um cliente final aplique um cupom promocional em uma cotação originada por link público de venda (`public_sale_links`).
- **Condição:** Submissão de proposta pública via `/api/cotacoes` contendo `x-public-token` associado a um link público ativo.
- **Comportamento:** O backend descarta compulsoriamente qualquer código de cupom enviado no payload, atribuindo estritamente `effectiveCupomCodigo = null` (linha 420 de `app/api/cotacoes/route.ts`), aplicando apenas o desconto previamente fixado no link público.
- **Exceções:** Nenhuma. Mesmo links com 0% de desconto cadastrado bloqueiam a utilização de cupons promocionais.
- **Origem no Código:** `app/api/cotacoes/route.ts` (linha 420) e `src/lib/pricing.ts`.
- **Status:** `CORRIGIDO PELA AUDITORIA (DOC-AUDIT-003)`

---

### BR-005 — Arredondamento Monetário e Encargos de Financiamento
- **Descrição:** Regra de cálculo de parcelas e conversão monetária.
- **Condição:** Cálculo de parcelas e apuração de descontos no motor de precificação.
- **Comportamento:** Todos os cálculos individuais utilizam arredondamento centesimal (`Math.round(val * 100) / 100`).
- **Inconsistência Identificada:**
  - Em parcelamentos que usam a tabela comercial com acréscimo (`parcela2X`), a soma `valorParcela * qtdParcelas` é intencionalmente maior que o valor à vista (`valorTotal`), pois embute o custo de financiamento.
  - Em divisões lineares sem tabela (ex: R$ 100,00 em 3x = 3 × R$ 33,33 = R$ 99,99), não há ajuste ou redistribuição automática de centavos de resíduo.
- **Origem no Código:** `src/lib/pricing.ts` (linhas 153, 154, 173, 174) e `src/lib/pdf-contract-generator.ts`.
- **Status:** `CORRIGIDO PELA AUDITORIA (DOC-AUDIT-004)`

---

### BR-006 — Validação de Cupons Promocionais (Sem Incremento de Limite)
- **Descrição:** Regras de validação para aplicação de cupons comerciais.
- **Condição:** Consulta no endpoint `/api/portal/validar-cupom` ou submissão de cotação com código de cupom.
- **Comportamento:** O cupom valida se está na coleção `CUPOMPROMOCIONAL`, se possui flag `cupomAtivo === true`, validade futura e contagem na tabela `cupom_usos` inferior ao limite.
- **Falha Operacional Crítica:** A tabela `cupom_usos` nunca é incrementada por nenhuma rota de emissão ou pagamento do sistema. Consequentemente, o contador de usos é sempre 0 e cupons com limite de utilizações nunca expiram por esgotamento.
- **Origem no Código:** `src/lib/pricing.ts` (`getCupomDescontoValido`, linhas 44-68).
- **Status:** `CORRIGIDO PELA AUDITORIA (DOC-AUDIT-001)`

---

### BR-007 — Lock Pessimista na Concretização de Venda
- **Descrição:** Impede emissão de apólices em duplicidade e cálculos inflados de comissão decorrentes de múltiplos webhooks disparados simultaneamente pelo Asaas.
- **Condição:** Liquidação de cobrança acionando `ensureSaleForPaidQuote`.
- **Comportamento:** Abre transação no PostgreSQL e bloqueia a linha da cotação com `SELECT id FROM cotacoes WHERE id = ... FOR UPDATE`. Verifica se a venda já existe em `sales`; se existir, retorna imediatamente `{ created: false }`.
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/insurance-ops.ts` (linhas 69-89).
- **Status:** `CONFIRMADO`

---

### BR-008 — Alíquota Legal de IOF sobre Seguro
- **Descrição:** Separação do prêmio líquido e cálculo do Imposto sobre Operações Financeiras (IOF).
- **Condição:** Emissão de apólice e cálculo de comissões em `ensureSaleForPaidQuote`.
- **Comportamento:** A comissão não incide sobre o prêmio bruto, mas sobre o prêmio líquido, descontando a taxa legal de **7,38%** de IOF (`IOF_RATE = 0.0738`):
  $$\text{Prêmio Líquido} = \frac{\text{Prêmio Final}}{1 + 0{,}0738}$$
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/insurance-ops.ts` (linhas 113-115).
- **Status:** `CONFIRMADO`

---

### BR-009 — Apuração Hierárquica de Comissões
- **Descrição:** Definição do percentual de comissão devido pela venda de uma apólice.
- **Condição:** Criação do registro de venda em `sales`.
- **Comportamento:** O sistema consulta a tabela `partner_commission_rates` para a combinação `partner_id` + `product_id` vigente na data da venda. Caso não haja taxa cadastrada, utiliza o `base_commission_rate` do produto (tabela `products`).
- **Exceções:** Se nenhuma taxa for encontrada, a taxa de comissão assume 0.00%.
- **Origem no Código:** `src/lib/insurance-ops.ts` (linhas 91-115).
- **Status:** `CONFIRMADO`

---

### BR-010 — Formato Canônico do Número da Apólice
- **Descrição:** Padronização do identificador oficial da apólice emitida.
- **Condição:** Inserção de registro na tabela `sales`.
- **Comportamento:** O número é gerado com o prefixo da seguradora/produto e os 8 primeiros caracteres do ID da cotação em maiúsculas:
  $$\text{policy\_number} = \text{prefixo} + \text{"-"} + \text{cotacaoId.slice}(0, 8)\text{.toUpperCase}()$$
  Exemplo: `DL-RC-E4B2F10A`.
- **Exceções:** Vendas importadas via CSV mantêm o número de apólice original da importação.
- **Origem no Código:** `src/lib/insurance-ops.ts` (linha 116).
- **Status:** `CONFIRMADO`

---

### BR-011 — Vigência Anual Padrão de Apólices
- **Descrição:** Determina o período de cobertura da apólice contratada.
- **Condição:** Emissão formal da venda em `ensureSaleForPaidQuote`.
- **Comportamento:** Define `issue_date = CURRENT_DATE` e `expiry_date = CURRENT_DATE + interval '1 year'`.
- **Exceções:** Importações de dados legados preservam as datas originais do contrato histórico.
- **Origem no Código:** `src/lib/insurance-ops.ts` (linhas 153-154).
- **Status:** `CONFIRMADO`

---

### BR-012 — Triagem e Paginação de Minutas de Contrato
- **Descrição:** Determina qual modelo de contrato PDF é desenhado com base no tipo de plano e regime de contratação.
- **Condição:** Invocação de `determinarTipoContrato` e `renderContratoPdf`.
- **Comportamento:**
  - Plano 100k Novo: Renderiza proposta simplificada em **1 página** (`renderProposta100kNovo`).
  - Plano 100k Renovação: Renderiza proposta em **1 página** com 4 campos de seguro anterior (`renderProposta100kRenovacao`).
  - Planos 300k ou superiores: Renderiza proposta oficial completa em **2 páginas** (`renderPropostaOficial`).
- **Exceções:** Comentários antigos no topo do arquivo citavam 2 e 4 páginas, mas o código atual foi consolidado em 1 e 2 páginas.
- **Origem no Código:** `src/lib/pdf-contract-generator.ts` (linhas 165-197, 334-368).
- **Status:** `CONFIRMADO` (com inconsistência documental no comentário original do arquivo).

---

### BR-013 — Dupla Assinatura Eletrônica Sequencial
- **Descrição:** Garante que o contrato seja formalizado primeiro pela Corretora Master e posteriormente pelo Cliente Segurado.
- **Condição:** Geração de documento via ZapSign direto (`criarDocumentoZapSignDireto`).
- **Comportamento:** Configura dois signatários em ordem sequencial vinculados a âncoras invisíveis no PDF:
  - Signatário 1 (Corretora): `order: 1`, `signature_pattern: '{{assinatura_corretora}}'`.
  - Signatário 2 (Proponente): `order: 2`, `signature_pattern: '{{assinatura_proponente}}'`.
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/pdf-contract-generator.ts` e `src/lib/zapsign-direct-docs.ts`.
- **Status:** `CONFIRMADO`

---

### BR-014 — Validade de Minutas ZapSign
- **Descrição:** Prazo limite para que os signatários formalizem a assinatura eletrônica do contrato.
- **Condição:** Envio de proposta para a API ZapSign.
- **Comportamento:** Documentos gerados recebem data limite de validade de **7 dias corridos** a partir da emissão.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/portal/cotacoes/[id]/gerar-contrato/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-015 — Rate Limiting de Geração Contratual
- **Descrição:** Prevenção contra abusos de consumo da cota de assinaturas da ZapSign.
- **Condição:** Requisição em `/api/portal/cotacoes/[id]/gerar-contrato`.
- **Comportamento:** Limita a 10 chamadas por minuto por IP/usuário. Chamadas excedentes recebem HTTP 429 (Too Many Requests).
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/rate-limit.ts` e `app/api/portal/cotacoes/[id]/gerar-contrato/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-016 — Anti-Replay e Deduplicação de Webhooks Financeiros
- **Descrição:** Proteção contra reprocessamento espúrio de requisições de pagamento.
- **Condição:** Recebimento de requisição em `/api/webhook/asaas`.
- **Comportamento:** O identificador único do evento é consultado na tabela `webhook_events`. Eventos já processados com sucesso são descartados com retorno HTTP 200 informativo.
- **Exceções:** Eventos marcados com falha (`processed = false`) podem ser reprocessados manualmente pela tela de auditoria.
- **Origem no Código:** `app/api/webhook/asaas/route.ts` e `src/lib/webhook-processor.ts`.
- **Status:** `CONFIRMADO`

---

### BR-017 — Emissão Financeira Condicionada à Assinatura
- **Descrição:** O sistema veda a geração de cobrança Asaas antes da formalização jurídica do seguro.
- **Condição:** Tentativa de gerar fatura ou execução de gatilhos automáticos.
- **Comportamento:** A cobrança só é gerada automaticamente se a cotação estiver no status `assinado` (ou confirmação do webhook `doc_signed` do ZapSign).
- **Exceções:** Administradores gerais podem forçar a geração manual de cobrança via endpoint `/api/admin/gerar-cobranca`.
- **Origem no Código:** `app/api/webhook/zapsign/route.ts` e `src/lib/webhook-processor.ts`.
- **Status:** `CONFIRMADO`

---

### BR-018 — Bloqueio de Desvinculação de Cobrança Paga
- **Descrição:** Impede que operadores desvinculem ou excluam do sistema uma fatura que já teve seu valor liquidado pelo cliente.
- **Condição:** Requisição no endpoint administrativo `/api/admin/desvincular-cobranca`.
- **Comportamento:** Consulta a situação da cobrança no Asaas. Se constar como `RECEIVED`, `CONFIRMED` ou `RECEIVED_IN_CASH`, a requisição é rejeitada com erro HTTP 400.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/admin/cotacoes/[id]/desvincular-cobranca/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-019 — Régua de Alerta de Renovação de Apólices
- **Descrição:** Acompanhamento automatizado de vencimento de contratos de seguro.
- **Condição:** Execução diária do cronjob `/api/cron/lifecycle`.
- **Comportamento:** Varre apólices ativas e dispara notificações de e-mail ao corretor e ao segurado em 4 marcos temporais regressivos: **D-60, D-30, D-15 e D-0**. Cada disparo é registrado na tabela `policy_renewal_notifications` garantindo idempotência.
- **Exceções:** Apólices com status diferente de `'ativa'` ou parceiros inativos são ignoradas.
- **Origem no Código:** `src/lib/lifecycle-service.ts` (`processRenewals`, linhas 130-280).
- **Status:** `CONFIRMADO`

---

### BR-020 — Régua de Inadimplência e Cobrança
- **Descrição:** Alertas de parcelas a vencer e cobrança progressiva de faturas em atraso.
- **Condição:** Execução diária do cronjob `/api/cron/lifecycle`.
- **Comportamento:**
  - Faturas a vencer: Alerta preventivo ao corretor em **D-3 e D-1**.
  - Faturas vencidas: Cobrança ao segurado e alerta ao corretor em **D+1, D+3, D+7 e D+15**.
- **Exceções:** Cobranças quitadas, canceladas ou antecipadas não disparam notificações.
- **Origem no Código:** `src/lib/lifecycle-service.ts` (`processDelinquency`, linhas 290-440).
- **Status:** `CONFIRMADO`

---

### BR-021 — Idempotência Diária do Cron de Lifecycle
- **Descrição:** Impede que múltiplos disparos do cron no mesmo dia reenviem mensagens em massa.
- **Condição:** Execução de `/api/cron/lifecycle`.
- **Comportamento:** O banco possui constraints de unicidade compostas:
  - `policy_renewal_notifications`: `UNIQUE (sale_id, window_days, target_date)`
  - `delinquency_notifications`: `UNIQUE (installment_id, notification_type, trigger_day)`
  Tentativas repetidas são silenciosamente ignoradas pelo banco.
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/schema.ts` (linhas 914, 941).
- **Status:** `CONFIRMADO`

---

### BR-022 — Resolução Hierárquica de Origem Comercial (Referral)
- **Descrição:** Determina qual parceiro/corretor recebe a atribuição da venda em fluxos públicos.
- **Condição:** Início de cotação ou navegação em links de contratação.
- **Comportamento:** A atribuição respeita a precedência estrita:
  1. Token explícito de link de venda (`dlk_*`);
  2. Código de vendedor legado do Wix (`wixCode`);
  3. Slug personalizado do parceiro na URL;
  4. Fallback padrão: Corretora Master / Venda Direta DuoLife.
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/referral.ts`.
- **Status:** `CONFIRMADO`

---

### BR-023 — Imutabilidade de Vínculo de Parceiro em Cotações Públicas
- **Descrição:** Evita que requisições públicas alterem o corretor ou a corretora responsável pela proposta.
- **Condição:** Atualização de cotação com `x-public-token`.
- **Comportamento:** Os campos `partner_id` e `corretora_id` permanecem inalterados. Alterações de custódia de clientes e propostas são permitidas exclusivamente no painel administrativo via `/api/admin/clientes/[id]/transferir`.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/cotacoes/route.ts` e `app/api/cotacoes/[id]/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-024 — Expiração e Revogação de Links Públicos de Venda
- **Descrição:** Garante que links promocionais ou desativados não possam ser utilizados.
- **Condição:** Acesso ao endpoint `/api/public/contratacao/[token]`.
- **Comportamento:** Se o registro em `public_sale_links` contiver `status !== 'active'` ou `expires_at < NOW()`, a rota retorna HTTP 404.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/public/contratacao/[token]/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-025 — Isolamento Lógico de Multitenancy por Corretora e Parceiro
- **Descrição:** Segregação rígida de visualização de dados entre empresas parceiras e corretoras.
- **Condição:** Execução de consultas SQL no Portal do Parceiro (`/portal/*`).
- **Comportamento:**
  - Usuários de Corretora enxergam apenas registros com `corretora_id = access.corretoraId`.
  - Diretores de Parceiro enxergam apenas registros com `partner_id = access.partnerId`.
  - Corretores enxergam apenas registros vinculados ao seu próprio `partner_user_id`.
- **Exceções:** Usuários internos (`duolife_admin`, `duolife_dev`) têm visão irrestrita nacional.
- **Origem no Código:** `src/lib/access.ts` e `src/lib/auth.ts`.
- **Status:** `CONFIRMADO`

---

### BR-026 — Bypass de Middleware vs Autenticação de Endpoint
- **Descrição:** Divergência de comportamento entre a camada de borda e os manipuladores de rota.
- **Condição:** Envio do cabeçalho `x-public-token` para rotas com prefixo `/api/portal/*`.
- **Comportamento:** O middleware `proxy.ts` libera o tráfego assumindo que é uma contratação pública. Porém, endpoints internos como `/api/portal/equipe` exigem token JWT e falham em tempo de execução com HTTP 401.
- **Exceções:** Nenhuma.
- **Origem no Código:** `proxy.ts` (linhas 26-30).
- **Status:** `INCONSISTENTE`

---

### BR-027 — Quadro Societário e Uploads Obrigatórios de Corretoras
- **Descrição:** Requisitos regulatórios e documentais para ativação de uma Corretora Master.
- **Condição:** Cadastro de nova corretora em `/api/admin/corretoras`.
- **Comportamento:** O formulário exige obrigatoriamente: Razão Social, CNPJ válido, SUSEP, Telefone de cadastro, Dados completos do Sócio Administrador (Nome, CPF validado matematicamente, RG, E-mail e Telefone), Dados bancários com Chave PIX, e o anexo em Base64 dos 4 documentos:
  1. Contrato Social consolidado;
  2. Cartão CNPJ;
  3. Documento de Identidade do Sócio;
  4. Comprovante Bancário/PIX.
- **Exceções:** Nenhuma. O schema Zod rejeita o cadastro se faltar qualquer um dos documentos.
- **Origem no Código:** `app/api/admin/corretoras/route.ts` e migração `020`.
- **Status:** `CONFIRMADO`

---

### BR-028 — Bloqueio de Busca Pública de Clientes
- **Descrição:** Proteção de dados pessoais (LGPD) contra varredura pública.
- **Condição:** Consulta no endpoint de busca de segurados `/api/clientes/busca`.
- **Comportamento:** Se a requisição contiver o header `x-public-token`, a API retorna HTTP 401 sumário. Autocomplete de clientes cadastrados é exclusivo de operadores autenticados no portal.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/clientes/busca/route.ts`.
- **Status:** `CONFIRMADO`

---

### BR-029 — Restrição de Expurgo de Dados a Ambientes de Desenvolvimento
- **Descrição:** Impede a exclusão acidental ou desautorizada de registros em produção.
- **Condição:** Chamada a endpoints destrutivos (`DELETE /api/admin/cotacoes/[id]` ou `DELETE /api/admin/clientes/[id]`).
- **Comportamento:** A rota checa `process.env.NODE_ENV !== 'production'`. Se estiver em produção, retorna HTTP 403.
- **Exceções:** Nenhuma.
- **Origem no Código:** `app/api/admin/cotacoes/[id]/route.ts` e `app/api/admin/clientes/[id]/route.ts`.
- **Status:** `CONFIRMADO` (com ausência de rotina oficial de anonimização LGPD).

---

### BR-030 — Rotação Segura de Refresh Tokens
- **Descrição:** Política de renovação de sessão e ciclo de vida de credenciais.
- **Condição:** Renovação de token em `/api/auth/refresh`.
- **Comportamento:** O token enviado pelo cookie `duolife_refresh` tem seu hash conferido na tabela `refresh_tokens`. Se válido e não revogado, o sistema marca o token atual como revogado (`revoked = true`) e emite um novo par de tokens (JWT de 8 horas e novo refresh token de 30 dias).
- **Exceções:** Nenhuma.
- **Origem no Código:** `src/lib/refresh-token.ts` e `app/api/auth/refresh/route.ts`.
- **Status:** `CONFIRMADO`
