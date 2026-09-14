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

import { ensureSchema } from '../src/lib/schema';
import { ensureDefaultEmailTemplates } from '../src/lib/email-service';
import { runFullLifecycleScan } from '../src/lib/lifecycle-service';
import { sql } from '../src/lib/pg';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  
  let selectedModule: 'all' | 'renewal' | 'delinquency' = 'all';
  if (args.includes('--module=renewal') || args.includes('-m=renewal')) {
    selectedModule = 'renewal';
  } else if (args.includes('--module=delinquency') || args.includes('-m=delinquency')) {
    selectedModule = 'delinquency';
  }

  const targetDateArg = args.find((a) => a.startsWith('--date=') || a.startsWith('-t='));
  const targetDate = targetDateArg ? targetDateArg.split('=')[1] : undefined;

  console.log('🔄 ==========================================');
  console.log('   DuoLife Hub — Régua de Lifecycle & Retenção');
  console.log('==========================================');
  console.log(`- Modo Simulação (Dry Run): ${dryRun ? 'SIM (Nenhum e-mail será disparado)' : 'NÃO (Produção)'}`);
  console.log(`- Módulo Selecionado: ${selectedModule.toUpperCase()}`);
  console.log(`- Data de Referência: ${targetDate || 'Hoje (' + new Date().toLocaleDateString('pt-BR') + ')'}`);
  console.log('------------------------------------------');

  try {
    await ensureSchema();
    await ensureDefaultEmailTemplates();

    console.log('🔍 Executando varredura no banco de dados...');
    const result = await runFullLifecycleScan({
      targetDate,
      dryRun,
      module: selectedModule,
      triggeredBy: 'cli',
    });

    console.log('\n📊 RESULTADOS DA EXECUÇÃO:');
    console.log(`- Status: ${result.ok ? '✅ SUCESSO' : '⚠️ FALHA / PARCIAL'}`);
    console.log(`- Duração: ${(result.durationMs / 1000).toFixed(2)}s`);

    if (selectedModule === 'all' || selectedModule === 'renewal') {
      console.log('\n📌 Régua de Renovação (D-60, D-30, D-15, D-0):');
      console.log(`  - Apólices ativas varridas: ${result.renewals.scanned}`);
      console.log(`  - Alertas ${dryRun ? 'identificados' : 'disparados'}: ${result.renewals.notified}`);
      console.log(`  - Apólices fora da janela / já notificadas: ${result.renewals.skipped}`);
    }

    if (selectedModule === 'all' || selectedModule === 'delinquency') {
      console.log('\n📌 Alertas de Inadimplência Asaas (A Vencer & Vencidas):');
      console.log(`  - Parcelas em aberto varridas: ${result.delinquency.scanned}`);
      console.log(`  - Alertas ${dryRun ? 'identificados' : 'disparados'}: ${result.delinquency.notified}`);
      console.log(`  - Parcelas fora da janela / já notificadas: ${result.delinquency.skipped}`);
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️ Alertas / Erros detectados:');
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }

    console.log('\n🏁 Execução concluída.');
  } catch (error) {
    console.error('\n❌ Erro fatal durante a execução do script:', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
