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

import { syncWixSalesToLocalDb } from '../src/lib/wix-sales-sync';
import { sql } from '../src/lib/pg';

async function main() {
  console.log('🚀 Iniciando sincronização e migração de vendas do Wix Import1...');
  const result = await syncWixSalesToLocalDb();
  console.log('\n✅ Sincronização concluída com sucesso!');
  console.log(`- Total de registros Wix processados: ${result.totalWixProcessed}`);
  console.log(`- Vendas oficiais criadas (apólices): ${result.salesCreated}`);
  console.log(`- Vendas oficiais atualizadas: ${result.salesUpdated}`);
  console.log(`- Cotações criadas: ${result.quotesCreated}`);
  console.log(`- Cotações atualizadas: ${result.quotesUpdated}`);
  console.log(`- Propostas pendentes mapeadas: ${result.pendingQuotesCount}`);
  console.log(`- Volume total de prêmio das novas vendas: R$ ${result.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`- Tempo decorrido: ${(result.durationMs / 1000).toFixed(2)}s`);

  const sales = result.details.filter((d) => d.action === 'sale_created');
  if (sales.length > 0) {
    console.log(`\n🎉 Primeiras 10 Vendas Emitidas:`);
    for (const s of sales.slice(0, 10)) {
      console.log(`  - [${s.documentNumber}] ${s.clientName} | Prêmio: R$ ${s.revenue?.toFixed(2)}`);
    }
    if (sales.length > 10) {
      console.log(`  ... e mais ${sales.length - 10} vendas.`);
    }
  }

  const errors = result.details.filter((d) => d.action === 'error');
  if (errors.length > 0) {
    console.log(`\n⚠️ Alertas/Erros encontrados (${errors.length}):`);
    for (const e of errors.slice(0, 5)) {
      console.log(`  - [${e.wixId}] ${e.error}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('❌ Falha na sincronização de vendas do Wix:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
