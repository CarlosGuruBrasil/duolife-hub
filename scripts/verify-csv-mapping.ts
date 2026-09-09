import { readFileSync } from 'node:fs';
import { parseCsvContent } from '../src/lib/csv-parser';
import { mapSeguradoFromCsvRow } from '../src/lib/csv-row-mapper';

const csv = readFileSync(process.argv[2], 'utf8');
const { headers, rows } = parseCsvContent(csv);
console.log('headers:', headers.length, '| rows:', rows.length);

const counters: Record<string, number> = {};
const bump = (k: string, ok: boolean) => { counters[k] = (counters[k] || 0) + (ok ? 1 : 0); };

for (const row of rows) {
  const s = mapSeguradoFromCsvRow(row);
  bump('oab', !!s.oab);
  bump('celular', !!s.celularDigits);
  bump('dataNascto', !!s.dataNascto);
  bump('dataAtividade', !!s.dataAtividade);
  bump('cep', !!s.cep);
  bump('logradouro', !!s.logradouro);
  bump('numero', !!s.numero);
  bump('bairro', !!s.bairro);
  bump('cidade', !!s.cidade);
  bump('uf', !!s.uf);
  bump('dataInicioVigencia', !!s.dataInicioVigencia);
  bump('fimVigencia', !!s.fimVigencia);
  bump('atuacao', s.atuacao.length > 0);
  bump('ppeCargos', !!s.ppeCargos);
  bump('titularidade', !!s.titularidade);
  bump('escritorio', !!s.escritorioAssociado);
  bump('seguradora', !!s.seguradora);
  bump('dataRetroativa', !!s.dataRetroativa);
  bump('propostaRecusada', !!s.propostaRecusada);
  bump('lgpd', s.lgpd);
  bump('coberturaOk', s.valorCobertura >= 100000);
  bump('renovacaoSim', s.isRenovacao === 'Sim');
}

console.log('\n--- preenchidos apos o mapeamento ---');
for (const [k, v] of Object.entries(counters)) console.log(String(v).padStart(5), k);

console.log('\n--- amostra (linha 1) ---');
console.log(JSON.stringify(mapSeguradoFromCsvRow(rows[0]), null, 2));

const cobertura = new Map<number, number>();
for (const row of rows) {
  const c = mapSeguradoFromCsvRow(row).valorCobertura;
  cobertura.set(c, (cobertura.get(c) || 0) + 1);
}
console.log('\n--- distribuicao de cobertura ---');
[...cobertura.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(String(n).padStart(5), c));
