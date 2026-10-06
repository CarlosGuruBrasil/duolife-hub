# Padrões de Código & Design System — DuoLife Hub

> **Status da Análise:** Fato Confirmado pelo Código-Fonte  
> **Classificação de Certeza:** Padrões predominantes identificados no código existente.

---

## 1. Convenções de Nomenclatura e Arquitetura

| Elemento | Convenção Adotada | Exemplo no Código |
|---|---|---|
| **Arquivos de Componentes** | `PascalCase.tsx` | `DynamicCotacaoForm.tsx`, `AdminShell.tsx` |
| **Arquivos de Serviços / Libs**| `kebab-case.ts` | `pricing.ts`, `insurance-ops.ts`, `pdf-contract-generator.ts` |
| **Páginas e Rotas Next.js** | `page.tsx`, `route.ts`, `layout.tsx` | `app/admin/cotacoes/page.tsx`, `app/api/auth/login/route.ts` |
| **Variáveis e Funções** | `camelCase` | `calcularPrecoServidor`, `ensureSaleForPaidQuote` |
| **Interfaces e Tipos** | `PascalCase` | `PrecoCalculado`, `AuthUser`, `ContratoPdfResult` |
| **Tabelas do Banco de Dados** | `snake_case` (plural ou descritivo) | `insurance_clients`, `payment_installments`, `corretoras` |
| **Colunas do Banco de Dados** | `snake_case` | `document_number`, `policy_number`, `created_at` |
| **Variáveis de Ambiente** | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `JWT_SECRET`, `ASAAS_API_KEY` |

---

## 2. Padrões de Frontend e React

### 2.1 Server Components vs Client Components
- **Páginas (`page.tsx`):** Devem ser **Server Components assíncronos por padrão** (`export default async function Page()`). Elas executam a autenticação inicial no servidor via `verifyPartnerAuth` ou `verifyAdminAuth` e realizam consultas analíticas de banco sem expor rotas REST desnecessárias.
- **Componentes Interativos (`'use client'`):** A diretiva `'use client'` deve ser declarada exclusivamente no topo de componentes que utilizam hooks de estado (`useState`, `useEffect`), animações (`framer-motion`) ou eventos de clique/digitação.

### 2.2 Dicionário Obrigatório de Classes Tailwind (Design System Light Mode)
Para manter total consistência com o Design System corporativo:
- **Fundo Principal de Páginas:** `bg-[var(--surface)]` ou `#f7faf9`.
- **Fundo de Cards e Contêineres:** `bg-white` ou `bg-gray-50`. **NUNCA utilize** `bg-slate-900`, `bg-slate-950` ou `zinc-900`.
- **Bordas:** `border-gray-200` ou `border-gray-300`.
- **Textos Principais:** `text-gray-900` ou `text-slate-900`.
- **Textos Secundários / Apoio:** `text-gray-500`, `text-gray-600` ou `text-gray-700`.
- **Cores de Marca:**
  - Primária (Petróleo): `text-primary` (`#0e4a5a`) ou classes utilitárias baseadas em `[#0e4a5a]`.
  - Acento (Ciano): `text-accent` (`#00d4e0`).
  - Sucesso (Esmeralda): `text-emerald-600` / `bg-emerald-50` / `border-emerald-200`.
- **Cartões Clicáveis:** Aplicar sempre `border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md`.
- **Tabelas com Muitas Colunas:** Devem ser sempre envolvidas pelo componente `<TableScrollContainer minWidth="900px">` para garantir rolagem fluida em smartphones.

---

## 3. Padrões de Backend e APIs

### 3.1 Manipuladores de Rota (Route Handlers)
- Toda rota de API deve exportar funções HTTP assíncronas nomeadas:
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';

  export async function GET(req: NextRequest) { ... }
  export async function POST(req: NextRequest) { ... }
  ```
- **Validação de Entrada:** Toda mutação (`POST`, `PATCH`, `PUT`) deve ter seu payload validado utilizando esquemas **Zod** com sanitização explícita (`.trim()`, `.toLowerCase()`, `.nullable()`):
  ```typescript
  const schema = z.object({
    email: z.string().email().trim().toLowerCase(),
    valor: z.number().positive(),
  });
  ```

### 3.2 Consultas ao Banco de Dados (PostgreSQL)
- **Tagged Templates Exclusivos:** Nunca utilize concatenação de strings ou `sql.unsafe` com dados originados de usuários. Utilize sempre a interpolação segura do driver:
  ```typescript
  const rows = await sql`
    SELECT id, full_name, email
    FROM insurance_clients
    WHERE document_number = ${documentNumber}
    LIMIT 1
  `;
  ```
- **Transações Atômicas:** Sempre que duas ou mais tabelas forem alteradas de forma dependente, envolva as operações em `sql.begin`:
  ```typescript
  await sql.begin(async (tx) => {
    await tx`UPDATE cotacoes SET status = 'aprovada' WHERE id = ${id}`;
    await tx`INSERT INTO sales (...) VALUES (...)`;
  });
  ```

### 3.3 Respostas de Erro Estruturadas
As rotas de API devem padronizar o retorno de falhas:
```json
{
  "error": "Descrição clara do erro em português",
  "details": [ /* Lista opcional de campos violados */ ]
}
```
Acompanhado do registro de telemetria correspondente via `logger.warn` ou `logger.error` da biblioteca Pino.
