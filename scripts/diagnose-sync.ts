import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

import { compareClientsWithWix, fetchAllWixImport1Items, fetchAllDbClients } from '../src/lib/wix-compare';
import { sql } from '../src/lib/pg';

async function main() {
  console.log('--- DIAGNÓSTICO WIX IMPORT1 vs BANCO LOCAL ---');
  
  const [dbClients, wixData, dbCount] = await Promise.all([
    fetchAllDbClients(),
    fetchAllWixImport1Items(),
    sql`SELECT COUNT(*) as count FROM insurance_clients`,
  ]);

  console.log(`Total no Banco (insurance_clients): ${dbCount[0].count}`);
  console.log(`Total DbClients carregados: ${dbClients.length}`);
  console.log(`Total WixData items: ${wixData.items.length} (Fonte: ${wixData.source})`);

  const comp = await compareClientsWithWix();
  console.log('\nResumo da Comparação:', comp.summary);

  const onlyWix = comp.rows.filter(r => r.matchStatus === 'only_wix');
  console.log(`\nTotal marcado como only_wix: ${onlyWix.length}`);
  
  if (onlyWix.length > 0) {
    console.log('\nAmostra dos primeiros 10 itens only_wix:');
    for (const row of onlyWix.slice(0, 10)) {
      const w = row.wixRecord;
      console.log(`ID: ${w?.id} | Nome: ${w?.name} | CPF: ${w?.documentNumber} | Email: ${w?.email} | Tel: ${w?.phone} | Status: ${w?.statusCliente}`);
    }
  }

  // Verifica se há CPFs duplicados no Wix
  const cpfCounts = new Map<string, number>();
  let noCpfCount = 0;
  for (const item of wixData.items) {
    if (!item.documentNumber) {
      noCpfCount++;
    } else {
      cpfCounts.set(item.documentNumber, (cpfCounts.get(item.documentNumber) || 0) + 1);
    }
  }

  const duplicates = Array.from(cpfCounts.entries()).filter(([_, count]) => count > 1);
  console.log(`\nItens no Wix SEM CPF/CNPJ: ${noCpfCount}`);
  console.log(`CPFs distintos no Wix: ${cpfCounts.size}`);
  console.log(`CPFs com mais de 1 registro no Wix: ${duplicates.length} (Total de duplicatas: ${duplicates.reduce((acc, [_, c]) => acc + c, 0)})`);

  if (duplicates.length > 0) {
    console.log('Top 5 CPFs duplicados no Wix:');
    for (const [cpf, count] of duplicates.slice(0, 5)) {
      console.log(`  CPF ${cpf}: ${count} ocorrências no Wix`);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
