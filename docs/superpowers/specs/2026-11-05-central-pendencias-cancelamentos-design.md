# Especificação de Design — Central de Pendências e Cancelamentos (DuoLife Hub)

**Data:** 2026-11-05  
**Autor:** Carlos Eduardo Santos de Souza / Antigravity  
**Status:** Em Revisão (Aguardando Aprovação)  
**Tópico:** Central de Pendências e Cancelamentos comercial e financeira multi-tenant  

---

## 1. Contexto e Motivação (Intent & The Why)

No ecossistema de seguros da **DuoLife Hub**, cotações, propostas e apólices emitidas passam por esteiras comerciais e financeiras automatizadas integradas ao Asaas e ZapSign. Recentemente, foi homologada a **Regra de Negócio BR-031** (`docs/BUSINESS_RULES.md`), que formaliza os prazos de tolerância para cancelamento automático por inadimplência:
- **1ª Parcela (Entrada):** Tolerância de até **2 dias úteis** após o vencimento.
- **Demais Parcelas (Carteira):** Tolerância de até **30 dias corridos**, prorrogados para o 1º dia útil subsequente caso o 30º dia recaia em fim de semana ou feriado nacional.

Entretanto, não havia uma tela centralizada e consultiva que permitisse a corretores, gerentes de equipe, diretores de corretora e administradores nacionais visualizarem com clareza quais contratações estão em risco (parcelas vencidas dentro ou fora da tolerância) e quais já foram efetivamente canceladas.

O objetivo deste projeto é implementar a **Central de Pendências e Cancelamentos**, disponível tanto no Portal do Parceiro (`/portal/pendencias-cancelamentos`) quanto no Painel Administrativo (`/admin/pendencias-cancelamentos`), garantindo isolamento hierárquico estrito no banco de dados, sem duplicidades e com cálculo financeiro exato.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Metas (Goals)
1. **Central Consultiva com 3 Abas:**
   - **Aba 1 (Em Atraso):** Exibir exclusivamente cotações e apólices com parcelas vencidas, não pagas e ainda não canceladas.
   - **Aba 2 (Canceladas):** Exibir cotações e apólices canceladas (inadimplência, recusa de assinatura, desistência, cancelamento administrativo).
   - **Aba 3 (Visão Geral):** Consolidar ambas as situações com identificação visual distinta e imediata.
2. **Eliminação de Duplicidades:** Cada contratação deve figurar como um registro único no grid principal (mesmo que possua 2 ou mais parcelas em atraso e mesmo que coexista em `cotacoes` e `sales`).
3. **Detalhamento Expansível de Parcelas:** Acordeão por linha permitindo inspecionar cada parcela (número, vencimento, valor, status financeiro, dias de atraso, data limite de cancelamento BR-031 e link Asaas).
4. **Isolamento Hierárquico no Backend (RBAC Multi-tenant):**
   - Vendedor (`partner_broker`): apenas seus próprios registros.
   - Gestor (`partner_manager`): próprios + subordinados diretos e indiretos (`visibleUserIds`).
   - Corretora (`corretora_admin`, `corretora_manager`, `corretora_staff`): todos da sua `corretora_id`.
   - Diretor do Parceiro (`partner_director`): todos do seu `partner_id`.
   - Administrador/Desenvolvedor (`duolife_admin`, `duolife_dev`, `duolife_staff`): visão corporativa global.
5. **Indicadores Resumidos (KPIs no Topo):**
   - Total de contratações em atraso e valor total em atraso.
   - Total de contratações canceladas e valor original contratado.
6. **Alta Performance:** Paginação e filtros dinâmicos aplicados diretamente na consulta SQL via CTEs, sem carga de registros completos na memória Node.js.

### Não-Objetivos (Non-Goals)
- A página é **estritamente consultiva**: não executará cancelamentos em lote, estornos ou cancelamentos manuais de cobranças no Asaas nesta fase.
- Não alterará regras de comissionamento de vendas ativas.
- Não alterará a rotina diária de varredura de ciclo de vida (`lifecycle-service.ts`) ou o webhook do Asaas.

### Anti-Objetivos (Anti-Goals)
- **Anti-Goal 1:** Fazer filtros de autorização ou de busca apenas no frontend (risco crítico de vazamento de dados entre corretoras concorrentes).
- **Anti-Goal 2:** Carregar todo o banco de dados em memória e realizar paginação/filtros com `.filter()` e `.slice()` no Node.js.
- **Anti-Goal 3:** Criar status de negócio paralelos ou conflitantes com `src/lib/status-matrix.ts`.

---

## 3. Restrições e Conformidade Técnica

1. **Design System DuoLife:**
   - Tema Claro padrão: fundo `#f7faf9` (`var(--surface)`), cards e containers `bg-white` ou `bg-gray-50`, bordas `border-gray-200`, textos principais `text-gray-900`.
   - Badges conforme matriz de status: `bg-[cor]-50 border-[cor]-200 text-[cor]-800 rounded-full`.
   - Responsividade obrigatória: Mobile (375px), Tablet (768px), Desktop (1440px), botões e links com área mínima de toque de 44x44px.
2. **Conexão com Regra BR-031:**
   - Reutilização mandatória de `src/lib/business-days.ts` (`calculateCancellationDeadline`, `isInstallmentPastCancellationDeadline`, `addBusinessDays`, `ensureNextBusinessDay`).
3. **Conexão com Controle de Acesso:**
   - Reutilização mandatória de `src/lib/auth.ts` (`verifyAuth`, `getPartnerAccessContext`, `isInternalUser`).
4. **Sem Processos Zumbis:** Operar estritamente com `npm run dev` / scripts de limpeza.

---

## 4. Abordagens Consideradas e Escolha Arquitetural

| Abordagem | Descrição | Prós | Contras | Decisão |
|---|---|---|---|---|
| **1. Service Unificado com CTEs SQL e Server Component Modular** | Criação de `src/lib/pendencias-cancelamentos-service.ts` com CTEs no PostgreSQL, paginação nativa e componente `PendenciasCancelamentosView` reutilizado em `/admin` e `/portal`. | Desempenho excelente, zero risco N+1, sem sobrecarga de memória, isolamento SQL estrito, reutilização máxima de UI. | Exige modelagem cuidadosa das cláusulas dinâmicas da CTE. | **ESCOLHIDA (Aprovada pelo usuário)** |
| **2. Junção em Memória no Node.js** | Consultas separadas de cotações, vendas e parcelas, com junção e paginação em JavaScript. | SQLs individuais simples. | Viola o requisito 10 de performance, impede `LIMIT`/`OFFSET` real no banco, consome alta memória. | Rejeitada |
| **3. View Relacional no Banco de Dados** | Criação de `CREATE VIEW vw_pendencias_cancelamentos` no PostgreSQL. | Simplifica chamadas TypeScript. | Adiciona acoplamento estrutural em migrações DDL e dificulta mocks em testes unitários. | Rejeitada |

---

## 4.1 Resoluções Técnicas do Builder Check

1. **Origem de `motivoCancelamento` e `dataCancelamento` (Não-Destrutivo, sem DDL):**
   - `dataCancelamento`: Obtida diretamente de `COALESCE(s.updated_at, c.updated_at)`.
   - `motivoCancelamento`: Obtido priorizando `c.metadata->>'cancel_reason'` ou `s.metadata->>'cancel_reason'`. Na ausência, inferido via regras de negócio:
     - Se `c.status = 'recusada'` ou status de assinatura for recusado -> *"Recusa de Assinatura"*.
     - Se houve parcelas vencidas no momento do cancelamento ou trigger de inadimplência -> *"Inadimplência (Regra BR-031)"*.
     - Se `notes` ou `metadata` registrar desistência -> *"Desistência do Cliente"*.
     - Caso contrário -> *"Cancelamento Administrativo"*.
2. **Execução de Paginação e BR-031:**
   - A paginação no banco (`LIMIT`/`OFFSET`) e a filtragem das abas (`em_atraso`, `canceladas`, `visao_geral`) rodam 100% no SQL da CTE com base nas condições canônicas (`status = 'cancelada'` vs `qtd_parcelas_vencidas > 0`).
   - A ordenação de criticidade inicial prioriza `maior_dias_atraso DESC` e `min_due_date ASC`.
   - A data limite exata com feriados nacionais e prorrogações da BR-031 é enriquecida com `calculateCancellationDeadline(dueDate, installmentNumber)` de `business-days.ts` sobre os registros paginados da página atual, garantindo precisão atuarial sem divergência de calendário.
3. **Escopo dos KPIs:**
   - Os 4 cards de KPIs herdam os filtros de busca aplicados (cliente, corretora, vendedor, produto, períodos), mas **não filtram pela aba**, permitindo ao usuário enxergar simultaneamente o total em atraso e o total cancelado do conjunto filtrado.
4. **Elegibilidade de Rascunhos:**
   - Cotações que continuam em status `rascunho` ou `enviada` ativas não são consideradas canceladas. A Aba 2 lista exclusivamente cotações e vendas com cancelamento formal registrado (`status IN ('cancelada', 'recusada')` ou contrato cancelado).


---

## 5. Arquitetura Detalhada da Solução

### 5.1 Modelagem de Tipos (`src/types/pendencias-cancelamentos.ts`)

```typescript
export type PendenciaTab = 'em_atraso' | 'canceladas' | 'visao_geral';

export type TipoRegistro = 'cotacao' | 'venda';

export interface ParcelaDetalhe {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paidAt: string | null;
  status: string; // 'pending' | 'overdue' | 'paid' | 'cancelled'
  daysOverdue: number;
  cancellationDeadline: string; // YYYY-MM-DD (BR-031)
  isPastDeadline: boolean;
  externalPaymentId: string | null;
  bankSlipUrl?: string | null;
  pixQrCodeUrl?: string | null;
  invoiceUrl?: string | null;
}

export interface PendenciaCancelamentoItem {
  id: string; // cotacao_id (âncora única da contratação)
  cotacaoId: string;
  saleId: string | null;
  tipoRegistro: TipoRegistro;
  policyNumber: string | null;
  clientName: string;
  clientCpfCnpj: string;
  clientEmail: string | null;
  clientPhone: string | null;
  corretoraId: string;
  corretoraNome: string;
  partnerId: string;
  partnerNome: string;
  managerUserId: string | null;
  managerNome: string | null;
  vendedorUserId: string | null;
  vendedorNome: string | null;
  productId: string;
  productName: string;
  valorTotalContratacao: number;
  situacaoContrato: 'em_atraso_tolerancia' | 'em_atraso_critico' | 'cancelada';
  motivoCancelamento?: string | null;
  dataCancelamento?: string | null;
  valorRecebidoAntesCancelamento?: number;
  // Métricas de parcelas em atraso
  qtdParcelasVencidas: number;
  valorTotalAtraso: number;
  dataVencimentoMaisAntiga: string | null;
  maiorDiasAtraso: number;
  dataLimiteCancelamentoMaisCritica: string | null;
  // Detalhes completos das parcelas para o acordeão
  parcelas: ParcelaDetalhe[];
}

export interface PendenciasKPIs {
  totalContratacoesEmAtraso: number;
  valorTotalEmAtraso: number;
  totalContratacoesCanceladas: number;
  valorOriginalTotalCanceladas: number;
}

export interface PendenciasFiltros {
  tab?: PendenciaTab;
  q?: string; // Busca textual (cliente, CPF, apólice, cotação)
  corretoraId?: string;
  partnerId?: string;
  managerUserId?: string;
  vendedorUserId?: string;
  productId?: string;
  tipoRegistro?: TipoRegistro | 'todos';
  situacao?: string;
  motivoCancelamento?: string;
  diasAtrasoMin?: number;
  diasAtrasoMax?: number;
  vencimentoDe?: string;
  vencimentoAte?: string;
  cancelamentoDe?: string;
  cancelamentoAte?: string;
  page?: number;
  pageSize?: number;
  orderBy?: 'vencimento' | 'dias_atraso' | 'valor' | 'data_cancelamento';
  orderDir?: 'asc' | 'desc';
}

export interface PendenciasPaginadasResult {
  items: PendenciaCancelamentoItem[];
  kpis: PendenciasKPIs;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### 5.2 Serviço de Backend (`src/lib/pendencias-cancelamentos-service.ts`)

A lógica de consulta utilizará **duas CTEs principais**:
1. `contratacoes_base`: Junção de `cotacoes` (âncora) com `sales` opcional (`sales.cotacao_id = cotacoes.id`), `corretoras`, `partners`, `partner_users` (vendedor) e `partner_users` (gestor via `manager_user_id`).
2. `installments_agg`: Agregação de `payment_installments` agrupada por `cotacao_id`, calculando:
   - Contagem e soma de parcelas vencidas (`due_date < CURRENT_DATE` e não pagas).
   - Menor `due_date` entre as vencidas.
   - Maior atraso em dias (`CURRENT_DATE - MIN(due_date)`).
   - Total pago acumulado (`SUM(amount) WHERE paid_at IS NOT NULL`).
   - JSON array com a listagem completa das parcelas ordenadas por `installment_number ASC`.

#### Lógica de Classificação e Regra BR-031:
- Se `sales.status = 'cancelada'` OU `cotacoes.status = 'cancelada'`:
  - `situacaoContrato = 'cancelada'`.
  - Classificada para a **Aba 2 (Canceladas)** e **Aba 3 (Visão Geral)**.
- Se não cancelada e possui `qtdParcelasVencidas > 0`:
  - Se a parcela vencida mais antiga já ultrapassou a tolerância calculada via `calculateCancellationDeadline(due_date, installment_number)`:
    - `situacaoContrato = 'em_atraso_critico'`.
  - Caso contrário (dentro da tolerância de 2 dias úteis para parcela 1 ou 30 dias prorrogados para parcelas 2+):
    - `situacaoContrato = 'em_atraso_tolerancia'`.
  - Classificada para a **Aba 1 (Em Atraso)** e **Aba 3 (Visão Geral)**.
- Se não cancelada e sem parcelas vencidas:
  - Registro ignorado (não pertence à central de pendências).

#### Injeção de Segurança RBAC no SQL:
- **`duolife_admin` / `duolife_dev` / `duolife_staff`:** Sem cláusula restritiva de inquilino.
- **Corretora (`corretora_admin`, `corretora_manager`, `corretora_staff`):**
  ```sql
  WHERE (c.corretora_id = ${access.corretoraId} OR s.corretora_id = ${access.corretoraId})
  ```
- **Diretor do Parceiro (`partner_director`):**
  ```sql
  WHERE c.partner_id = ${access.partnerId}
  ```
- **Gestor do Parceiro (`partner_manager`):**
  ```sql
  WHERE c.partner_id = ${access.partnerId} AND c.partner_user_id IN ${sql(access.visibleUserIds)}
  ```
- **Corretor (`partner_broker` / `partner_partner`):**
  ```sql
  WHERE c.partner_id = ${access.partnerId} AND c.partner_user_id = ${user.userId}
  ```

### 5.3 Componentes de Interface e Rotas

1. **Componente Compartilhado (`src/components/pendencias/PendenciasCancelamentosView.tsx`):**
   - **Cabeçalho:** Título, subtítulo institucional e botão de atualização rápida.
   - **Cards de Indicadores (KPIs):** 4 cards modernos no topo:
     1. Contratações em Atraso (número + badge informativo).
     2. Total Financeiro em Atraso (R$ formatado em destaque).
     3. Contratações Canceladas (número total).
     4. Valor Original Cancelado (R$ com nota explicativa de que representa o valor original, não prejuízo líquido).
   - **Abas de Navegação:**
     - `Em Atraso` (com badge numérico).
     - `Canceladas` (com badge numérico).
     - `Visão Geral` (com badge do total consolidado).
   - **Barra de Filtros Combináveis:**
     - Busca textual universal (Cliente, CPF/CNPJ, Cotação, Apólice).
     - Filtros suspensos por Corretora, Gestor, Vendedor (respeitando a hierarquia do usuário logado).
     - Filtros por Faixa de Atraso (<= 5 dias, 6-15 dias, 16-30 dias, > 30 dias).
     - Filtro por Motivo de Cancelamento.
     - Seletores de período de vencimento e período de cancelamento.
   - **Tabela Responsiva com Acordeão de Parcelas:**
     - Colunas no Desktop: Cotação/Apólice, Cliente, Corretora/Equipe, Produto, Valor Total, Parcelas em Atraso / Atraso Máx., Situação / Prazo BR-031, Ações.
     - Botão chevron para expandir a linha e revelar o extrato completo de parcelas (número, valor, vencimento, situação, prazo limite BR-031 e link externo de boleto/Pix quando houver).
     - Links diretos com preservação de contexto para `/portal/cotacoes/[id]`, `/portal/vendas/[id]`, `/admin/cotacoes/[id]` ou `/admin/vendas/[id]`.
   - **Paginação no Servidor:** Seletor de tamanho de página (10, 25, 50, 100) e controle de páginas.

2. **Rotas Next.js:**
   - `app/portal/pendencias-cancelamentos/page.tsx`: Autentica com `verifyPartnerAuth` e renderiza `PortalShell`.
   - `app/admin/pendencias-cancelamentos/page.tsx`: Autentica com `verifyAdminAuth` e renderiza `AdminShell`.
   - `app/api/pendencias-cancelamentos/route.ts`: Endpoint GET seguro para suporte a filtros assíncronos e paginação rápida.

3. **Integração aos Menus de Navegação:**
   - **`AdminShell.tsx`:** Inserido na seção "Operação":
     ```typescript
     {
       href: '/admin/pendencias-cancelamentos',
       label: 'Pendências e Cancelamentos',
       icon: ClockAlert, // ou AlertTriangle
       description: 'Inadimplência, prazos de tolerância e cancelados.',
     }
     ```
   - **`PortalShell.tsx`:** Inserido no array `nav`:
     ```typescript
     {
       href: '/portal/pendencias-cancelamentos',
       label: 'Pendências e Cancelamentos',
       icon: ClockAlert,
     }
     ```

---

## 6. O que Fica a Cargo do Implementador (Left to the Builder)

- Ajuste fino dos ícones Lucide (`ClockAlert`, `AlertTriangle`, `FileX`, etc.) para máxima harmonia visual com o restante dos shells.
- Otimização do debounce na busca textual do formulário de filtros (300ms a 500ms).
- Formatação de mensagens de estados vazios (empty state) personalizadas para cada aba ("Nenhuma contratação em atraso encontrada", "Nenhum registro cancelado encontrado").

---

## 7. Estratégia de Testes Obrigatórios (15 Cenários)

Suíte de testes automatizados com **Vitest** em `tests/unit/pendencias-cancelamentos-service.test.ts` e `tests/unit/pendencias-cancelamentos-rbac.test.ts`:

1. **Vendedor (`partner_broker`):** Testa se a consulta injeta `c.partner_user_id = user.userId` e impede visualização de outros corretores.
2. **Gestor (`partner_manager`):** Testa se o gestor visualiza apenas os `visibleUserIds` da sua árvore hierárquica.
3. **Gestor vs Equipes Alheias:** Testa se o gestor tem acesso bloqueado a parceiros e vendedores fora de sua subordinação.
4. **Corretora:** Testa se o perfil de corretora visualiza estritamente sua `corretora_id`.
5. **Administrador e Desenvolvedor:** Testa se `duolife_admin` e `duolife_dev` possuem escopo irrestrito nacional.
6. **Tentativa de Acesso Não Autorizado:** Testa injeção de parâmetros maliciosos nos filtros (ex: corretor tentando passar `partner_id` de terceiro).
7. **Parcela Vencida Ainda Não Paga:** Testa se entra na Aba 1 como `em_atraso`.
8. **Parcela Paga Após Vencimento:** Testa se parcela liquidada com atraso não é computada como em atraso atual.
9. **Primeira Parcela Vencida (Regra BR-031):** Testa a tolerância de 2 dias úteis.
10. **Demais Parcelas Vencidas (Regra BR-031):** Testa a tolerância de 30 dias corridos prorrogados.
11. **Cancelamentos por Diversos Motivos:** Testa a categorização correta na Aba 2 (inadimplência, recusa de assinatura, desistência, administrativo).
12. **Cancelamento com Parcelas Pendentes no Gateway:** Testa se o registro cancelado vai para a Aba 2 mesmo que no gateway ainda constem parcelas em aberto.
13. **Múltiplas Parcelas Vencidas:** Testa se um contrato com 3 parcelas vencidas surge exatamente 1 vez na listagem principal com a contagem `qtdParcelasVencidas = 3`.
14. **Deduplicação Cotação vs Venda:** Testa se uma cotação convertida em venda é listada apenas 1 vez (como venda vinculada à cotação).
15. **Consistência de Totais e KPIs:** Testa se os indicadores agregados somam com exatidão os valores do escopo autorizado.
