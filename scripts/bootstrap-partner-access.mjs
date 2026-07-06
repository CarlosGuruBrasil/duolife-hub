import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

function loadEnvFile(filePath) {
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
  throw new Error('DATABASE_URL não configurada');
}

const partnerCompany = process.env.BOOTSTRAP_PARTNER_COMPANY || 'Parceiro Demo DuoLife';
const partnerName = process.env.BOOTSTRAP_PARTNER_NAME || 'Acesso DuoLife';
const partnerEmail = (process.env.BOOTSTRAP_PARTNER_EMAIL || 'acesso.parceiro@duolife.net.br').toLowerCase();
const partnerPassword = process.env.BOOTSTRAP_PARTNER_PASSWORD || crypto.randomBytes(8).toString('hex');

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
});

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS partners (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      razao_social  TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj          TEXT UNIQUE,
      email         TEXT NOT NULL,
      phone         TEXT,
      address       JSONB NOT NULL DEFAULT '{}',
      status        TEXT NOT NULL DEFAULT 'pending',
      metadata      JSONB NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_users (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id    TEXT NOT NULL REFERENCES partners(id),
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'seller',
      permissions   JSONB NOT NULL DEFAULT '{}',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function main() {
  await ensureSchema();

  const partnerRow = await sql.begin(async (tx) => {
    const [existingPartner] = await tx`
      SELECT id FROM partners WHERE email = ${partnerEmail} LIMIT 1
    `;

    const [partner] = existingPartner
      ? await tx`
          UPDATE partners
          SET razao_social = ${partnerCompany},
              nome_fantasia = ${partnerCompany},
              status = 'active',
              updated_at = NOW()
          WHERE id = ${existingPartner.id}
          RETURNING id, email
        `
      : await tx`
          INSERT INTO partners (razao_social, nome_fantasia, email, status, metadata)
          VALUES (${partnerCompany}, ${partnerCompany}, ${partnerEmail}, 'active', ${JSON.stringify({ bootstrap: true })})
          RETURNING id, email
        `;

    const passwordHash = await bcrypt.hash(partnerPassword, 10);
    const [existingUser] = await tx`
      SELECT id FROM partner_users WHERE email = ${partnerEmail} LIMIT 1
    `;

    if (existingUser) {
      await tx`
        UPDATE partner_users
        SET partner_id = ${partner.id},
            name = ${partnerName},
            password_hash = ${passwordHash},
            role = 'admin',
            permissions = ${JSON.stringify({})}::jsonb,
            is_active = true
        WHERE id = ${existingUser.id}
      `;
    } else {
      await tx`
        INSERT INTO partner_users (partner_id, name, email, password_hash, role, permissions, is_active)
        VALUES (${partner.id}, ${partnerName}, ${partnerEmail}, ${passwordHash}, 'admin', ${JSON.stringify({})}::jsonb, true)
      `;
    }

    return { partner, passwordHash };
  });

  console.log(`Partner access ready`);
  console.log(`Email: ${partnerEmail}`);
  console.log(`Password: ${partnerPassword}`);
  console.log(`Partner ID: ${partnerRow.partner.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }).catch(() => {}));
