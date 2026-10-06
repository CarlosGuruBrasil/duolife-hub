# Arquitetura Frontend & UI/UX — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Implementação real em Next.js 16, React 19 e Tailwind CSS 4.

---

## 1. Tecnologias da Camada de Interface

- **Framework:** Next.js `16.3.4` (App Router com Turbopack).
- **Biblioteca de UI:** React `19.2.4` com Server Components e Client Components (`'use client'`).
- **Estilização:** Tailwind CSS v4 (`@tailwindcss/postcss ^4`).
- **Ícones:** Lucide React (`lucide-react ^1.21.0`).
- **Animações:** Framer Motion (`framer-motion ^12.40.0`).

---

## 2. Padrão de Estilo Visual (Design System Light Mode)

O DuoLife Hub adota obrigatoriamente uma identidade visual corporativa em **Light Mode Estrito**, definida em `globals.css`:

```css
:root {
  color-scheme: light;
  --surface: #f7faf9;
  --primary: #0e4a5a;
  --primary-hover: #0a3743;
  --accent: #00d4e0;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border-subtle: #e2e8f0;
}
```

### 2.1 Regras Rígidas de UI
- **Fundos de Tela e Cards:** Devem utilizar exclusivamente `bg-white` ou `bg-gray-50`. **É terminantemente proibido** utilizar classes escuras como `bg-slate-900`, `bg-slate-950` ou `zinc-900` em contêineres e cartões.
- **Bordas:** Padronizadas em `border-gray-200` ou `border-gray-300`.
- **Textos:** Títulos em `text-gray-900` ou `text-primary` (`#0e4a5a`); textos de apoio em `text-gray-600` ou `text-gray-500`.
- **Alertas e Destaques:** Devem seguir a fórmula de contraste claro: `bg-[cor]-50` + `border-[cor]-200` + `text-[cor]-800`.
- **Áreas de Toque:** Botões e elementos interativos possuem área de clique mínima de 44x44px.

---

## 3. O Formulário Dinâmico de Cotação (`DynamicCotacaoForm.tsx`)

O componente `DynamicCotacaoForm.tsx` gerencia a esteira de conversão em **6 etapas**:

```
[Etapa 1: Cobertura] ➔ [Etapa 2: Proponente] ➔ [Etapa 3: Perfil Profissional] ➔ [Etapa 4: Underwriting] ➔ [Etapa 5: Condições de Pagamento] ➔ [Etapa 6: Assinatura & Cobrança]
```

### 3.1 Detalhamento das Etapas
1. **Etapa 1 — Cobertura (`step === 1`):**
   - Carrega as faixas atuariais do produto (100k, 300k, 500k, 1mi).
   - Renderiza cards interativos com limites de indenização, franquias e valores anuais.
2. **Etapa 2 — Identificação do Proponente (`step === 2`):**
   - Coleta Nome, CPF/CNPJ, E-mail, Celular e Início de Atividade Profissional.
   - Preenchimento inteligente de endereço via integração instantânea com a API de CEP.
   - Componente `ClienteSearchSelector` para autocompletar clientes previamente cadastrados.
3. **Etapa 3 — Perfil Profissional & Atuação (`step === 3`):**
   - Registro de classe dinâmico por profissão (OAB para Advogados, CRM para Médicos, etc.).
   - Pergunta condicional de Associação a Escritório (Sim/Não com abertura de nome do escritório).
   - Titularidade profissional (Graduação, Especialização, Mestrado, Doutorado, Outro).
   - Grid de especialidades e faixas de faturamento anual.
4. **Etapa 4 — Declarações de Risco & PPE (`step === 4`):**
   - Questionário de sinistralidade, investigações e processos disciplinares anteriores.
   - Mapeamento de cargos públicos (Pessoa Politicamente Exposta — Circular SUSEP 612/20).
   - Regime de Renovação com campos de apólice anterior caso selecionado "Sim".
5. **Etapa 5 — Pagamento & Resumo (`step === 5`):**
   - Seleção de parcelamento (1x à vista ou até 6x para planos > 100k).
   - Seleção do método Asaas (Fatura por E-mail, Boleto/PIX, PIX Direto ou Cartão).
   - Gaveta lateral de descontos (`DescontoDrawer`) com trava de margem máxima de 40%.
   - Botão **"Ir para Assinatura"**: Salva a cotação no PostgreSQL e envia o documento para o ZapSign.
6. **Etapa 6 — Assinatura Digital & Cobrança (`step === 6`):**
   - Exibe o quadro interativo e o link de assinatura eletrônica do ZapSign.
   - Botão de verificação de status.
   - Após assinado, emite e exibe as faturas e o código PIX Copia e Cola.

---

## 4. Responsividade e Navegação Adaptativa

| Breakpoint | Largura | Comportamento da Interface |
|---|---|---|
| **Mobile** | 375px | Topbar compacta (64px). O menu lateral transforma-se em um Drawer overlay com trava de rolagem de fundo (`useBodyScrollLock`). Tabelas recebem scroll horizontal isolado no componente `TableScrollContainer`. Clientes chaveiam para o card mobile nativo (`ClientesCardMobile`). |
| **Tablet** | 768px | Header com logo e breadcrumbs parciais. Botões de ação expandem para ícone + texto. Drawer lateral opera em modal deslizante. |
| **Desktop** | 1440px | Sidebar lateral persistente (256px) com botão de colapso rápido para modo compacto de 80px. Tabelas e cards ocupam o viewport completo. |

### 4.1 Componente `TableScrollContainer`
Para evitar que tabelas com muitas colunas quebrem o layout ou façam a página inteira rolar horizontalmente, o sistema utiliza o contêiner `TableScrollContainer`:
- Scroll horizontal isolado a 120fps via aceleração por hardware (GPU).
- Cabeçalhos de coluna fixos no topo (`sticky top-0`).
- Primeira coluna congelada na horizontal (`table-sticky-col-head`) para manter a identificação do cliente sempre visível durante o scroll.

---

## 5. Lacunas de Interface e UX Identificadas

1. **Ausência de Rascunho Intermediário nas Etapas 1 a 4:**
   - A cotação só é enviada ao banco de dados na Etapa 5. Se o corretor preencher os dados do cliente e as especialidades na Etapa 3 e recarregar a página, todos os dados são perdidos.
2. **Cotações e Vendas sem Visualização Mobile Nativa:**
   - A carteira de *Clientes* possui o componente `ClientesCardMobile`, mas as listagens de *Cotações* e *Vendas* exibem tabelas largas com necessidade de rolagem lateral em telas pequenas.
3. **Módulo de Comissões Ocultado no Menu:**
   - Os links de navegação para `/portal/comissoes` e `/admin/comissoes` estão comentados no código dos shells de layout, impedindo o acesso direto pelo menu lateral.
