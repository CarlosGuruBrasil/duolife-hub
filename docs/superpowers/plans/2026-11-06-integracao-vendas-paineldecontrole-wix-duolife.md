# Integração de Vendas do Painel de Controle (Wix Net4Life) ao DuoLife Hub

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o fluxo de vendas do Painel de Controle no Wix (`SITE RC`) à API do DuoLife Hub, garantindo que propostas, contratos, cobranças e liquidações manuais sejam persistidos automaticamente no banco do DuoLife Hub, além de sincronizar retroativamente a venda do cliente CPF `118.336.267-61`.

**Architecture:** 
1. No DuoLife Hub: criação de endpoint S2S `/api/v1/integracao/wix/cotacoes/sincronizar-venda` que recebe o registro consolidado do Wix (`Import1`), cadastra cliente (`insurance_clients`), proposta (`cotacoes`), contrato (`document_signatures`), cobranças (`payment_orders`/`payment_installments`) e converte automaticamente em apólice (`sales`) caso já esteja quitada/assinada.
2. No conector Wix (`duolifeHub.jsw`): exportação do método `sincronizarVendaWix(dados)` apontando para a nova rota S2S.
3. No Wix Backend (`saveClientCore` em `client.js`): disparo automático de `criarCotacao` no momento em que o cliente é cadastrado no painel, persistindo `cotacaoId` na coleção `Import1`.
4. No Wix Frontend (`contrato.js` e `transacaoDataHelper.js`): acoplamento resiliente de `gerarContrato` e `obterOuGerarPagamento` com fallback transparente.
5. No Wix Webhooks (`ZapSignWebHook.js` e `ClienteVigencia.js`/função de contingência): gatilhos de sincronização e acoplamento ao assinar contrato ou pagar cobrança.

**Tech Stack:** Next.js 15, TypeScript, PostgreSQL (`postgres.js`), Wix Velo (JavaScript backend/frontend), ZapSign API, Asaas API v3.

---

## Global Constraints
- Todas as respostas e comentários em Português Brasileiro.
- Todos os arquivos com codificação estritamente UTF-8.
- Estilo sênior: sem soluções provisórias ou hacks frágeis; todas as chamadas externas com `try/catch` e fallback transparente para manter o painel do Wix 100% funcional caso o DuoLife Hub esteja temporariamente fora.
- Testes automatizados aprovados no Vitest antes de declarar conclusão.

## Review Focus
1. **Fallback Resiliente:** Se a chamada para a API do DuoLife falhar no Wix, o fluxo do painel legado NÃO pode quebrar — deve continuar salvando no `Import1` e logar o aviso.
2. **Deduplicação de Vendas:** O endpoint `sincronizar-venda` deve ser idempotente: se chamado múltiplas vezes com o mesmo CPF/cotação, deve atualizar os registros existentes em vez de criar apólices ou cotações duplicadas.
3. **Mapeamento de Parcelas e Vigência:** Garantir que o valor total, quantidade de parcelas, datas de vigência e URLs de boleto/proposta sejam extraídos e normalizados corretamente.
4. **Idempotência de Assinatura e Pagamento:** Garantir que ordens de pagamento e assinaturas associadas ao documento não entrem em conflito de chaves únicas.

---

### Task 1: Criar Endpoint S2S `sincronizar-venda` no DuoLife Hub

**Files:**
- Create: `C:\Apps e Systems\Sistemas\DUOLife\app\api\v1\integracao\wix\cotacoes\sincronizar-venda\route.ts`
- Test: `C:\Apps e Systems\Sistemas\DUOLife\tests\unit\wix-sincronizar-venda.test.ts`

**Interfaces:**
- Consumes: `authenticateWixRequest`, `upsertInsuranceClient`, `resolvePartnerForWix`, `ensureSaleForPaidQuote`
- Produces: `POST /api/v1/integracao/wix/cotacoes/sincronizar-venda` retornando `{ ok: true, success: true, cotacaoId, saleId?, status }`

- [ ] **Step 1: Escrever teste unitário para `sincronizar-venda`**
- [ ] **Step 2: Rodar teste e confirmar que falha com 404/not found**
- [ ] **Step 3: Implementar `app/api/v1/integracao/wix/cotacoes/sincronizar-venda/route.ts`**
  - Mapear payload do Wix (dados de cliente, OAB, vigência, valores, token ZapSign, checkoutId Asaas)
  - Cadastrar/atualizar cliente em `insurance_clients`
  - Inserir/atualizar cotação em `cotacoes`
  - Se possuir token ZapSign ou urlProposta, inserir em `document_signatures`
  - Se possuir checkoutId/installment, inserir em `payment_orders` e `payment_installments`
  - Se o status indicar quitação/venda fechada, acionar `ensureSaleForPaidQuote` gerando a apólice em `sales`
- [ ] **Step 4: Rodar teste unitário e verificar aprovação**

---

### Task 2: Atualizar Conector DuoLife Hub no Wix (`duolifeHub.jsw`)

**Files:**
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\conectores\duolifeHub.jsw`

**Interfaces:**
- Produces: `sincronizarVenda(dadosVenda)` exportada para uso no backend e frontend do Wix

- [ ] **Step 1: Adicionar a função `sincronizarVenda(dados)` em `duolifeHub.jsw`**
- [ ] **Step 2: Adicionar tratamento defensivo para garantir envio de `wixId` e dados consolidados**

---

### Task 3: Integrar Cadastro de Clientes do Painel ao DuoLife Hub

**Files:**
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\core\repository\client.js`
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\public\admin\cliente.js`

**Interfaces:**
- Consumes: `criarCotacao` de `backend/conectores/duolifeHub`
- Produces: `novoCliente.cotacaoId` persistido em `Import1`

- [ ] **Step 1: Em `src/backend/core/repository/client.js`, integrar `criarCotacao` em `saveClientCore`**
  - Montar payload padronizado para a API DuoLife Hub
  - Vincular `cotacaoId` retornado ao registro antes de salvar em `Import1`
  - Adicionar bloco `try/catch` garantindo que falhas de rede não impeçam o salvamento no Wix
- [ ] **Step 2: Em `src/backend/core/repository/client.js`, atualizar `updateClientCore`**
  - Se `clientData.cotacaoId` estiver ausente, registrar no DuoLife Hub e salvar o id

---

### Task 4: Integrar Geração de Contrato e Cobrança no Painel de Transações

**Files:**
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\public\admin\contrato.js`
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\public\admin\helpers\transacaoDataHelper.js`

**Interfaces:**
- Consumes: `gerarContrato`, `obterOuGerarPagamento`, `verificarAssinatura`, `sincronizarVenda` de `backend/conectores/duolifeHub`

- [ ] **Step 1: Em `src/public/admin/contrato.js`, integrar `gerarContrato` do DuoLife Hub**
  - Usar `cotacaoId` quando disponível com fallback para o motor local do ZapSign
  - Em `concluirAssinatura`, notificar assinatura ao DuoLife Hub via `verificarAssinatura` ou `sincronizarVenda`
- [ ] **Step 2: Em `src/public/admin/helpers/transacaoDataHelper.js`, integrar `processarBoleto`**
  - Chamar `obterOuGerarPagamento` do DuoLife Hub quando `cotacaoId` estiver disponível
  - Atualizar campos de boleto/checkoutId e replicar para o DuoLife Hub

---

### Task 5: Integrar Webhooks do Wix (`ZapSignWebHook.js` e `AsaasWebHook.js`)

**Files:**
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\webhooks\ZapSignWebHook.js`
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\webhooks\AsaasWebHook.js`

- [ ] **Step 1: No `ZapSignWebHook.js`, sincronizar contrato assinado e boleto com o DuoLife Hub**
- [ ] **Step 2: No `AsaasWebHook.js`, notificar confirmação de pagamento para sincronização imediata no DuoLife Hub**

---

### Task 6: Endpoint de Sincronização Sob Demanda e Importação do Cliente CPF `118.336.267-61`

**Files:**
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\http-functions.js`
- Modify: `C:\Apps e Systems\Sistemas\SITE RC\src\backend\webhooks\ClienteVigencia.js` (ou novo endpoint seguro `sincronizarCliente`)

- [ ] **Step 1: Criar função no Wix para buscar cliente por CPF no `Import1` e despachar para o DuoLife Hub via `sincronizarVenda`**
- [ ] **Step 2: Executar a sincronização para o CPF `118.336.267-61`**
- [ ] **Step 3: Validar a presença do cliente, cotação, contrato e cobrança/apólice no DuoLife Hub**
- [ ] **Step 4: Executar suíte de testes do Vitest (`npm run test`) e build de produção (`npm run build`) no DuoLife Hub**
