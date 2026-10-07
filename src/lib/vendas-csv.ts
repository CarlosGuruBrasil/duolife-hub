import { formatCurrency, parseCurrencyToNumber, formatStatusLabel, formatPlanLabel, resolvePolicyExpiryDate } from './format';
import { sql } from './pg';
import { logger } from './logger';

export interface VendaExportRow {
  id: string;
  cotacao_id?: string | null;
  policy_number?: string | null;
  importancia_segurada?: number | string | null;
  premio_total: number | string | null;
  commission_amount?: number | string | null;
  commission_rate?: number | string | null;
  status?: string | null;
  source?: string | null;
  issue_date?: string | Date | null;
  expiry_date?: string | Date | null;
  created_at?: string | Date | null;
  client_name?: string | null;
  client_cpf_cnpj?: string | null;
  client_data?: unknown;
  product_id?: string | null;
  product_name?: string | null;
  partner_name?: string | null;
  is_renewal?: boolean | null;
}

/**
 * Tabela canônica de PremioNet conforme regras do ecossistema e legado Wix.
 */
export const PREMIO_NET_POR_TIPO: Record<string, string> = {
  '100k': '213,69',
  '200k': '350,00',
  '300k': '495,02',
  '500k': '599,18',
  '1mi': '839,71',
  '1.5mi': '1098,50',
  '2mi': '1376,61',
  '3mi': '1791,10',
};

/**
 * Mapeamento direto por valor numérico de Importância Segurada (LMI).
 */
export const PREMIO_NET_POR_LMI: Record<number, string> = {
  100000: '213,69',
  200000: '350,00',
  300000: '495,02',
  500000: '599,18',
  1000000: '839,71',
  1500000: '1098,50',
  2000000: '1376,61',
  3000000: '1791,10',
};

function parseClientData(data: unknown): Record<string, any> {
  if (!data) return {};
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, any>;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).trim();
  return `"${str.replace(/"/g, '""')}"`;
}

function formatCpfCnpjCsv(value: unknown): string {
  if (!value) return '-';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits.length > 0 ? digits : '-';
}

function formatarDataCsv(value: unknown): string {
  if (!value) return '-';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '-';
    return value.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  const str = String(value).trim();
  if (!str || str === '-') return '-';

  // Se já for DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // Se vier com DD/MM/YYYY HH:mm...
  const brMatch = str.match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (brMatch) {
    return brMatch[1];
  }

  // Formato YYYY-MM-DD ou ISO
  const isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, y, m, d] = isoDateMatch;
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  return '-';
}

function formatarMoedaCsv(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = parseCurrencyToNumber(value, NaN);
  if (isNaN(num)) return '-';
  return formatCurrency(num).replace(/[\u00A0\u202F]/g, ' ');
}

function parsePayloadData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj === 'object' && obj !== null) {
    const itemObj = (obj as Record<string, unknown>).item || obj;
    const dataObj = (itemObj as Record<string, unknown>).data || itemObj;
    return dataObj as Record<string, unknown>;
  }
  return {};
}

/**
 * Consulta a coleção 'Planos' no banco de dados e retorna um mapa de PremioNet
 * mesclando a tabela canônica 'PREMIO_NET_POR_TIPO' com as customizações ativas do banco.
 */
export async function obterMapaPremioNetConfigurado(): Promise<Record<string, string>> {
  const mapa: Record<string, string> = { ...PREMIO_NET_POR_TIPO };
  try {
    const rows = await sql`
      SELECT wi.payload
      FROM wix_items wi
      JOIN wix_collections wc ON wi.wix_collection_id = wc.id
      WHERE wc.collection_id = 'Planos' OR wc.collection_name = 'Planos'
      ORDER BY wi.created_at ASC
    `;

    for (const row of rows) {
      const data = parsePayloadData(row.payload);
      const tipo = String(data.tipoDePlano || '').toLowerCase().trim();
      const premioNet =
        data.premioNet !== undefined && data.premioNet !== null ? String(data.premioNet).trim() : '';
      if (tipo && premioNet) {
        mapa[tipo] = premioNet;
      }
    }
  } catch (error) {
    logger.error({ error }, 'vendas-csv.obterMapaPremioNetConfigurado.failed');
  }
  return mapa;
}

const LMI_TO_TIPO: Record<number, string> = {
  100000: '100k',
  200000: '200k',
  300000: '300k',
  500000: '500k',
  1000000: '1mi',
  1500000: '1.5mi',
  2000000: '2mi',
  3000000: '3mi',
};

function resolverPremioNet(
  importanciaSegurada: unknown,
  clientData: Record<string, any>,
  productName?: string | null,
  customNetMap?: Record<string, string>
): string {
  const getNetFromKey = (key: string): string | undefined => {
    const k = key.toLowerCase().trim();
    if (customNetMap && customNetMap[k]) {
      return customNetMap[k];
    }
    if (PREMIO_NET_POR_TIPO[k]) {
      return PREMIO_NET_POR_TIPO[k];
    }
    return undefined;
  };

  // 1. Verificar chaves explícitas de tipo de plano em client_data
  const tipoCandidates = [
    clientData.tipo,
    clientData.tipoDePlano,
    clientData.plano,
    clientData.nomePlano,
    clientData.planName,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  for (const t of tipoCandidates) {
    const val = getNetFromKey(t);
    if (val) {
      return val;
    }
  }

  // 2. Extrair valor numérico de LMI
  const rawLmi =
    importanciaSegurada ??
    clientData.valorCobertura ??
    clientData.cobertura ??
    clientData.coverageAmount ??
    clientData.limite;

  let numLmi = parseCurrencyToNumber(rawLmi, 0);

  // Trata possível multiplicação histórica por 100 (ex: 30.000.000 em vez de 300.000)
  if (numLmi >= 10000000 && numLmi <= 300000000 && numLmi % 100 === 0) {
    const divided = numLmi / 100;
    if (PREMIO_NET_POR_LMI[divided] || LMI_TO_TIPO[divided]) {
      numLmi = divided;
    }
  }

  if (numLmi > 0) {
    const tipo = LMI_TO_TIPO[numLmi];
    if (tipo) {
      const val = getNetFromKey(tipo);
      if (val) {
        return val;
      }
    }
    if (PREMIO_NET_POR_LMI[numLmi]) {
      return PREMIO_NET_POR_LMI[numLmi];
    }
  }

  // 3. Resolução via formatPlanLabel (que converte títulos como 'Plano 300 Mil' -> '300k')
  const planLabel = formatPlanLabel(rawLmi, clientData, productName).toLowerCase().trim();
  const valFromLabel = getNetFromKey(planLabel);
  if (valFromLabel) {
    return valFromLabel;
  }

  // 4. Fallback para client_data.premioNet ou client_data.premio_net
  const netFromClient = clientData.premioNet ?? clientData.premio_net;
  if (netFromClient !== undefined && netFromClient !== null && String(netFromClient).trim() !== '') {
    const netStr = String(netFromClient).trim();
    if (netStr.includes(',')) {
      return netStr;
    }
    const netNum = parseCurrencyToNumber(netStr, NaN);
    if (!isNaN(netNum) && netNum > 0) {
      return netNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return netStr;
  }

  return '';
}

/**
 * Gera o arquivo CSV completo de exportação de vendas no padrão do DuoLife Hub.
 * Inclui BOM UTF-8 (\uFEFF) e separador ponto e vírgula (;).
 */
export function gerarVendasCSV(
  vendas: VendaExportRow[],
  customNetMap?: Record<string, string>
): string {
  const header = [
    'Nº',
    'Nome Segurado',
    'Status',
    'IS',
    'Prêmio TOTAL',
    'CPF Segurado',
    'Vigência',
    'Retroatividade',
    'PremioNet',
    'Renovação',
  ].join(';');

  const linhas = vendas.map((venda, index) => {
    const indice = String(index + 1);
    const clientData = parseClientData(venda.client_data);

    // 1. Nome Segurado
    const nome = venda.client_name ?? clientData.nome ?? clientData.nomeCliente ?? '';

    // 2. Status: status original do client_data ou formatStatusLabel da venda
    const rawStatusOriginal =
      clientData.statusCliente ??
      clientData.status_cliente ??
      clientData.statusGeral ??
      clientData.statusOriginal;

    const statusFinal =
      rawStatusOriginal && String(rawStatusOriginal).trim() !== ''
        ? String(rawStatusOriginal).trim()
        : formatStatusLabel(venda.status);

    // 3. IS (Importância Segurada)
    const rawIs =
      venda.importancia_segurada ??
      clientData.valorCobertura ??
      clientData.cobertura ??
      clientData.coverageAmount;
    const isFormatada = formatarMoedaCsv(rawIs);

    // 4. Prêmio TOTAL
    const rawPremio = venda.premio_total ?? clientData.premio ?? clientData.valor ?? clientData.receita;
    const premioFormatado = formatarMoedaCsv(rawPremio);

    // 5. CPF Segurado
    const rawCpf =
      venda.client_cpf_cnpj ??
      clientData.cpf ??
      clientData.cnpj ??
      clientData.documento;
    const cpfFormatado = formatCpfCnpjCsv(rawCpf);

    // 6. Vigência: prioridade expiry_date, fimVigencia, vigencia, issue_date
    const rawExpiry = venda.expiry_date ?? clientData.fimVigencia;
    const rawVigencia =
      resolvePolicyExpiryDate(venda.issue_date, rawExpiry) ??
      rawExpiry ??
      clientData.vigencia ??
      venda.issue_date ??
      clientData.inicioVigencia;
    const vigenciaFormatada = formatarDataCsv(rawVigencia);

    // 7. Retroatividade: client_data.dataRetroativa
    const rawRetro = clientData.dataRetroativa ?? clientData.data_retroativa;
    const retroFormatada = formatarDataCsv(rawRetro);

    // 8. PremioNet
    const premioNet = resolverPremioNet(
      venda.importancia_segurada,
      clientData,
      venda.product_name,
      customNetMap
    );

    // 9. Renovação
    const isRenewalBool =
      venda.is_renewal === true ||
      clientData.isRenovacao === 'Sim' ||
      clientData.isRenovacao === 'sim' ||
      clientData.isRenovacao === true ||
      clientData.renovacao === true ||
      clientData.renovacao === 'Sim' ||
      clientData.renovacao === 'true' ||
      (rawRetro !== undefined &&
        rawRetro !== null &&
        String(rawRetro).trim() !== '' &&
        String(rawRetro).trim() !== '-');

    const renovacao = isRenewalBool ? 'Sim' : 'Não';

    return [
      indice,
      escapeCsv(nome),
      escapeCsv(statusFinal),
      escapeCsv(isFormatada),
      escapeCsv(premioFormatado),
      escapeCsv(cpfFormatado),
      escapeCsv(vigenciaFormatada),
      escapeCsv(retroFormatada),
      escapeCsv(premioNet),
      escapeCsv(renovacao),
    ].join(';');
  });

  return '\uFEFF' + [header, ...linhas].join('\r\n');
}
