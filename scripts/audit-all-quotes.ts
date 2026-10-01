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

import { auditAnachronicQuotes, purgeAndReconcileAnachronicBatch } from '../src/lib/asaas-sync';

async function main() {
  const isPurge = process.argv.includes('--purge');
  const isDryRun = !isPurge;

  console.log('=== AUDITORIA DE COTAÇÕES COM COBRANÇAS ANACRÔNICAS (ASAAS) ===');
  console.log(`Modo: ${isPurge ? 'EXECUÇÃO REAL (--purge)' : 'SIMULAÇÃO/AUDITORIA'}\n`);

  const audit = await auditAnachronicQuotes();
  console.log(`Total de cotações avaliadas: ${audit.totalQuotesAudited}`);
  console.log(`Cotações com anacronismo detectadas: ${audit.totalAnachronicFound}\n`);

  if (audit.items.length === 0) {
    console.log('Nenhuma cotação com cobrança anacrônica encontrada no banco de dados!');
    process.exit(0);
  }

  for (const item of audit.items) {
    console.log('------------------------------------------------------------');
    console.log(`Cotação ID: ${item.cotacaoId}`);
    console.log(`Cliente: ${item.clientName} (CPF/CNPJ: ${item.clientCpfCnpj})`);
    console.log(`Status Atual: ${item.statusAtual}`);
    console.log(`Data Criação: ${item.cotacaoCriadaEm}`);
    console.log(`Valor Cotação: R$ ${item.cotacaoValor.toFixed(2)}`);
    console.log(`Order ID: ${item.orderId || 'Nenhuma'}`);
    console.log(`Order Valor: ${item.orderAmount ? `R$ ${item.orderAmount.toFixed(2)}` : 'N/A'}`);
    console.log(`Order Vencimento: ${item.orderDueDate || 'N/A'}`);
    console.log(`Order Criada Em: ${item.orderCreatedAt || 'N/A'}`);
    console.log(`External Payment ID: ${item.externalPaymentId || 'N/A'}`);
    console.log(`Apólice Vinculada: ${item.policyNumber || 'Nenhuma'}`);
    console.log(`Contrato Assinado: ${item.hasSignedContract ? 'SIM' : 'NÃO'}`);
    console.log(`Motivos: ${item.motivoAnacronismo.join('; ')}`);
  }

  if (isPurge) {
    console.log('\n>>> Iniciando expurgo e reconciliação em lote...');
    const result = await purgeAndReconcileAnachronicBatch({ dryRun: false });
    console.log(`Processados: ${result.totalProcessed}`);
    console.log(`Expurgados: ${result.purgedCount}`);
    console.log(`Reconciliados com fatura legítima: ${result.reconciledCount}`);
    console.log(`Erros: ${result.errorsCount}`);
  } else {
    console.log('\n[DICA] Para executar a limpeza e reconciliação definitiva, execute:');
    console.log('npx tsx scripts/audit-all-quotes.ts --purge');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
