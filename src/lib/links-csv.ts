export interface SaleLinkExportRow {
  id: string;
  token: string;
  label?: string | null;
  flow_type?: string | null;
  status: string;
  discount_percent?: number | null;
  is_exclusive?: boolean | null;
  target_document?: string | null;
  target_name?: string | null;
  max_uses?: number | null;
  used_count?: number | null;
  views_count?: number | null;
  unique_views_count?: number | null;
  total_cotacoes?: number | null;
  total_vendas?: number | null;
  conversion_rate_cotacao?: number | null;
  conversion_rate_venda?: number | null;
  fechamento_rate?: number | null;
  created_at?: string | Date | null;
  last_accessed_at?: string | Date | null;
  expires_at?: string | Date | null;
  product_name?: string | null;
  product_code?: string | null;
  url?: string | null;
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).trim();
  return `"${str.replace(/"/g, '""')}"`;
}

function formatCpfCnpj(val?: string | null): string {
  if (!val) return '-';
  const digits = String(val).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits.length > 0 ? digits : '-';
}

function formatDate(val: unknown): string {
  if (!val) return '-';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatPercent(val: unknown): string {
  const num = Number(val) || 0;
  return `${num.toFixed(1).replace('.', ',')}%`;
}

function formatStatus(row: SaleLinkExportRow): string {
  const isExpired = row.expires_at ? new Date(row.expires_at) < new Date() : false;
  const isUsed = Boolean(
    row.status === 'used' ||
    (row.max_uses && Number(row.used_count || 0) >= Number(row.max_uses))
  );

  if (row.status === 'inactive') return 'Inativo';
  if (isUsed) return 'Esgotado / Utilizado';
  if (isExpired) return 'Expirado';
  if (row.status === 'active') return 'Ativo';
  return row.status || 'Ativo';
}

export const CABECALHO_LINKS_CSV = [
  'Rótulo / Campanha',
  'Token',
  'Modalidade',
  'Produto',
  'Desconto (%)',
  'Documento Alvo (CPF/CNPJ)',
  'Nome do Titular Alvo',
  'Status',
  'Limite de Usos',
  'Usos Realizados',
  'Total de Visualizações (Views)',
  'Visitantes Únicos',
  'Propostas Iniciadas',
  'Vendas Concluídas',
  'Taxa Conv. Propostas (%)',
  'Taxa Conv. Vendas (%)',
  'Taxa de Fechamento (%)',
  'Criado em',
  'Último Acesso',
  'Expira em',
  'Link Completo',
];

/**
 * Converte a lista de links de venda e suas métricas para formato CSV (padrão Brasil/Excel, UTF-8 BOM).
 */
export function gerarLinksCsv(links: SaleLinkExportRow[]): string {
  const headerLine = CABECALHO_LINKS_CSV.map(escapeCsv).join(';');

  const dataLines = links.map((link) => {
    const modalidade = link.is_exclusive ? 'Exclusivo (Cliente Específico)' : 'Geral (Público)';
    const produto = link.product_name
      ? (link.product_code ? `${link.product_name} (${link.product_code})` : link.product_name)
      : 'Todos os Produtos';
    const desconto = `${Number(link.discount_percent || 0).toFixed(0)}%`;
    const docAlvo = formatCpfCnpj(link.target_document);
    const nomeAlvo = link.target_name || '-';
    const status = formatStatus(link);
    const limiteUsos = link.max_uses ? String(link.max_uses) : 'Ilimitado';
    const usosRealizados = String(Number(link.used_count || 0));
    const views = String(Number(link.views_count || 0));
    const uniqueViews = String(Number(link.unique_views_count || 0));
    const totalCotacoes = String(Number(link.total_cotacoes || 0));
    const totalVendas = String(Number(link.total_vendas || 0));
    const txCotacao = formatPercent(link.conversion_rate_cotacao);
    const txVenda = formatPercent(link.conversion_rate_venda);
    const txFechamento = formatPercent(link.fechamento_rate);
    const criadoEm = formatDate(link.created_at);
    const ultimoAcesso = formatDate(link.last_accessed_at);
    const expiraEm = formatDate(link.expires_at);
    const linkCompleto = link.url || `https://duolife.com.br/contratar/${link.token}`;

    const fields = [
      link.label || 'Link de Autocadastro',
      link.token,
      modalidade,
      produto,
      desconto,
      docAlvo,
      nomeAlvo,
      status,
      limiteUsos,
      usosRealizados,
      views,
      uniqueViews,
      totalCotacoes,
      totalVendas,
      txCotacao,
      txVenda,
      txFechamento,
      criadoEm,
      ultimoAcesso,
      expiraEm,
      linkCompleto,
    ];

    return fields.map(escapeCsv).join(';');
  });

  // UTF-8 BOM (\uFEFF) para forçar o Microsoft Excel a abrir com acentuação correta
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}
