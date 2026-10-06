# Histórico de Alterações da Documentação (CHANGELOG) — DuoLife Hub

Todas as alterações estruturais, arquiteturais e de documentação realizadas neste repositório devem ser registradas neste arquivo.

---

# Estado Inicial da Documentação

- **Data da Análise:** 06 de Outubro de 2026
- **Branch Atual:** `main`
- **Commit Base:** `e00aeb7` (`fix(cotacoes): blindagem de validacao zod, pre-flight e diagnostico de erro 400`)
- **Estado Geral do Sistema:**
  - Sistema 100% operacional em produção (`https://duolife.com.br` e `https://www.duolife.com.br`), servido via contêiner Node.js 22-Alpine com Next.js 16.3.4 (App Router) e PostgreSQL 16 dedicado no Coolify.
  - Zero erros de compilação em `npx tsc --noEmit`.
  - Sucesso absoluto no build de produção (`npm run build`), compilando todas as 84 rotas estáticas e dinâmicas com Turbopack.
  - Esteira ativa de seguros de Responsabilidade Civil (RC Advogados / KEV Seguros), geração dinâmica de minutas PDF via `pdf-lib` com dupla assinatura sequencial no ZapSign (Corretora e Segurado) e liquidação automatizada no Asaas (PIX, Boleto, Cartão e Carnê em até 6x).
- **Escopo desta Entrega Inicial:**
  - Criação da pasta de documentação central `/docs` contendo 26 documentos estruturados cobrindo engenharia reversa de banco de dados (35 tabelas), catálogo de 84 contratos de API, 30 regras de negócio (`BR-001` a `BR-030`), matriz de 10 papéis de usuário (RBAC), postura de segurança, integrações externas (Wix, ZapSign, Asaas, Net4Life) e diretrizes de desenvolvimento para agentes de IA.
  - Nenhuma alteração de código-fonte foi efetuada durante esta análise (leitura estrita).

---

## [1.0.0] — 2026-10-06

### Adicionado
- Criação do acervo documental completo em `/docs`:
  - `README.md`: Índice e guia mestre da documentação.
  - `PRODUCT.md`: Visão funcional, módulos, personas e limites do produto.
  - `ARCHITECTURE.md`: Diagramas C4 Context e Container, fluxos de dados e tecnologias.
  - `PROJECT_STRUCTURE.md`: Mapeamento de diretórios, componentes e bibliotecas.
  - `BUSINESS_RULES.md`: Catálogo das regras de negócio `BR-001` a `BR-030`.
  - `USER_ROLES_AND_PERMISSIONS.md`: Matriz de 10 perfis de acesso e RLS lógico.
  - `USER_FLOWS.md`: Mapeamento das 8 jornadas e diagramas de sequência.
  - `DATABASE.md`: Engenharia reversa das 35 tabelas e diagrama ER em Mermaid.
  - `API_CONTRACTS.md`: Catálogo dos 84 endpoints de API RESTful.
  - `INTEGRATIONS.md`: Mapeamento de Wix, ZapSign, Asaas, Net4Life e ViaCEP.
  - `AUTHENTICATION_AND_AUTHORIZATION.md`: Ciclo de vida JWT, refresh tokens e cookies.
  - `SECURITY.md`: Avaliação OWASP e matriz de vulnerabilidades (`SEC-01` a `SEC-07`).
  - `FRONTEND.md`: Arquitetura do App Router, formulário dinâmico e Design System.
  - `BACKEND.md`: Route handlers, concorrência, locks e serviços de domínio.
  - `TESTING.md`: Inventário dos scripts CLI de teste e lacunas identificadas.
  - `ERROR_HANDLING.md`: Estratégias de captura, fallbacks e reprocessamento.
  - `OBSERVABILITY.md`: Logs estruturados Pino e tabelas de auditoria.
  - `DEPLOYMENT.md`: Dockerfile multi-stage, Coolify e scripts de migração.
  - `ENVIRONMENT.md`: Relação de variáveis de ambiente sem exposição de segredos.
  - `CODING_STANDARDS.md`: Convenções de nomenclatura, SQL seguro e Tailwind.
  - `TECHNICAL_DEBT.md`: Catálogo de 10 dívidas técnicas (`TD-001` a `TD-010`).
  - `KNOWN_ISSUES.md`: Problemas e inconsistências conhecidas (`ISSUE-001` a `ISSUE-008`).
  - `CHANGE_IMPACT_GUIDE.md`: Mapas de impacto e matriz de dependências cruzadas.
  - `AI_DEVELOPMENT_GUIDE.md`: Diretrizes normativas para atuação de agentes de IA.
  - `GLOSSARY.md`: Glossário atuarial, de negócios e termos técnicos.
  - `CHANGELOG.md`: Registro inicial e controle de alterações da documentação.
