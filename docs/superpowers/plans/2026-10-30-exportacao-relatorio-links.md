# Plano de Implementação — Exportação e Relatório de Links de Venda (CSV/Excel)

## 1. Visão Geral
Disponibilizar aos corretores e parceiros no Portal do Parceiro o download de relatórios detalhados dos seus links de venda públicos e exclusivos (White-Label), incluindo configurações comerciais (descontos, modalidade, titular alvo) e todas as métricas agregadas de conversão do funil (cliques totais, únicos, propostas geradas, vendas pagas e taxas de conversão percentuais).

---

## 2. Arquitetura e Componentes

### Tarefa 1: Gerador de CSV de Links de Venda (`src/lib/links-csv.ts`)
- Função pura `gerarLinksCsv(links: SaleLinkExportRow[]): string`
- Codificação UTF-8 com BOM (`\uFEFF`) para compatibilidade perfeita com Microsoft Excel em português.
- Separador ponto e vírgula (`;`).
- Colunas:
  1. `Rótulo / Campanha`
  2. `Token`
  3. `Modalidade` ("Geral (Público)" vs "Exclusivo (Cliente)")
  4. `Produto`
  5. `Desconto Comercial (%)`
  6. `CPF/CNPJ Alvo`
  7. `Nome do Titular Alvo`
  8. `Status` ("Ativo", "Inativo", "Utilizado / Esgotado", "Expirado")
  9. `Limite de Usos` ("Ilimitado" ou número)
  10. `Usos Realizados`
  11. `Total de Acessos (Views)`
  12. `Visitantes Únicos`
  13. `Propostas Iniciadas`
  14. `Vendas Concluídas`
  15. `Taxa Conv. Propostas (%)`
  16. `Taxa Conv. Vendas (%)`
  17. `Taxa de Fechamento (%)`
  18. `Criado em`
  19. `Último Acesso`
  20. `Expira em`
  21. `URL de Contratação`

### Tarefa 2: Endpoint de Exportação do Portal (`app/api/portal/links/exportar/route.ts`)
- Método: `GET`
- Autenticação e autorização via `verifyPartnerAuth()` e `getPartnerAccessContext()`.
- Consulta SQL agregada sobre `public_sale_links`, `products` e contagem de `cotacoes`.
- Suporte a filtros opcionais na query string: `status`, `isExclusive`, `productId`.
- Retorno HTTP 200 com headers de download:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="relatorio_links_vendas_YYYY-MM-DD.csv"`

### Tarefa 3: Interface no Portal do Parceiro (`src/components/portal/PartnerProfileForm.tsx`)
- Botão "Exportar Relatório (CSV)" com ícone `Download` ao lado do botão "Gerar Novo Link Exclusivo".
- Estado de loading durante o download (`isExporting`).
- Feedback visual com toast (`toast.loading`, `toast.success`, `toast.error`).
- Estilização estrita no padrão Light Mode: `bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-semibold text-xs py-2 px-3 rounded-lg`.

### Tarefa 4: Testes Unitários e Validação
- `tests/unit/links-export-csv.test.ts`: Testar a formatação de CSV, escape de aspas, conversão de taxas percentuais, cálculos do funil e suporte a caracteres especiais.
- Validação completa com `vitest`, `tsc` e `npm run build`.
- Atualização da memória `MEMORY.md`.
