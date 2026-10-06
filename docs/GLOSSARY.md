# Glossário de Negócio e Termos Técnicos — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Dicionário de termos atuariais, de seguros, entidades de negócio e conceitos técnicos do ecossistema.

---

## 1. Termos de Seguros & Atuariais

- **Apólice:** Documento oficial emitido pela seguradora formalizando a vigência do contrato de seguro e garantindo a cobertura ao segurado. No sistema, é representada pela tabela `sales`.
- **Cotação / Proposta:** Estudo preliminar de condições e preços emitido pelo corretor antes da assinatura do contrato. No sistema, é representada pela tabela `cotacoes`.
- **Franquia:** Valor ou percentual contratual pelo qual o segurado participa em caso de sinistro indenizável.
- **Importância Segurada / LMI (Limite Máximo de Indenização):** O valor teto de indenização financeira coberto pela apólice (ex: R$ 100.000,00, R$ 300.000,00, R$ 500.000,00, R$ 1.000.000,00). No banco: `importancia_segurada`.
- **IOF (Imposto sobre Operações Financeiras):** Encargo tributário federal obrigatório sobre operações de seguro. No sistema, é fixado na alíquota legal de **7,38%** (`IOF_RATE = 0.0738`), sendo segregado do prêmio para apuração de comissões.
- **Minuta Contratual:** Rascunho estruturado em PDF do contrato de seguro submetido à assinatura digital dos signatários na ZapSign.
- **PPE (Pessoas Politicamente Expostas):** Qualificação regulatória de compliance (Circular SUSEP nº 612/2020) que mapeia segurados que exercem ou exerceram cargos públicos relevantes no Brasil ou exterior nos últimos 5 anos.
- **Prêmio Bruto / Prêmio Final:** Valor total em Reais cobrado do segurado, englobando a garantia atuarial, despesas de comercialização e o IOF. No banco: `premio_final`.
- **Prêmio Líquido:** Valor do seguro expurgado da incidência de IOF, utilizado como base de cálculo das comissões da corretora e do corretor:
  $$\text{Prêmio Líquido} = \frac{\text{Prêmio Final}}{1{,}0738}$$
- **RC Profissional (Responsabilidade Civil Profissional):** Ramo de seguro que protege profissionais liberais (advogados, médicos, etc.) contra reclamações judiciais ou extrajudiciais de terceiros por danos materiais, corporais ou morais involuntários resultantes de falhas, omissões ou erros no exercício da profissão.
- **Retroatividade:** Cláusula que cobre atos profissionais praticados antes do início da vigência da apólice atual, desde que desconhecidos do segurado na contratação.
- **Sinistro:** Ocorrência de evento danoso involuntário previsto na apólice que aciona o dever de indenização por parte da seguradora.
- **Underwriting (Subscrição de Risco):** Processo técnico de avaliação do perfil do proponente (histórico de reclamações, faturamento, titularidade) para determinar a aceitação e tarifação do risco.

---

## 2. Termos de Negócio & Ecossistema DuoLife

- **Corretora Master:** Empresa corretora parceira central credenciada na DuoLife (ex: *NET4Life Corretora de Seguros Ltda*). Possui SUSEP própria, logo customizado nos contratos e rede subordinada de parceiros. Representada por `corretoras`.
- **KEV Seguros:** Provedora atuarial / seguradora de risco responsável pela aceitação das apólices do produto RC Advogados (`RC-ADV-001`).
- **Links Públicos de Venda (`dlk_*`):** URLs exclusivas geradas pelos corretores (`https://duolife.com.br/contratar/[token]`) que aplicam branding da corretora mãe e comissionam automaticamente o corretor responsável.
- **Parceiro Comercial:** Escritório, empresa parceira ou corretor pessoa física credenciado a distribuir seguros através do DuoLife Hub. Representado por `partners`.
- **SUSEP (Superintendência de Seguros Privados):** Autarquia federal responsável pela regulação, autorização e fiscalização do mercado de seguros no Brasil.
- **Tomadora / Proponente:** Pessoa física ou jurídica que contrata o seguro em favor de si ou de sua equipe profissional.
- **White-Label:** Capacidade do sistema de adaptar títulos, slogans, cores corporativas e logotipos nos links de contratação e contratos PDF conforme a Corretora Master associada.
- **Workgroup / Duo24horas:** Ecossistema parceiro de tecnologia e saúde complementar integrado a serviços auxiliares.

---

## 3. Conceitos Técnicos da Plataforma

- **Anacronismo Financeiro:** Anomalia mitigada pelo sistema onde faturas antigas liquidadas no Asaas (de anos anteriores) eram indevidamente amarradas a novas cotações por coincidência de CPF. Mitigado por `isChargeAnachronic`.
- **Anti-Replay de Webhooks:** Mecanismo de defesa que grava o identificador de cada evento externo em `webhook_events`, descartando retransmissões idênticas e garantindo processamento atômico único.
- **Âncoras de Assinatura Invisíveis:** Tags de texto (`{{assinatura_corretora}}` e `{{assinatura_proponente}}`) renderizadas no PDF em tom quase imperceptível (`#FAFAFA` / 7pt) para guiar a posição das assinaturas no ZapSign sem gerar poluição visual na impressão.
- **Dupla Assinatura Eletrônica Sequencial:** Fluxo de assinatura em 2 etapas onde a Corretora Master assina primeiro (`order: 1`) e, somente após a rubrica da corretora, o ZapSign libera a assinatura para o Segurado (`order: 2`).
- **ensureSaleForPaidQuote:** Função transacional central em `src/lib/insurance-ops.ts` que executa a transição atômica da proposta para apólice oficial, aplicando lock pessimista de linha (`FOR UPDATE`).
- **Lock Pessimista (`SELECT ... FOR UPDATE`):** Bloqueio exclusivo em nível de banco de dados que impede que múltiplos webhooks de pagamento simultâneos emitam mais de uma apólice para a mesma cotação.
- **Salto de Esteira (Smart Step Resuming):** Inteligência do formulário `DynamicCotacaoForm.tsx` que inspeciona o preenchimento de propostas salvas e posiciona o usuário diretamente na etapa correta (ex: pulando direto para a assinatura se o contrato já foi gerado).
- **TableScrollContainer:** Componente de interface que isola a rolagem horizontal de tabelas administrativas e de cotação em smartphones, com aceleração por hardware a 120fps e cabeçalhos fixos.
