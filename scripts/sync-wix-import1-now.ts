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

// Carrega as variáveis de ambiente do .env.local
console.log('Carregando variáveis de ambiente...');
loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

import { syncWixClientsToLocalDb } from '../src/lib/wix-compare';
import { sql } from '../src/lib/pg';

async function main() {
  console.log('🚀 Iniciando sincronização: Copiar dados do Wix Import1 e atualizar banco local...');
  const result = await syncWixClientsToLocalDb();
  console.log('✅ Sincronização concluída com sucesso!');
  console.log(`- Total de registros Wix processados: ${result.totalWixProcessed}`);
  console.log(`- Novos clientes importados: ${result.importedCount}`);
  console.log(`- Clientes existentes atualizados com dados do Wix: ${result.updatedCount}`);
  console.log(`- Clientes sem divergências (inalterados): ${result.unchangedCount}`);
  console.log(`- Erros: ${result.errorsCount}`);
  console.log(`- Tempo decorrido: ${(result.durationMs / 1000).toFixed(2)}s`);

  if (result.details.length > 0) {
    console.log('\n--- Detalhes das Ações ---');
    const imported = result.details.filter((d) => d.action === 'imported');
    const updated = result.details.filter((d) => d.action === 'updated');
    const errors = result.details.filter((d) => d.action === 'error');

    if (imported.length > 0) {
      console.log(`\n📥 Novos Clientes Importados (${imported.length}):`);
      for (const item of imported.slice(0, 15)) {
        console.log(`  - [${item.documentNumber || item.wixId}] ${item.name}`);
      }
      if (imported.length > 15) console.log(`  ... e mais ${imported.length - 15} clientes.`);
    }

    if (updated.length > 0) {
      console.log(`\n🔄 Clientes Atualizados com Dados do Wix (${updated.length}):`);
      for (const item of updated.slice(0, 15)) {
        console.log(`  - [${item.documentNumber || item.wixId}] ${item.name}`);
        if (item.changes) {
          for (const c of item.changes) {
            console.log(`      ↳ ${c}`);
          }
        }
      }
      if (updated.length > 15) console.log(`  ... e mais ${updated.length - 15} clientes.`);
    }

    if (errors.length > 0) {
      console.log(`\n⚠️ Erros (${errors.length}):`);
      for (const item of errors) {
        console.log(`  - [${item.documentNumber || item.wixId}] ${item.error}`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error('❌ Falha ao executar sincronização:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
