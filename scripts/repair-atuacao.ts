import { sql } from '../src/lib/pg';

const CANONICAL_MAP: Record<string, string> = {
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
  return CANONICAL_MAP[norm] || null;
}

export function parseAtuacaoList(val: any): string[] {
  if (!val) return [];
  const rawList = Array.isArray(val) ? val : [val];
  const result = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== 'string') continue;
    const tokens = item.split(/[#:;,|]/).map(t => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (token === '0' || token === '9999') continue;
      const canonical = normalizeToken(token);
      if (canonical) {
        result.add(canonical);
      }
    }
  }

  return Array.from(result);
}

async function main() {
  const cotacoes = await sql<any[]>`SELECT id, client_data FROM cotacoes`;
  let updatedCount = 0;

  for (const c of cotacoes) {
    let cd: any = c.client_data;
    if (typeof cd === 'string') {
      try { cd = JSON.parse(cd); } catch { continue; }
    }
    if (!cd) continue;

    const currentAtuacao = cd.atuacao;
    const parsed = parseAtuacaoList(currentAtuacao);

    // If it was modified / normalized
    const currentJson = JSON.stringify(currentAtuacao || []);
    const parsedJson = JSON.stringify(parsed);

    if (currentJson !== parsedJson && (parsed.length > 0 || (Array.isArray(currentAtuacao) && currentAtuacao.length > 0))) {
      cd.atuacao = parsed;
      await sql`
        UPDATE cotacoes
        SET client_data = ${JSON.stringify(cd)}::jsonb
        WHERE id = ${c.id}
      `;
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} cotacoes with normalized atuacao!`);
  process.exit(0);
}

main().catch(console.error);
