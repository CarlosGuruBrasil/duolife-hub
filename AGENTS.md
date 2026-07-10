# Contexto do Projeto — DuoLife Hub

**OBRIGATÓRIO:** Leia os arquivos abaixo antes de qualquer ação.

- Memória global: `~/Desktop/ORACULO/MEMORY.md`
- Contexto do projeto: `~/Desktop/ORACULO/Projetos/DuoLife Hub.md`
- Protocolo completo: `~/Desktop/ORACULO/CONTEXT.md`

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## Regras de Operação e Ambiente de Desenvolvimento (Evitar Erros de Execução)

Para evitar erros comuns de execução de comandos e processos zumbis, qualquer IA operando neste projeto deve seguir estritamente as regras abaixo:

1. **Diretório Correto de Execução:**
   - O projeto Next.js fica em `/Volumes/GURU HD/Desktop/DUOLIFE/duolife-hub/`.
   - **SEMPRE** navegue para esta pasta antes de executar qualquer comando `npm` ou `npx`. Nunca execute comandos da raiz do sistema ou do usuário (`~`).

2. **Evitar Conflitos de Porta (Processos Zumbis):**
   - Nunca tente iniciar o servidor de desenvolvimento diretamente com `npx next dev` sem antes verificar as portas.
   - O comando de desenvolvimento `npm run dev` foi configurado para executar o script de limpeza `bash scripts/dev-clean.sh`. Esse script automaticamente detecta e mata qualquer processo zumbi rodando na porta `3000` antes de iniciar o servidor Next.js.
   - **SEMPRE** dê preferência para rodar `npm run dev` para usufruir da limpeza automática da porta.

3. **Resolução de Erros de Compilação do Turbopack (CSS parser crash):**
   - Se o Turbopack travar na compilação do CSS (ex: "Execution of parse_css failed" no `globals.css`), limpe o cache do Next.js executando:
     ```bash
     rm -rf .next node_modules/.cache
     ```
     Depois reinicie o servidor.

---

## Padrão de Qualidade de Entrega (site completo: desktop + mobile + SEO + conteúdo real)

Esta seção complementa as regras acima — define o "definition of done" de qualquer página ou seção entregue neste projeto. Nenhuma tarefa é considerada concluída se violar o que segue.

### Responsividade — obrigatório, não opcional

Todo componente de página tem que ser verificado em pelo menos três larguras antes de ser considerado pronto: Mobile (375px), Tablet (768px), Desktop (1440px).

- Mobile-first: escreva o CSS base para mobile, use `md:`/`lg:` do Tailwind para expandir, nunca o contrário.
- Nenhum texto pode ficar cortado, sobreposto ou exigir scroll horizontal em nenhuma das três larguras.
- Botões e links têm área de toque mínima de 44x44px em mobile.
- Menu de navegação vira menu hambúrguer/drawer abaixo de 768px — nunca esconda itens de navegação sem substituto acessível.
- Antes de declarar uma página pronta, tire screenshot nas três larguras (via preview do navegador do Antigravity) e revise visualmente.

### SEO — checklist obrigatório por página

- `title` único por página (50-60 caracteres), `meta description` única (140-160 caracteres) — nunca copiar o mesmo texto entre páginas.
- Open Graph completo (`og:title`, `og:description`, `og:image` 1200x630, `og:type`, `og:url`) e Twitter Card.
- JSON-LD (schema.org) adequado ao tipo de página: `Organization` na home, `Service` em páginas de solução/produto, `BreadcrumbList` em páginas internas, `FAQPage` onde houver FAQ, `LocalBusiness` para Joinville/Florianópolis.
- `sitemap.xml` e `robots.txt` gerados e atualizados a cada nova rota.
- Um único `<h1>` por página, `<h2>`/`<h3>` em ordem lógica.
- URLs em português, minúsculas, com hífen (`/seguro-rc-profissional`).
- Core Web Vitals: LCP < 2.5s, CLS < 0.1.

### Conteúdo — proibido placeholder

- Nunca entregar lorem ipsum ou copy genérico como resultado final. Se o conteúdo real não foi definido, **parar e pedir o briefing de conteúdo** em vez de inventar texto vago.
- Todo texto institucional/comercial precisa de fundamento: número, prova social ou diferencial concreto — não adjetivo vazio ("líder", "excelência") sem dado que sustente.
- Depoimentos, cases e números usados como prova social devem ser reais ou marcados explicitamente como placeholder pendente de aprovação — nunca inventados e publicados como se fossem reais.

### Acessibilidade

- Contraste mínimo AA (4.5:1 texto normal, 3:1 texto grande).
- Navegação, CTAs e formulários operáveis via teclado.
- Todo campo de formulário com `label` associado.

### Antes de marcar como concluído

1. `npm run dev` sem erros (usando o script de limpeza já configurado).
2. `npm run build` sem erros/warnings de TypeScript.
3. Conferir os três breakpoints visualmente (screenshot).
4. Conferir que nenhum texto é placeholder.
5. Conferir sitemap/robots/meta tags da(s) página(s) alterada(s).

### Padrão de Estilo Visual e Cores (Design System Premium)

- **Tema Claro por Padrão (Light Mode):** Todo o painel administrativo e formulários devem obrigatoriamente seguir o fundo claro do `globals.css` (`var(--surface)` / `#f7faf9`).
- **Dicionário de Classes Tailwind Obrigatório:**
  - **Fundo Principal/Container:** `bg-white` ou `bg-gray-50`. **NUNCA** use `bg-slate-900`, `bg-slate-950` ou `zinc-900` em cards.
  - **Bordas:** `border-gray-200` ou `border-gray-300`. **NUNCA** use `border-slate-800` ou `slate-700`.
  - **Textos Principais:** `text-gray-900` ou `text-slate-900`. **NUNCA** use `text-white` ou `text-gray-300` sobre fundos brancos.
  - **Textos Secundários/Apoio:** `text-gray-500`, `text-gray-600` ou `text-gray-700`.
  - **Destaques:** Títulos e ícones de destaque devem usar `text-primary` (`#0e4a5a`) ou `text-emerald-600`. Evitar `text-accent` puro se houver falta de contraste no fundo claro.
- **Validação de Contraste:** Caixas de alerta e informativos (ex: "Declarações Simplificadas") devem usar a fórmula: `bg-[cor]-50` + `border-[cor]-200` + `text-[cor]-800`. Nunca use `bg-[cor]-950/20` com `text-[cor]-200` sobre o fundo branco.
- **Cartões Interativos:** Aplique `border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md`.

