import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

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

const cwd = process.cwd();
loadEnvFile(path.join(cwd, '.env.local'));
loadEnvFile(path.join(cwd, '.env'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL não configurada.');
}

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  console.log('🚀 Consolidando catálogo oficial (2 produtos: RC Advogados e RC Médicos)...');

  const migrationSql = fs.readFileSync(
    path.join(cwd, 'db', 'migrations', '024-consolidate-two-rc-products.sql'),
    'utf8'
  );
  await sql.unsafe(migrationSql);

  const products = await sql`
    SELECT id, code, name, insurer_name, base_commission_rate, flow_key, is_active
    FROM products
    ORDER BY created_at ASC
  `;
  console.log('✅ Produtos ativos no catálogo:', products);
}

main()
  .catch((err) => {
    console.error('❌ Erro ao consolidar produtos:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
