/**
 * Mapeamento e normalização das Áreas de Atuação Jurídica do DuoLife Hub.
 *
 * Converte qualquer representação de área (chaves camelCase do Wix, listas separadas
 * por dois pontos, hashtags, vírgulas, ponto e vírgula ou nomes por extenso) para as 12
 * chaves canônicas do sistema, e provê formatação amigável para exibição em tela e geração de contratos.
 */

export const AREAS_ATUACAO_MAP: Record<string, string> = {
  civil: 'Civil',
  propriedadeIndustrial: 'Propriedade Industrial',
  bancarioFinanceiro: 'Bancário/Financeiro',
  criminal: 'Criminal',
  tributaria: 'Tributária',
  previdenciario: 'Previdenciário',
  direitoInternacional: 'Direito Internacional',
  fusoesAquisicoes: 'Fusões & Aquisições',
  direitoEmpresarial: 'Direito Empresarial',
  trabalhista: 'Trabalhista',
  societario: 'Societário',
  outros: 'Outros',
};

const CANONICAL_ALIASES: Record<string, string> = {
  civil: 'civil',
  industrial: 'propriedadeIndustrial',
  propriedadeindustrial: 'propriedadeIndustrial',
  bancario: 'bancarioFinanceiro',
  bancariofinanceiro: 'bancarioFinanceiro',
  criminal: 'criminal',
  tributaria: 'tributaria',
  previdenciario: 'previdenciario',
  internacional: 'direitoInternacional',
  direitointernacional: 'direitoInternacional',
  fusoes: 'fusoesAquisicoes',
  fusoesaquisicoes: 'fusoesAquisicoes',
  empresarial: 'direitoEmpresarial',
  direitoempresarial: 'direitoEmpresarial',
  trabalhista: 'trabalhista',
  societario: 'societario',
  outros: 'outros',
};

function normalizeToken(raw: string): string | null {
  const norm = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return CANONICAL_ALIASES[norm] || null;
}

/**
 * Converte qualquer valor bruto de atuação (string delimitada por ':', '#', ',', ';', '|'
 * ou array de strings) em uma lista de chaves canônicas.
 */
export function parseAtuacaoList(val: unknown): string[] {
  if (!val) return [];
  const rawList = Array.isArray(val) ? val : [val];
  const result = new Set<string>();

  for (const item of rawList) {
    if (!item) continue;
    const str = typeof item === 'string' ? item : String(item);
    const tokens = str.split(/[#:;,|]/).map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (token === '0' || token === '9999') continue;
      const canonical = normalizeToken(token);
      if (canonical) {
        result.add(canonical);
      } else if (token.length > 0) {
        result.add(token);
      }
    }
  }

  return Array.from(result);
}

/**
 * Formata as áreas de atuação em texto legível separado por vírgula para exibição
 * em detalhes da cotação, painéis administrativos e portais.
 */
export function formatAtuacao(val: unknown): string {
  const list = parseAtuacaoList(val);
  if (list.length === 0) return 'Civil';
  return list.map((k) => AREAS_ATUACAO_MAP[k] || k).join(', ');
}
