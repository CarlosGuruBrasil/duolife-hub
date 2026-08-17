# Design System: DuoLife Hub (Padrão Apple Human Interface Guidelines - HIG)

Este documento define a base arquitetural e as regras estritas de UI/UX que governam o desenvolvimento visual do ecossistema DuoLife, baseadas no **Apple Human Interface Guidelines (HIG)** e em padrões internacionais de design de grandes empresas de tecnologia (Apple, Stripe, Linear).

---

## 1. Regras Fundamentais de Arquitetura Visual (Apple HIG)

### 👤 Menu de Usuário & Perfil
- **Posição Obrigatória:** Canto superior direito da barra de navegação superior (**Top Navigation Bar**).
- **Estrutura:** Avatar circular com iniciais, nome do usuário, badge de perfil e menu suspenso (Dropdown) com:
  - Header: Foto/Iniciais + Nome + E-mail + Cargo
  - Opções: **Meu Perfil** (`/admin/perfil`), **Gerenciar Usuários** (`/admin/usuarios`) e **Sair da Operação**.
- **Proibido:** Colocar acessos de perfil no rodapé secundário da barra lateral.

### 📐 Raios de Borda e Cantos (Border Radius Standards)
- **Contêineres Principais e Cards (`.card`):** `16px` (`1rem` / `rounded-2xl`).
- **Controles de Formulário (`.form-input`, `<select>`, `<textarea>`):** `12px` (`0.75rem` / `rounded-xl`).
- **Botões (`.btn-primary`, `.btn-outline`):** `12px` (`0.75rem` / `rounded-xl`).
- **Badges e Status Pills (`.status-pill`):** `9999px` (`rounded-full`).

---

## 2. A Paleta de Cores Oficial DuoLife

- **Primary (Azul Petróleo):** `#0e4a5a` (Cabeçalhos, títulos principais, botões de ação).
- **Accent (Ciano Vibrante):** `#00d4e0` (Destaques, ícones ativos, indicadores de foco).
- **Surface (Fundo do Sistema):** `#f7faf9` (Gelo institucional limpo).
- **Card (Fundo de Cartões):** `#ffffff` (Branco).
- **Border:** `#e0eceb` (Linhas de separação suaves).

---

## 3. Dicionário Obrigatório de Classes

| Elemento | ❌ O que NÃO usar | ✅ O que DEVE usar (Apple HIG Standard) |
| :--- | :--- | :--- |
| **Cabeçalho da Página** | Divs genéricas com tamanhos aleatórios | `<h1 className="page-title">` + `<p className="muted">` |
| **Containers/Cards** | `bg-white p-6 rounded-lg` ou `rounded-3xl` | `<div className="card">` (cantos em `16px`) |
| **Inputs** | `border-gray-300 rounded-md p-2` | `<input className="form-input">` (cantos em `12px`) |
| **Botão Principal** | `bg-blue-600 rounded-md py-2` | `<button className="btn-primary">` (cantos em `12px`) |
| **Pills de Status** | `rounded-md bg-green-100` | `<span className="status-pill">` (cantos em `rounded-full`) |
