import type { RawCsvRow } from './csv-parser';

/**
 * Mapeamento dos campos "de cadastro" do export do Wix (BDRC) para o formato
 * canônico usado pelo formulário de RC (`CotacaoFormRC`) e pelas telas de
 * detalhe de cotação (admin e portal).
 *
 * Antes deste módulo o importador só lia ~30 das 110 colunas do CSV: todo o
 * bloco pessoal/profissional (OAB, celular, nascimento, endereço, vigência,
 * seguro anterior, declarações) ficava apenas dentro de `metadata.rawCsvData`,
 * e portanto não aparecia em lugar nenhum da UI.
 */

/** Chave canônica: sem acento, sem espaço/pontuação, minúscula. */
function normKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export type RowIndex = Map<string, string>;

/**
 * Indexa a linha por chave normalizada. Torna a leitura imune a variações de
 * acentuação/caixa/espaço nos cabeçalhos entre exports do Wix
 * (ex.: "Início da Vigência" vs "Inicio da Vigencia").
 */
export function buildRowIndex(row: RawCsvRow): RowIndex {
  const idx: RowIndex = new Map();
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const k = normKey(key);
    if (!idx.has(k)) idx.set(k, trimmed);
  }
  return idx;
}

/** Primeiro valor não vazio dentre os nomes de coluna informados. */
export function pick(idx: RowIndex, ...names: string[]): string | null {
  for (const name of names) {
    const v = idx.get(normKey(name));
    if (v) return v;
  }
  return null;
}

/** Só dígitos (telefone, CEP, CPF). */
export function onlyDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
}

/**
 * Data -> 'YYYY-MM-DD'. Descarta sentinelas do Wix ('0000-00-00') e datas
 * absurdas, que hoje entravam no banco como valor inválido.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^0{4}-0{2}-0{2}/.test(trimmed)) return null;

  let d = new Date(trimmed);
  if (isNaN(d.getTime())) {
    const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!br) return null;
    d = new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`);
    if (isNaN(d.getTime())) return null;
  }

  const year = d.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  return d.toISOString().slice(0, 10);
}

/** 'S' | 'Sim' | 'true' | '1' -> 'Sim'; 'N' | 'Não' | 'false' | '0' -> 'Não'. */
export function toSimNao(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!v) return null;
  if (v === 's' || v === 'sim' || v === 'true' || v === '1' || v === 'y' || v === 'yes') return 'Sim';
  if (v === 'n' || v === 'nao' || v === 'false' || v === '0' || v === 'no') return 'Não';
  return null;
}

export function toBool(value: string | null | undefined): boolean {
  return toSimNao(value) === 'Sim';
}

/**
 * Listas do Wix vêm delimitadas por '#': '#Civil#Bancário#' -> ['Civil','Bancário'].
 * '9999' é o sentinela de "nenhum" usado no PpeCargoSelect.
 */
export function parseHashList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split('#')
    .map((part) => part.trim())
    .filter((part) => part && part !== '0' && part !== '9999');
}

const PLAN_COVERAGE: Record<string, number> = {
  '100k': 100000,
  '300k': 300000,
  '500k': 500000,
  '1mi': 1000000,
  '1.5mi': 1500000,
  '2mi': 2000000,
  '3mi': 3000000,
};

/**
 * Converte moeda BR em número. Trata NBSP ("R$ 100.000,00"), presente em
 * ~40% das linhas do export, e os apelidos de plano ('100k', '1mi').
 */
export function parseMoney(value: string | null | undefined, fallback: number | null = null): number | null {
  if (!value) return fallback;
  const clean = value.replace(/R\$/gi, '').replace(/[\s ]/g, '').trim();
  if (!clean) return fallback;

  const alias = PLAN_COVERAGE[clean.toLowerCase()];
  if (alias) return alias;

  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const n = parseFloat(normalized);
  return isNaN(n) ? fallback : n;
}

/** Cobertura a partir de Valorcobertura, com fallback para Tipo/Nomeplano. */
export function resolveCoverage(
  valorCobertura: string | null,
  tipo: string | null,
  nomePlano: string | null,
  fallback = 100000
): number {
  const direct = parseMoney(valorCobertura, null);
  if (direct !== null && direct >= 1000) return direct;

  for (const candidate of [tipo, nomePlano, valorCobertura]) {
    if (!candidate) continue;
    const key = candidate.replace(/[\s ]/g, '').toLowerCase();
    if (PLAN_COVERAGE[key]) return PLAN_COVERAGE[key];
    const milhoes = candidate.match(/^([\d.,]+)\s*mil+h(?:o|ó)es?$/i);
    if (milhoes) {
      const n = parseFloat(milhoes[1].replace(',', '.'));
      if (!isNaN(n)) return Math.round(n * 1000000);
    }
  }
  return fallback;
}

const UF_LIST = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]);

/** UF vem como 'sc', 'Sc', 'SC' no export. */
export function normalizeUf(value: string | null | undefined): string | null {
  if (!value) return null;
  const uf = value.trim().toUpperCase();
  return UF_LIST.has(uf) ? uf : null;
}

/** Descarta lixo de digitação usado como "vazio" no Wix ('.', '-', "'-"). */
function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^['".\-\s]+$/.test(trimmed)) return null;
  return trimmed;
}

export interface SeguradoCsvData {
  celular: string | null;
  celularDigits: string | null;
  oab: string | null;
  dataNascto: string | null;
  dataAtividade: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  enderecoCompleto: string | null;
  titularidade: string | null;
  escritorioAssociado: string | null;
  atuacao: string[];
  ppeCargos: string | null;
  ppeRepresenta: string | null;
  ppeCargoSelect: string[];
  lgpd: boolean;
  tipoDePlano: string | null;
  nomePlano: string | null;
  valorCobertura: number;
  planoFranquia: string | null;
  dataInicioVigencia: string | null;
  fimVigencia: string | null;
  isRenovacao: string;
  seguradora: string | null;
  vigencia: string | null;
  limite: string | null;
  franquiaAnterior: string | null;
  premio: string | null;
  dataRetroativa: string | null;
  propostaRecusada: string | null;
  propostaDetalhe: string | null;
  reclamacaoProfissional: string | null;
  reclamacaoDetalhe: string | null;
  investigacaoAutoridade: string | null;
  investigacaoDetalhe: string | null;
  fatoTerceiros: string | null;
  fatoDetalhe: string | null;
  pagouReclamacao: string | null;
  pagouDetalhe: string | null;
  codigoWix: string | null;
}

/** Extrai o bloco cadastral/profissional completo de uma linha do CSV. */
export function mapSeguradoFromCsvRow(row: RawCsvRow): SeguradoCsvData {
  const idx = buildRowIndex(row);

  const celular = pick(idx, 'Celular', 'Telefone', 'Phone');
  const logradouro = cleanText(pick(idx, 'Logradouro', 'Endereco', 'Endereço'));
  const numero = cleanText(pick(idx, 'Numero', 'Número'));
  const complemento = cleanText(pick(idx, 'Complemento'));
  const bairro = cleanText(pick(idx, 'Bairro'));
  const cidade = cleanText(pick(idx, 'Cidade'));
  const uf = normalizeUf(pick(idx, 'UF', 'Estado'));
  const cep = onlyDigits(pick(idx, 'Cep', 'CEP'));

  const enderecoCompleto = logradouro
    ? [
        `${logradouro}${numero ? `, ${numero}` : ''}`,
        complemento,
        bairro,
        cidade && uf ? `${cidade}/${uf}` : cidade,
        cep,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const tipoDePlano = cleanText(pick(idx, 'Tipo', 'tipoDePlano'));
  const nomePlano = cleanText(pick(idx, 'Nomeplano', 'NomePlano'));
  const valorCoberturaRaw = pick(idx, 'Valorcobertura', 'ValorCobertura');

  return {
    celular,
    celularDigits: onlyDigits(celular),
    oab: cleanText(pick(idx, 'Oab', 'OAB')),
    dataNascto: toIsoDate(pick(idx, 'DataNascto', 'DataNascimento')),
    dataAtividade: toIsoDate(pick(idx, 'DataAtividade')),
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    enderecoCompleto,
    titularidade: cleanText(pick(idx, 'Titularidade')),
    escritorioAssociado: cleanText(pick(idx, 'EscritorioAssociado', 'Escritório Associado')),
    atuacao: parseHashList(pick(idx, 'Atuacao', 'Atuação')),
    ppeCargos: toSimNao(pick(idx, 'PpeCargos')),
    ppeRepresenta: toSimNao(pick(idx, 'PpeRepresenta')),
    ppeCargoSelect: parseHashList(pick(idx, 'PpeCargoSelect')),
    lgpd: toBool(pick(idx, 'Lgpd', 'LGPD')),
    tipoDePlano,
    nomePlano: nomePlano || tipoDePlano,
    valorCobertura: resolveCoverage(valorCoberturaRaw, tipoDePlano, nomePlano),
    planoFranquia: pick(idx, 'Planofranquia', 'PlanoFranquia'),
    dataInicioVigencia: toIsoDate(pick(idx, 'Início da Vigência', 'InicioVigencia')),
    fimVigencia: toIsoDate(pick(idx, 'Fim da Vigência', 'FimVigencia', 'fimVidencia')),
    isRenovacao: toBool(pick(idx, 'Renovação', 'Renovacao')) ? 'Sim' : 'Não',
    seguradora: cleanText(pick(idx, 'Seguradora')),
    vigencia: toIsoDate(pick(idx, 'Vigencia', 'Vigência')),
    limite: cleanText(pick(idx, 'Limite')),
    franquiaAnterior: cleanText(pick(idx, 'Franquia')),
    premio: cleanText(pick(idx, 'Premio', 'Prêmio')),
    dataRetroativa: toIsoDate(pick(idx, 'DataRetroativa')),
    propostaRecusada: toSimNao(pick(idx, 'PropostaRecusada')),
    propostaDetalhe: cleanText(pick(idx, 'PropostaDetalhe')),
    reclamacaoProfissional: toSimNao(pick(idx, 'ReclamacaoProfissional')),
    reclamacaoDetalhe: cleanText(pick(idx, 'ReclamacaoDetalhe')),
    investigacaoAutoridade: toSimNao(pick(idx, 'InvestigacaoAutoridade')),
    investigacaoDetalhe: cleanText(pick(idx, 'InvestigacaoDetalhe')),
    fatoTerceiros: toSimNao(pick(idx, 'FatoTerceiros')),
    fatoDetalhe: cleanText(pick(idx, 'FatoDetalhe')),
    pagouReclamacao: toSimNao(pick(idx, 'PagouReclamacao')),
    pagouDetalhe: cleanText(pick(idx, 'PagouDetalhe')),
    codigoWix: cleanText(pick(idx, 'Codigo', 'Código')),
  };
}
