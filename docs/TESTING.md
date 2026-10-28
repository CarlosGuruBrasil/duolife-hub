# Estratégia e Lacunas de Testes — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Inventário dos scripts de teste existentes, suíte de testes automatizados e diagnóstico de cobertura.

---

## 1. Estado Atual dos Testes Automatizados

O repositório adota o **Vitest** como o test runner oficial para testes unitários e de integração leve, configurado no `vitest.config.mts` e com scripts padronizados no `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Como Executar os Testes Automatizados
- **Execução em lote (CI e pipelines locais):**
  ```bash
  npm test
  ```
- **Modo observador / interativo (desenvolvimento):**
  ```bash
  npm run test:watch
  ```

### Estrutura da Suíte em `tests/`
A suíte de testes unitários automatizados fica localizada na pasta `tests/` na raiz do projeto (suportando também testes adjacentes `src/**/*.test.ts`):

| Arquivo de Teste | Finalidade e Escopo | Tipo |
|---|---|---|
| `tests/smoke.test.ts` | Teste de sanidade do ambiente de execução do Vitest e compatibilidade de tipagens no DuoLife Hub. | Smoke / Sanidade |
| `tests/unit/documento.test.ts` | Validação estrita dos algoritmos de checagem e formatação de CPF/CNPJ (`validarCpf`, `validarCnpj`, `somenteDigitos`, `formatarCpf`, `formatarCnpj`, `formatarDocumento`). | Unitário / Regra de Negócio |
| `tests/unit/business-days.test.ts` | Validação de cálculo de dias úteis, salto de fins de semana, feriados nacionais fixos/móveis e vencimentos de fatura (`isBusinessDay`, `addBusinessDays`, `calculateBillingDueDate`). | Unitário / Regra de Negócio |
| `tests/unit/policy-vigencia.test.ts` | Validação de datas de início e término de vigência de apólices e regras de renovação. | Unitário / Regra de Negócio |
| `tests/unit/status-matrix.test.ts` | Validação das transições da máquina de estados de propostas e apólices (`status-matrix.ts`). | Unitário / Regra de Negócio |
| `tests/unit/proxy-guard.test.ts` | Validação de segurança, headers e guard rails de proxies e rotas protegidas. | Unitário / Segurança |
| `tests/unit/corretora-resolver.test.ts` | Validação do roteamento, isolamento multi-tenant e resolução de corretores. | Unitário / Arquitetura |

Além dos testes unitários formais do Vitest, a equipe de engenharia mantém uma suíte complementar de **scripts de teste automatizados e testes end-to-end executáveis via CLI** localizados no diretório `scripts/` utilizando `tsx` (TypeScript Execute).

---

## 2. Inventário de Scripts de Teste Existentes

| Script de Teste | Finalidade e Escopo | Como Executar |
|---|---|---|
| `scripts/test-cotacao-schema-resilience.ts` | Valida a resiliência do schema Zod em `/api/cotacoes`, aceitação de valores nulos, LMI zerado e normalização de documentos. | `npx tsx scripts/test-cotacao-schema-resilience.ts` |
| `scripts/test-dashboard-partner-period.ts` | Suíte de 10 testes que valida agregações SQL, exclusão de parceiros inativos e competência cronológica por data de emissão. | `npx tsx scripts/test-dashboard-partner-period.ts` |
| `scripts/test-pricing-multi-ramo.ts` | Valida o cálculo matemático do motor de precificação (`pricing.ts`), juros de parcelamento e travas de desconto. | `npx tsx scripts/test-pricing-multi-ramo.ts` |
| `scripts/test-multi-ramo-e2e.ts` | Teste de ponta a ponta simulando a criação de propostas para diferentes ramos profissionais. | `npx tsx scripts/test-multi-ramo-e2e.ts` |
| `scripts/test-dueDate-rule.ts` | Valida o algoritmo de cálculo de data de vencimento em dias úteis (`business-days.ts`), ignorando fins de semana e feriados. | `npx tsx scripts/test-dueDate-rule.ts` |
| `scripts/test-link-exclusivo-desconto.ts` | Testa a trava comercial de no máximo 40% de desconto e a imunidade de links públicos contra cupons concorrentes. | `npx tsx scripts/test-link-exclusivo-desconto.ts` |
| `scripts/test-corretora-auth.ts` | Valida o isolamento de login, emissão de JWT e permissões de gestores de Corretora Master. | `npx tsx scripts/test-corretora-auth.ts` |
| `scripts/test-corretora-e2e.ts` | Teste end-to-end do ciclo completo de Corretoras (cadastro, gestão de sócios e listagem). | `npx tsx scripts/test-corretora-e2e.ts` |
| `scripts/test-novos-modelos-contrato.ts` | Valida a geração dos 3 templates de minutas PDF (100k Novo 1 pág, 100k Renovação 1 pág e Oficial 2 págs). | `npx tsx scripts/test-novos-modelos-contrato.ts` |
| `scripts/test-zapsign-sign-url-flow.ts` | Testa a esteira sequencial de dupla assinatura na ZapSign e captura de URLs de signatários. | `npx tsx scripts/test-zapsign-sign-url-flow.ts` |
| `scripts/test-formas-pagamento-asaas.ts` | Testa a emissão de cobranças no Asaas para Boleto, PIX e cartão. | `npx tsx scripts/test-formas-pagamento-asaas.ts` |
| `scripts/test-email-sync.ts` | Testa o envio e sincronização de templates de e-mail via Net4Life e fallback SMTP. | `npx tsx scripts/test-email-sync.ts` |

---

## 3. Validação de Build e Tipagem (CI/CD Local e Remoto)

Antes de qualquer deploy e a cada Pull Request/Push para as branches `main` e `develop`, a integridade do código é verificada por meio do pipeline de CI (`.github/workflows/ci.yml`):
1. **Verificação Estrita de Tipos:**
   ```bash
   npx tsc --noEmit
   ```
2. **Execução de Testes Automatizados:**
   ```bash
   npm test
   ```
3. **Build de Produção com Turbopack:**
   ```bash
   npm run build
   ```
   *Compila com sucesso todas as 84 rotas da aplicação sem avisos impeditivos.*

---

## 4. Lacunas de Testes Identificadas

Embora a suíte de testes unitários com Vitest e a esteira de CI tenham sido estabelecidas, o projeto possui as seguintes oportunidades mapeadas de evolução da qualidade:

1. **[RESOLVIDO em 28/10/2026] Runner Unificado de Testes Unitários e Pipeline CI/CD:**
   - *Status:* Resolvido. O Vitest v5 foi integrado como runner oficial via `npm test`, estruturando a pasta `tests/` para testes unitários de funções puras e regras de negócio (`documento.ts`, `business-days.ts`, etc.) e integrado ao GitHub Actions (`.github/workflows/ci.yml`) com execução automática em pull requests e pushes para `main` e `develop`.
2. **Falta de Testes de Componentes Frontend (React Testing Library):**
   - *Impacto:* O formulário `DynamicCotacaoForm.tsx` possui dezenas de transições de estado entre etapas e validações imperativas que não são testadas automaticamente na camada de interface.
   - *Recomendação:* Criar testes de renderização e preenchimento de formulário com `@testing-library/react`.
3. **Ausência de Testes End-to-End no Navegador (Playwright / Cypress):**
   - *Impacto:* A jornada visual do cliente final em `/contratar/[token]` e o fluxo completo do corretor em `/portal` dependem de homologação manual em navegador.
   - *Recomendação:* Implementar suíte E2E em Playwright cobrindo os 6 passos da cotação e a assinatura digital simulada.
4. **Falta de Mocks Padronizados para Webhooks Externos:**
   - *Impacto:* Testes de integração dependem de credenciais de sandbox ativas do Asaas e ZapSign.
   - *Recomendação:* Criar uma suíte de fixtures com payloads gravados para testar o `webhook-processor.ts` de forma 100% offline.
