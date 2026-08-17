import bcrypt from 'bcryptjs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL ausente');

const sql = postgres(databaseUrl);

async function main() {
  const password = 'net4life2026';
  const hash = await bcrypt.hash(password, 10);
  const email = 'carlos@guru.dev.br';

  // 1. Admin User
  await sql`
    INSERT INTO admin_users (name, email, password_hash, role, is_active)
    VALUES ('Carlos Guru (Admin)', ${email}, ${hash}, 'duolife_admin', true)
    ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}, is_active = true
  `;
  console.log('✅ Admin cadastrado/atualizado:', email);

  // 2. Partner User (vinculado ao parceiro 'Carlos Guru')
  const [partner] = await sql`
    SELECT id FROM partners WHERE razao_social ILIKE '%Carlos Guru%' OR razao_social ILIKE '%Carlos%' LIMIT 1
  `;

  if (partner) {
    await sql`
      INSERT INTO partner_users (partner_id, name, email, password_hash, role, is_active)
      VALUES (${partner.id}, 'Carlos Guru (Parceiro)', ${email}, ${hash}, 'owner', true)
      ON CONFLICT (email) DO UPDATE SET partner_id = ${partner.id}, password_hash = ${hash}, is_active = true
    `;
    console.log('✅ Usuário parceiro cadastrado/atualizado:', email, 'Parceiro ID:', partner.id);
  } else {
    console.log('⚠️ Nenhum parceiro encontrado para vincular');
  }

  await sql.end();
}

main().catch((err) => {
  console.error('Erro ao popular credenciais:', err);
  process.exit(1);
});
