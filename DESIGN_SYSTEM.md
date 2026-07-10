# Design System: DuoLife Hub

Este documento define a base arquitetural e as regras estritas de UI/UX que governam o desenvolvimento visual do ecossistema DuoLife. Todos os desenvolvedores e assistentes de Inteligência Artificial **devem** seguir as regras aqui descritas.

---

## 1. Lógica Fundamental: A Logo dita a Paleta
No design de interfaces moderno, a Paleta de Cores de um sistema não deve ser guiada por preferências genéricas, mas sim ser uma **extensão direta da Identidade Visual (Logo) da empresa**. 

O objetivo do nosso ecossistema é construir uma interface altamente premium e institucional que reforce a marca DuoLife a cada clique.

### Por que evitamos fundos escuros genéricos?
As cores da nossa marca (Azul Petróleo e Ciano) são intensas e vibrantes. Se utilizarmos "Dark Modes" genéricos do Tailwind (como `bg-slate-900` ou `bg-zinc-950`), nós **matamos o contraste** da nossa identidade visual, gerando um excesso de informação escura que prejudica a legibilidade e desvia a atenção. 

Ao adotarmos **fundos claros e limpos** como padrão (Light Mode), as cores da nossa marca "respiram" e ganham total destaque, definindo perfeitamente a hierarquia visual.

---

## 2. A Paleta de Cores Oficial DuoLife

As cores primárias são extraídas diretamente da marca e estão mapeadas no `globals.css`.

### Cores da Marca (Brand Colors)
- **Primary (Azul Petróleo):** `#0e4a5a`
  - *Uso:* Botões principais de ação (Call to Action), títulos importantes, cabeçalhos de tabela, sidebar.
  - *Tailwind:* `bg-primary`, `text-primary`, `border-primary`
- **Accent (Ciano Vibrante):** `#00d4e0`
  - *Uso:* Destaques secundários, badges, ícones ativos, foco em inputs (`focus:ring`), e indicativos de sucesso.
  - *Tailwind:* `bg-accent`, `text-accent`, `border-accent`

### Cores Estruturais (Fundo e Neutros)
- **Surface (Fundo do Sistema):** `#f7faf9` (Gelo)
  - *Uso:* O "canvas" de todo o painel administrativo. 
  - *Tailwind:* `bg-gray-50` ou classes customizadas como `bg-surface`.
- **Card (Fundo de Cartões e Módulos):** `#ffffff` (Branco)
  - *Uso:* O fundo de todo e qualquer container, card ou formulário flutuante no painel.
  - *Tailwind:* `bg-white`

### Cores de Tipografia (Textos)
- **Texto Principal:** `#0b2b34`
  - *Uso:* Textos de corpo, labels e inputs.
  - *Tailwind:* `text-gray-900` ou `text-slate-900`
- **Texto Secundário / Apoio:** `#4d686f` ou `#5a6c71`
  - *Uso:* Descrições, dicas de ferramentas e placeholders.
  - *Tailwind:* `text-gray-500` ou `text-gray-600`

---

## 3. Dicionário Obrigatório de Classes (Tailwind CSS)

Durante a criação ou edição de componentes React (ex: painel administrativo, cotação, etc.), siga estritamente estas substituições:

| Elemento | ❌ O que NÃO usar (Proibido) | ✅ O que DEVE usar (Correto) |
| :--- | :--- | :--- |
| **Containers/Cards** | `bg-slate-900`, `bg-zinc-950`, `bg-slate-800` | `bg-white`, `bg-gray-50` |
| **Bordas** | `border-slate-800`, `border-zinc-700` | `border-gray-200`, `border-gray-300` |
| **Textos Principais** | `text-white`, `text-gray-300`, `text-gray-200` | `text-gray-900`, `text-gray-800` |
| **Textos Secundários** | `text-gray-400`, `text-gray-500` (em dark mode) | `text-gray-600`, `text-gray-500` |
| **Hover de Cartões** | `hover:bg-slate-800` | `hover:border-primary/40`, `hover:shadow-md hover:-translate-y-1 transition-all` |

---

## 4. Validação de Contraste e Caixas de Alerta (Alerts)

Sempre que precisar criar caixas de "Aviso", "Sucesso" ou "Informativos" que possuem cor de fundo, você DEVE aplicar a lógica matemática de contraste:
**`bg-[cor]-50` + `border-[cor]-200` + `text-[cor]-800`**

- **Exemplo de Sucesso (Verde):**
  - ✅ **Correto:** `bg-emerald-50 border border-emerald-200 text-emerald-800`
  - ❌ **Incorreto:** `bg-emerald-950/20 text-emerald-200` (Invisível no modo claro).
  
- **Exemplo de Cuidado/Alerta (Amarelo/Laranja):**
  - ✅ **Correto:** `bg-amber-50 border border-amber-200 text-amber-800`
  
- **Exemplo de Erro (Vermelho):**
  - ✅ **Correto:** `bg-red-50 border border-red-200 text-red-800`

---

## 5. Diretriz de Agentes (I.A.)

Esta documentação foi refletida no arquivo de instruções e regras dos assistentes de IA (`AGENTS.md`). Ao construir qualquer tela para a DuoLife, a Inteligência Artificial fará a leitura deste `DESIGN_SYSTEM.md` e bloqueará a inclusão acidental de "dark modes" que não estejam alinhados com o projeto.
