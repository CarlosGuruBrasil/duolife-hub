import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL é obrigatório para executar migrações.');

const migrationsDir = join(process.cwd(), 'db', 'migrations');
const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const name of files) {
    const [applied] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
    if (applied) continue;
    const migration = await readFile(join(migrationsDir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    process.stdout.write(`Migração aplicada: ${name}\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
