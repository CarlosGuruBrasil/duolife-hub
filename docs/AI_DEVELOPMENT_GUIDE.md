# Diretrizes de Desenvolvimento para IA — DuoLife Hub

> **Status da Análise:** Diretriz Normativa Obrigatória  
> **Público-Alvo:** Agentes Autônomos de IA (Antigravity, Claude, Copilot) e Engenheiros de Software.

---

## 1. Princípio Fundamental de Engenharia

> **REGRA DE OURO:**  
> **Código existente é evidência do comportamento atual, mas não necessariamente prova de que o comportamento está correto.** Regras documentadas, restrições atuariais e requisitos explícitos devem ser usados na análise de consistência antes de qualquer refatoração.

---

## 2. Protocolo de Atuação da IA

Todo agente de IA operando neste repositório deve seguir rigorosamente as 3 fases de desenvolvimento:

### 2.1 Fase 1: Antes de Escrever Código (Preparação & Investigação)
1. **Consulte a Documentação Central:** Leia obrigatoriamente [README.md](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/README.md) e o documento específico do módulo afetado em `/docs` (ex: `BUSINESS_RULES.md`, `DATABASE.md`, `INTEGRATIONS.md`).
2. **Localize a Implementação Real:** Nunca deduza como uma funcionalidade funciona apenas pelo nome do arquivo ou da rota. Rastreie o fluxo real de execução ponta a ponta:
   $$\text{Interface} \longrightarrow \text{Handler API} \longrightarrow \text{Middleware} \longrightarrow \text{Serviço} \longrightarrow \text{Banco / Gateway}$$
3. **Avalie o Impacto Cruzado:** Consulte o [CHANGE_IMPACT_GUIDE.md](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/CHANGE_IMPACT_GUIDE.md) para identificar tabelas, webhooks ou relatórios dependentes.
4. **Formule um Plano de Trabalho:** Defina o plano em etapas atômicas e com baixo risco de regressão.

### 2.2 Fase 2: Durante a Implementação (Regras de Conduta)
- **Não Invente Requisitos:** Se um comportamento ou regra não estiver claro no código ou nos requisitos, pergunte antes de implementar. Nunca assuma "boas práticas genéricas" que conflitem com regras atuariais do sistema.
- **Não Altere Funcionalidades Não Relacionadas:** Mantenha o escopo estritamente restrito à demanda solicitada. Não reformate arquivos inteiros ou altere padrões consolidados em arquivos adjacentes.
- **Não Duplique Regras de Negócio:** Se um cálculo de prêmio já existe em `src/lib/pricing.ts`, reutilize a função existente em vez de reescrever a lógica no route handler ou no frontend.
- **Nunca Deixe Regras Críticas Apenas no Frontend:** Toda validação de formulário (teto de desconto de 40%, parcelamento de 100k, cálculos de IOF) **deve obrigatoriamente existir no backend** com validação Zod e rejeição HTTP 400.
- **Preserve Contratos de API:** Se alterar o retorno de um endpoint consumido por telas ativas ou webhooks, certifique-se de manter compatibilidade retroativa com campos legados.
- **Respeite o Design System Light Mode:** Nunca adicione fundos escuros (`slate-900`, `zinc-900`) a cards ou painéis. Todo o painel administrativo e formulários devem seguir o fundo claro do `globals.css` (`#f7faf9` e `bg-white`).
- **Respeite a Codificação UTF-8:** Todos os arquivos de texto e código gerados devem ser estritamente codificados em **UTF-8**.
- **Respostas em Português Brasileiro:** Toda comunicação com o usuário deve ser conduzida em **português do Brasil**.

### 2.3 Fase 3: Depois da Implementação (Verificação & QA)
1. **Verificação Estrita de Tipos:**
   ```bash
   npx tsc --noEmit
   ```
   *Nenhum erro de TypeScript é tolerado na conclusão da tarefa.*
2. **Execução de Testes Automatizados:**
   Execute os scripts CLI relacionados à área alterada em `scripts/` (ex: `npx tsx scripts/test-cotacao-schema-resilience.ts`, `scripts/test-dashboard-partner-period.ts`).
3. **Build de Produção:**
   ```bash
   npm run build
   ```
   *Verifique se todas as 84 rotas compilam com 100% de sucesso no Next.js (Turbopack).*
4. **Atualização da Documentação:**
   Atualize os documentos em `/docs` e registre a síntese do que foi modificado em [CHANGELOG.md](file:///c:/Apps%20e%20Systems/Sistemas/DUOLife/docs/CHANGELOG.md) e na memória global do desenvolvedor (`~/Desktop/ORACULO/MEMORY.md`).
5. **Comunicação Transparente:**
   Apresente ao usuário o resumo das alterações, liste os arquivos modificados e aponte eventuais riscos operacionais remanescentes.

---

## 3. Travas Inegociáveis do Sistema

- **Prevenção de Anacronismo:** Nunca altere as verificações temporais de faturas do Asaas (`isChargeAnachronic`) sem aprovação explícita.
- **Lock Pessimista:** Toda concretização de apólice em `insurance-ops.ts` deve manter a transação atômica com `SELECT ... FOR UPDATE`.
- **Desconto Comercial:** A trava de **40% de desconto manual máximo** é uma restrição inegociável da diretoria.
- **Âncoras de Assinatura ZapSign:** Nunca altere a cor (`#FAFAFA`) ou o texto das âncoras (`{{assinatura_corretora}}` e `{{assinatura_proponente}}`) sem validar a diagramação nos 3 templates em `src/lib/pdf-contract-generator.ts`.
