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

import { pullWixIntoLocalMirror } from '../src/lib/wix-pull';
import { sql } from '../src/lib/pg';

async function main() {
  console.log('🚀 Iniciando pull de dados do Wix (NET4LIFE)...');
  const result = await pullWixIntoLocalMirror();
  console.log('✅ Pull concluído com sucesso!');
  console.log('Resumo do sync:');
  console.log(`- Coleções sincronizadas: ${result.collectionsSynced}`);
  console.log(`- Itens de espelho importados: ${result.itemsSynced}`);
  console.log(`- Leads cadastrados/atualizados: ${result.leadsUpserted}`);
  console.log(`- Parceiros cadastrados/atualizados: ${result.partnersUpserted}`);
  console.log(`- Tempo decorrido: ${(result.durationMs / 1000).toFixed(2)}s`);
}

main()
  .catch((err) => {
    console.error('❌ Falha ao executar o pull do Wix:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Fecha a conexão com o banco de dados
    await sql.end({ timeout: 5 }).catch(() => {});
  });
