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

import { reconcileZapSignDocuments, getZapSignSyncStatus } from '../src/lib/zapsign-sync';
import { syncWixTokensToContracts } from '../src/lib/wix-sales-sync';

async function main() {
  console.log('🚀 Iniciando atualização e reconciliação de contratos...\n');

  console.log('1️⃣ Sincronizando Tokens do Wix Import1 (regra oficial: quem tem Token assinou)...');
  const wixRes = await syncWixTokensToContracts();
  console.log(`  - Total no Wix com Token identificado: ${wixRes.totalWixWithToken}`);
  console.log(`  - Cotações atualizadas para status assinado: ${wixRes.quotesUpdated}`);
  console.log(`  - Assinaturas registradas como "signed": ${wixRes.signaturesUpserted}`);
  console.log(`  - Duração: ${(wixRes.durationMs / 1000).toFixed(2)}s\n`);

  console.log('2️⃣ Estado Consolidado dos Tokens no Banco de Dados:');
  const beforeStatus = await getZapSignSyncStatus();
  console.log(`  - Total de tokens identificados: ${beforeStatus.totalTokens}`);
  console.log(`  - Contratos já confirmados como assinados: ${beforeStatus.signedTokens}`);
  console.log(`  - Contratos aguardando validação na ZapSign: ${beforeStatus.pendingTokens}\n`);

  if (beforeStatus.pendingTokens === 0 && process.argv.includes('--only-pending')) {
    console.log('✅ Nenhum contrato pendente de validação encontrado.');
    process.exit(0);
  }

  const forceAll = process.argv.includes('--all');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500;

  console.log(`⚙️ Parâmetros da execução: onlyPending = ${!forceAll}, limit = ${limit}`);
  console.log('⏳ Consultando API da ZapSign...');

  const result = await reconcileZapSignDocuments({
    onlyPending: !forceAll,
    limit,
    concurrency: 4,
  });

  console.log('\n🎉 Reconciliação com a ZapSign Concluída!');
  console.log(`  - Total de tokens processados: ${result.totalProcessed}`);
  console.log(`  - Atualizados para "Assinado": ${result.updatedToSigned}`);
  console.log(`  - Documentos ainda pendentes na ZapSign: ${result.stillPending}`);
  console.log(`  - Erros ou não encontrados: ${result.notFoundOrError}`);
  console.log(`  - Tempo de execução: ${(result.durationMs / 1000).toFixed(2)}s\n`);

  const updated = result.details.filter((d) => d.action === 'updated_to_signed');
  if (updated.length > 0) {
    console.log(`📄 Primeiros contratos atualizados (${updated.length}):`);
    for (const item of updated.slice(0, 10)) {
      console.log(`  - [Token: ${item.docToken}] ${item.clientName || 'Cliente'} -> Assinado (${item.signedFileUrl ? 'PDF obtido' : 'sem URL'})`);
    }
    if (updated.length > 10) {
      console.log(`  ... e mais ${updated.length - 10} contratos atualizados.`);
    }
  }

  const errors = result.details.filter((d) => d.action === 'error');
  if (errors.length > 0) {
    console.log(`\n⚠️ Alertas ou Erros (${errors.length}):`);
    for (const err of errors.slice(0, 5)) {
      console.log(`  - [${err.docToken}] ${err.error}`);
    }
  }

  const afterStatus = await getZapSignSyncStatus();
  console.log('\n📊 Estado Consolidado Após a Reconciliação:');
  console.log(`  - Total assinados: ${afterStatus.signedTokens}`);
  console.log(`  - Total pendentes: ${afterStatus.pendingTokens}`);
}

main().catch((err) => {
  console.error('\n❌ Falha na execução da reconciliação com a ZapSign:', err);
  process.exitCode = 1;
});
