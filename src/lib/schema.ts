import bcrypt from 'bcryptjs';
import { sql } from './pg';

const BOOTSTRAP_ADMIN = {
  name: 'Carlos Eduardo',
  email: 'carlos@guru.dev.br',
  password: 'Cadu$2014',
  role: 'duolife_admin',
} as const;

let ready = false;

export async function ensureSchema(): Promise<void> {
  if (ready) return;

  // Parceiros (corretoras)
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
  try {
    await sql`ALTER TABLE partners ADD CONSTRAINT partners_email_key UNIQUE (email)`;
  } catch {}

  // Usuários dos parceiros
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

  // API tokens para integração máquina-a-máquina (ex: Wix → DuoLife)
  await sql`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id   TEXT NOT NULL REFERENCES partners(id),
      name         TEXT NOT NULL,
      token_hash   TEXT UNIQUE NOT NULL,
      token_prefix TEXT NOT NULL,
      scopes       TEXT[] NOT NULL DEFAULT '{}',
      expires_at   TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      is_active    BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Refresh tokens de sessão
  await sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_user_id TEXT NOT NULL REFERENCES partner_users(id),
      token_hash      TEXT UNIQUE NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      revoked         BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Tokens para recuperação de senha ("Esqueci minha senha")
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id         TEXT NOT NULL,
      user_type       TEXT NOT NULL, -- 'partner' or 'admin'
      token_hash      TEXT UNIQUE NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      used            BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Produtos (seguros distribuídos pela DuoLife)
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name                 TEXT NOT NULL,
      code                 TEXT UNIQUE NOT NULL,
      category             TEXT NOT NULL,
      insurer_name         TEXT NOT NULL,
      insurer_cnpj         TEXT,
      description          TEXT,
      base_commission_rate NUMERIC(5,2),
      min_premium          NUMERIC(12,2),
      is_active            BOOLEAN NOT NULL DEFAULT true,
      metadata             JSONB NOT NULL DEFAULT '{}',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Réplica local dos dados do Wix para administração no DuoLife
  await sql`
    CREATE TABLE IF NOT EXISTS wix_collections (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      collection_id  TEXT UNIQUE NOT NULL,
      collection_name TEXT NOT NULL,
      source_system  TEXT NOT NULL DEFAULT 'wix',
      last_synced_at TIMESTAMPTZ,
      sync_cursor    TEXT,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      metadata       JSONB NOT NULL DEFAULT '{}',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS wix_items (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      wix_collection_id TEXT NOT NULL REFERENCES wix_collections(id),
      wix_item_id     TEXT NOT NULL,
      external_id     TEXT,
      document_number TEXT,
      name            TEXT,
      email           TEXT,
      phone           TEXT,
      status          TEXT,
      partner_code    TEXT,
      payload         JSONB NOT NULL DEFAULT '{}',
      payload_hash    TEXT,
      wix_created_at  TIMESTAMPTZ,
      wix_updated_at  TIMESTAMPTZ,
      synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (wix_collection_id, wix_item_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS wix_items_collection_id ON wix_items (wix_collection_id)`;
  await sql`CREATE INDEX IF NOT EXISTS wix_items_document_number ON wix_items (document_number)`;
  await sql`CREATE INDEX IF NOT EXISTS wix_items_external_id ON wix_items (external_id)`;
  await sql`CREATE INDEX IF NOT EXISTS wix_items_partner_code ON wix_items (partner_code)`;

  // Taxas de comissão por parceiro
  await sql`
    CREATE TABLE IF NOT EXISTS partner_commission_rates (
      partner_id  TEXT NOT NULL REFERENCES partners(id),
      product_id  TEXT NOT NULL REFERENCES products(id),
      rate        NUMERIC(5,2) NOT NULL,
      valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,
      valid_until DATE,
      PRIMARY KEY (partner_id, product_id, valid_from)
    )
  `;

  // Leads — mesma estrutura do Wix para interoperabilidade com NET4LIFE
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id       TEXT REFERENCES partners(id),
      external_id      TEXT,
      document_number  TEXT,
      nome             TEXT,
      email            TEXT,
      telefone         TEXT,
      origem           TEXT,
      status           TEXT NOT NULL DEFAULT 'novo',
      product_id       TEXT REFERENCES products(id),
      score            INTEGER,
      temperatura      TEXT,
      data_cadastro    TIMESTAMPTZ,
      data_atualizacao TIMESTAMPTZ,
      raw              JSONB NOT NULL DEFAULT '{}',
      synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_system    TEXT NOT NULL DEFAULT 'duolife'
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS leads_partner_id    ON leads (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_data_cadastro ON leads (data_cadastro DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_external_id   ON leads (external_id)`;
  
  // Garante a adição do document_number se a tabela já existir na base
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS document_number TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS leads_document_number ON leads (document_number)`;

  // Cotações geradas pelos corretores no portal
  await sql`
    CREATE TABLE IF NOT EXISTS cotacoes (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id           TEXT NOT NULL REFERENCES partners(id),
      partner_user_id      TEXT REFERENCES partner_users(id),
      product_id           TEXT NOT NULL REFERENCES products(id),
      lead_id              TEXT REFERENCES leads(id),
      client_name          TEXT NOT NULL,
      client_cpf_cnpj      TEXT NOT NULL,
      client_email         TEXT,
      client_phone         TEXT,
      client_data          JSONB NOT NULL DEFAULT '{}',
      importancia_segurada NUMERIC(12,2),
      premio_calculado     NUMERIC(12,2),
      premio_final         NUMERIC(12,2),
      status               TEXT NOT NULL DEFAULT 'rascunho',
      flow_type            TEXT NOT NULL DEFAULT 'internal',
      source_token         TEXT,
      external_ref         TEXT,
      valid_until          DATE,
      notes                TEXT,
      metadata             JSONB NOT NULL DEFAULT '{}',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE cotacoes ALTER COLUMN partner_user_id DROP NOT NULL`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'internal'`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS source_token TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_partner_id ON cotacoes (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_status     ON cotacoes (status)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_source_token ON cotacoes (source_token)`;

  // Vendas (apólices emitidas)
  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cotacao_id           TEXT NOT NULL REFERENCES cotacoes(id),
      partner_id           TEXT NOT NULL REFERENCES partners(id),
      product_id           TEXT NOT NULL REFERENCES products(id),
      policy_number        TEXT UNIQUE,
      importancia_segurada NUMERIC(12,2),
      premio_total         NUMERIC(12,2),
      commission_rate      NUMERIC(5,2),
      commission_amount    NUMERIC(12,2),
      status               TEXT NOT NULL DEFAULT 'ativa',
      issue_date           DATE NOT NULL,
      expiry_date          DATE NOT NULL,
      metadata             JSONB NOT NULL DEFAULT '{}',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sales_partner_id ON sales (partner_id)`;

  // Comissões a pagar
  await sql`
    CREATE TABLE IF NOT EXISTS commissions (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sale_id         TEXT NOT NULL REFERENCES sales(id),
      partner_id      TEXT NOT NULL REFERENCES partners(id),
      amount          NUMERIC(12,2) NOT NULL,
      rate            NUMERIC(5,2) NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pendente',
      reference_month TEXT,
      payment_date    DATE,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Log de sincronização com sistemas externos (Wix, CV CRM, Meta)
  await sql`
    CREATE TABLE IF NOT EXISTS sync_log (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT NOT NULL,
      source_system TEXT NOT NULL,
      direction     TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      status        TEXT NOT NULL,
      payload       JSONB NOT NULL DEFAULT '{}',
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sync_log_entity  ON sync_log (entity_type, entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sync_log_created ON sync_log (created_at DESC)`;

  // Links públicos white-label para contratação externa
  await sql`
    CREATE TABLE IF NOT EXISTS public_sale_links (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      token             TEXT UNIQUE NOT NULL,
      partner_id        TEXT NOT NULL REFERENCES partners(id),
      product_id        TEXT REFERENCES products(id),
      flow_type         TEXT NOT NULL DEFAULT 'external',
      label             TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      expires_at        TIMESTAMPTZ,
      used_at           TIMESTAMPTZ,
      metadata          JSONB NOT NULL DEFAULT '{}',
      created_by_user_id TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS public_sale_links_partner_id ON public_sale_links (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS public_sale_links_token      ON public_sale_links (token)`;

  // Usuários admin internos da DuoLife
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

  const [bootstrapAdmin] = await sql`
    SELECT id
    FROM admin_users
    WHERE email = ${BOOTSTRAP_ADMIN.email}
    LIMIT 1
  `;

  if (!bootstrapAdmin) {
    const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN.password, 10);
    await sql`
      INSERT INTO admin_users (name, email, password_hash, role, is_active)
      VALUES (${BOOTSTRAP_ADMIN.name}, ${BOOTSTRAP_ADMIN.email}, ${passwordHash}, ${BOOTSTRAP_ADMIN.role}, true)
    `;
  }

  ready = true;
}

export async function seedInitialData(): Promise<void> {
  // Produto: Seguro Responsabilidade Civil
  await sql`
    INSERT INTO products (id, name, code, category, insurer_name, description, base_commission_rate, is_active)
    VALUES (
      'prod-rc-001',
      'Seguro Responsabilidade Civil Profissional',
      'RC-001',
      'responsabilidade_civil',
      'A definir',
      'Proteção profissional contra reclamações de terceiros por erros, omissões ou negligências no exercício da profissão.',
      15.00,
      true
    )
    ON CONFLICT (code) DO NOTHING
  `;
}
