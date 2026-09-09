import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não configurada');
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

async function run() {
  console.log('Truncando tabelas locais...');
  await sql`
    TRUNCATE TABLE
      payment_installments,
      payment_orders,
      signature_documents,
      cupom_uso_eventos,
      commissions,
      sales,
      cotacoes,
      insurance_clients,
      leads
    CASCADE
  `;
  console.log('Tabelas locais truncadas com sucesso!');
  await sql.end();
}

run().catch((err) => {
  console.error('Erro ao truncar:', err);
  process.exit(1);
});
