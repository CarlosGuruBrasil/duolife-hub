import bcrypt from 'bcryptjs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL ausente em .env.local');
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  const email = 'carlosad1981@gmail.com'.toLowerCase().trim();
  const password = 'Carlosad$2026';
  const name = 'Carlos Augusto Duarte';
  const role = 'duolife_admin';

  // Garantir que a tabela admin_users existe
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'staff',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const hash = await bcrypt.hash(password, 10);

  const [user] = await sql`
    INSERT INTO admin_users (name, email, password_hash, role, is_active)
    VALUES (${name}, ${email}, ${hash}, ${role}, true)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      is_active = true
    RETURNING id, name, email, role, is_active, created_at, password_hash
  `;

  const isValid = await bcrypt.compare(password, user.password_hash);

  console.log('✅ Usuário Admin pronto:');
  console.log(`- ID: ${user.id}`);
  console.log(`- Nome: ${user.name}`);
  console.log(`- E-mail: ${user.email}`);
  console.log(`- Perfil: ${user.role}`);
  console.log(`- Ativo: ${user.is_active}`);
  console.log(`- Validação de senha: ${isValid ? 'OK' : 'FALHOU'}`);

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
