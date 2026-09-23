import bcrypt from 'bcryptjs';
import { sql } from './pg';
import { getBootstrapAdminConfig } from './secrets';

let ready = false;
let readyPromise: Promise<void> | null = null;

const REQUIRED_TABLES = [
  'admin_users',
  'corretoras',
  'corretora_users',
  'partners',
  'partner_users',
  'products',
  'leads',
  'wix_collections',
  'wix_items',
  'sync_log',
] as const;

function shouldRunRuntimeSchemaSetup(): boolean {
  return process.env.ALLOW_RUNTIME_SCHEMA === 'true' || process.env.NODE_ENV !== 'production';
}

export async function ensureSchema(): Promise<void> {
  if (ready) return;
  if (!readyPromise) {
    readyPromise = shouldRunRuntimeSchemaSetup()
      ? runRuntimeSchemaSetup()
      : verifyRequiredSchema();
  }

  try {
    await readyPromise;
    ready = true;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

async function verifyRequiredSchema(): Promise<void> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${REQUIRED_TABLES as unknown as string[]})
  `;

  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Schema da DuoLife incompleto em produção. Tabelas ausentes: ${missingTables.join(', ')}. ` +
      'Habilite ALLOW_RUNTIME_SCHEMA temporariamente ou execute a trilha controlada de migração.'
    );
  }
}

async function runRuntimeSchemaSetup(): Promise<void> {
  const bootstrapAdminConfig = getBootstrapAdminConfig();

  // Configurações do Sistema e Chaves de API
  await sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT,
      updated_by  TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Corretoras de seguros (empresas gerenciadas ou conectadas à DuoLife)
  await sql`
    CREATE TABLE IF NOT EXISTS corretoras (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      razao_social  TEXT NOT NULL,
      nome_fantasia TEXT NOT NULL,
      cnpj          TEXT UNIQUE,
      susep         TEXT,
      email         TEXT NOT NULL,
      phone         TEXT,
      address       JSONB NOT NULL DEFAULT '{}',
      status        TEXT NOT NULL DEFAULT 'active',
      metadata      JSONB NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_corretoras_cnpj ON corretoras(cnpj)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_corretoras_status ON corretoras(status)`;

  // Usuários que gerenciam a corretora
  await sql`
    CREATE TABLE IF NOT EXISTS corretora_users (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      corretora_id    TEXT NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'corretora_admin',
      permissions     JSONB NOT NULL DEFAULT '{}',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      last_login_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_corretora_users_corretora_id ON corretora_users(corretora_id)`;

  // Seed da Corretora NET4Life (#1)
  await sql`
    INSERT INTO corretoras (
      id,
      razao_social,
      nome_fantasia,
      cnpj,
      susep,
      email,
      phone,
      address,
      status,
      metadata
    )
    VALUES (
      'corretora_net4life_001',
      'Net4life Corretora de Seguros Ltda',
      'NET4Life Corretora de Seguros',
      '07351909000133',
      '202018702',
      'contato@net4life.com.br',
      '+55 11 91177-1319',
      '{"street": "Rod. José Carlos Daux, 8600 - Bloco 03 Sala 05", "neighborhood": "Santo Antônio de Lisboa", "city": "Florianópolis", "state": "SC", "phones": ["+55 (11) 91177-1319", "(48) 3028-0033"]}'::jsonb,
      'active',
      '{
        "whiteLabel": {
          "slug": "net4life",
          "companyName": "NET4Life Corretora de Seguros",
          "companySlogan": "Benefícios Corporativos & Seguros",
          "companyPhone": "+55 (11) 91177-1319",
          "companyEmail": "contato@net4life.com.br",
          "companyWebsite": "https://net4life.com.br",
          "logoUrl": "/images/corretoras/net4life-logo.svg",
          "primaryColor": "#004172",
          "secondaryColor": "#00a0af",
          "accentColor": "#00689b",
          "susep": "202018702",
          "social": {
            "linkedin": "https://www.linkedin.com/company/net4life/home/",
            "instagram": "https://www.instagram.com/net4lifecorretora/",
            "facebook": "https://www.facebook.com/net4lifecorretora"
          }
        }
      }'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      razao_social  = EXCLUDED.razao_social,
      nome_fantasia = EXCLUDED.nome_fantasia,
      cnpj          = EXCLUDED.cnpj,
      susep         = EXCLUDED.susep,
      email         = EXCLUDED.email,
      phone         = EXCLUDED.phone,
      address       = EXCLUDED.address,
      metadata      = EXCLUDED.metadata,
      updated_at    = NOW()
  `;

  // Seed do Usuário Administrador da Corretora NET4Life
  const net4lifeSenhaPadrao = await bcrypt.hash('net4life@2026', 10);
  await sql`
    INSERT INTO corretora_users (
      id,
      corretora_id,
      name,
      email,
      password_hash,
      role,
      permissions,
      is_active
    )
    VALUES (
      'user_corretora_net4life_001',
      'corretora_net4life_001',
      'Diretoria NET4Life',
      'contato@net4life.com.br',
      ${net4lifeSenhaPadrao},
      'corretora_admin',
      '{"admin": true, "manage_team": true, "view_all_sales": true}'::jsonb,
      true
    )
    ON CONFLICT (email) DO UPDATE SET
      corretora_id = EXCLUDED.corretora_id,
      role = EXCLUDED.role,
      is_active = true,
      updated_at = NOW()
  `;

  // Parceiros (corretores/canais vinculados a uma corretora)
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
  // Corretor independente é um parceiro pessoa física — mesma tabela, mesmo motor de escopo.
  await sql`ALTER TABLE partners ADD COLUMN IF NOT EXISTS person_type TEXT NOT NULL DEFAULT 'pj'`;
  await sql`ALTER TABLE partners ADD COLUMN IF NOT EXISTS cpf TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS partners_cpf_key ON partners (cpf) WHERE cpf IS NOT NULL`;

  // Vínculo do parceiro com sua corretora mãe (com fallback inicial para NET4Life)
  await sql`ALTER TABLE partners ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_partners_corretora_id ON partners(corretora_id)`;
  await sql`UPDATE partners SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL`;

  // Usuários dos parceiros
  await sql`
    CREATE TABLE IF NOT EXISTS partner_users (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id    TEXT NOT NULL REFERENCES partners(id),
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'broker',
      manager_user_id TEXT REFERENCES partner_users(id),
      permissions   JSONB NOT NULL DEFAULT '{}',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE partner_users ADD COLUMN IF NOT EXISTS manager_user_id TEXT REFERENCES partner_users(id)`;
  await sql`ALTER TABLE partner_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`CREATE INDEX IF NOT EXISTS partner_users_partner_id ON partner_users (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_users_manager_user_id ON partner_users (manager_user_id)`;
  await sql`UPDATE partner_users SET role = 'director' WHERE role = 'admin'`;
  await sql`UPDATE partner_users SET role = 'broker' WHERE role = 'seller'`;
  await sql`UPDATE partner_users SET role = 'partner' WHERE role = 'viewer'`;

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

  // Refresh tokens de sessão (compatível com parceiros e gestores de corretoras)
  await sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_user_id TEXT NOT NULL,
      token_hash      TEXT UNIQUE NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      revoked         BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_partner_user_id_fkey`;
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_partner_user_id ON refresh_tokens(partner_user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)`;

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
      product_type         TEXT NOT NULL DEFAULT 'insurance',
      flow_key             TEXT NOT NULL DEFAULT 'rc_professional_v1',
      pricing_strategy     TEXT NOT NULL DEFAULT 'rc_wix_planos_v1',
      policy_prefix        TEXT,
      is_quoteable         BOOLEAN NOT NULL DEFAULT true,
      is_contractable      BOOLEAN NOT NULL DEFAULT true,
      is_payable           BOOLEAN NOT NULL DEFAULT true,
      public_title         TEXT,
      target_audience      TEXT,
      validity_days        INTEGER,
      sale_recognition     TEXT NOT NULL DEFAULT 'on_payment',
      renewal_enabled      BOOLEAN NOT NULL DEFAULT true,
      requires_underwriting BOOLEAN NOT NULL DEFAULT false,
      required_documents   JSONB NOT NULL DEFAULT '[]',
      metadata             JSONB NOT NULL DEFAULT '{}',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE products ALTER COLUMN insurer_name DROP NOT NULL`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'insurance'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS flow_key TEXT NOT NULL DEFAULT 'rc_professional_v1'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_strategy TEXT NOT NULL DEFAULT 'rc_wix_planos_v1'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS policy_prefix TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_quoteable BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_contractable BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_payable BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS public_title TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS target_audience TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_days INTEGER`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_recognition TEXT NOT NULL DEFAULT 'on_payment'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS renewal_enabled BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_underwriting BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS required_documents JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS integration_type TEXT NOT NULL DEFAULT 'full_journey'`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS external_link_url TEXT`;
  await sql`UPDATE products SET product_type = 'insurance', flow_key = 'rc_professional_v1', pricing_strategy = 'rc_wix_planos_v1', policy_prefix = 'DL-RC', integration_type = 'full_journey' WHERE code LIKE 'RC-%'`;

  // Habilitação comercial é diferente de comissão: um parceiro só deve operar uma oferta
  // que a DuoLife disponibilizou explicitamente para ele.
  await sql`
    CREATE TABLE IF NOT EXISTS partner_product_availability (
      partner_id TEXT NOT NULL REFERENCES partners(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (partner_id, product_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partner_product_availability_product_id ON partner_product_availability (product_id)`;
  // Migração compatível: produtos ativos existentes seguem disponíveis aos parceiros ativos.
  await sql`
    INSERT INTO partner_product_availability (partner_id, product_id, is_active)
    SELECT pa.id, pr.id, true
    FROM partners pa
    CROSS JOIN products pr
    WHERE pa.status = 'active' AND pr.is_active = true
    ON CONFLICT (partner_id, product_id) DO NOTHING
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

  // status_cliente: campo mais granular/atual da NET4LIFE (Vigente/Em atraso/Cancelado/Em negociação),
  // mantido separado de "status" (que reflete statusGeral, mais genérico: Negócio Fechado/Pendente/Inativo)
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_cliente TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS leads_status_cliente ON leads (status_cliente)`;

  // Vinculação de leads à corretora
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_corretora_id ON leads (corretora_id)`;
  await sql`UPDATE leads SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL`;

  // Clientes finais segurados
  await sql`
    CREATE TABLE IF NOT EXISTS insurance_clients (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      document_number   TEXT NOT NULL,
      document_type     TEXT NOT NULL DEFAULT 'cpf',
      full_name         TEXT NOT NULL,
      email             TEXT,
      phone             TEXT,
      birth_date        DATE,
      metadata          JSONB NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (document_number)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS insurance_clients_email ON insurance_clients (email)`;

  // Cotações geradas pelos corretores no portal
  await sql`
    CREATE TABLE IF NOT EXISTS cotacoes (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      client_id            TEXT REFERENCES insurance_clients(id),
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
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES insurance_clients(id)`;
  await sql`ALTER TABLE cotacoes ALTER COLUMN partner_user_id DROP NOT NULL`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'internal'`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS source_token TEXT`;
  // Renovação como conceito de primeira classe — antes só existia como flag solta em client_data.renovacao
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS is_renewal BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS renewed_from_cotacao_id TEXT REFERENCES cotacoes(id)`;
  await sql`ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_partner_id ON cotacoes (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_status     ON cotacoes (status)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_source_token ON cotacoes (source_token)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_client_id ON cotacoes (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_is_renewal ON cotacoes (is_renewal)`;
  await sql`CREATE INDEX IF NOT EXISTS cotacoes_renewed_from ON cotacoes (renewed_from_cotacao_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cotacoes_corretora_id ON cotacoes (corretora_id)`;
  await sql`UPDATE cotacoes SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL`;
  // Vincula cotações sem partner_user_id ao usuário correspondente do parceiro
  await sql`
    UPDATE cotacoes c
    SET partner_user_id = pu.id
    FROM partner_users pu
    WHERE c.partner_id = pu.partner_id
      AND c.partner_user_id IS NULL
  `;

  // Vendas (apólices emitidas)
  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cotacao_id           TEXT NOT NULL REFERENCES cotacoes(id),
      client_id            TEXT REFERENCES insurance_clients(id),
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
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES insurance_clients(id)`;
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_partner_id ON sales (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_client_id ON sales (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_corretora_id ON sales (corretora_id)`;
  await sql`UPDATE sales SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL`;

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
  await sql`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_commissions_corretora_id ON commissions (corretora_id)`;
  await sql`UPDATE commissions SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL`;

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
      discount_percent  INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS discount_percent INT NOT NULL DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS public_sale_links_partner_id ON public_sale_links (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS public_sale_links_token      ON public_sale_links (token)`;

  // Documentos de assinatura eletrônica
  await sql`
    CREATE TABLE IF NOT EXISTS signature_documents (
      id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cotacao_id            TEXT NOT NULL REFERENCES cotacoes(id),
      client_id             TEXT REFERENCES insurance_clients(id),
      provider              TEXT NOT NULL DEFAULT 'zapsign',
      external_document_id  TEXT,
      template_id           TEXT,
      sign_url              TEXT,
      signed_file_url       TEXT,
      status                TEXT NOT NULL DEFAULT 'pending',
      signed_at             TIMESTAMPTZ,
      last_event_type       TEXT,
      raw_payload           JSONB NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, external_document_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS signature_documents_cotacao_id ON signature_documents (cotacao_id)`;
  await sql`CREATE INDEX IF NOT EXISTS signature_documents_client_id ON signature_documents (client_id)`;
  // Garante no máximo 1 contrato ativo por cotação a nível de banco, não só via checagem em aplicação
  // (clientData.contratoToken pode ser perdido/resetado sem essa garantia).
  await sql`
    DROP INDEX IF EXISTS signature_documents_unique_active_cotacao;
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS signature_documents_unique_active_cotacao
    ON signature_documents (cotacao_id)
    WHERE status NOT IN ('cancelled', 'refused', 'expired');
  `;

  // Controle de uso de cupom promocional — o Wix só guarda um contador estático (quantidadeUsada)
  // que nunca é incrementado pelo DuoLife; aqui mantemos o controle real e atômico do lado do DuoLife.
  await sql`
    CREATE TABLE IF NOT EXISTS cupom_usos (
      cupom_codigo TEXT PRIMARY KEY,
      usos         INTEGER NOT NULL DEFAULT 0,
      limite       INTEGER,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cupom_uso_eventos (
      id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cupom_codigo TEXT NOT NULL,
      cotacao_id   TEXT NOT NULL UNIQUE REFERENCES cotacoes(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Operações financeiras por cotação/produto
  await sql`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cotacao_id                TEXT NOT NULL REFERENCES cotacoes(id),
      client_id                 TEXT REFERENCES insurance_clients(id),
      partner_id                TEXT NOT NULL REFERENCES partners(id),
      product_id                TEXT NOT NULL REFERENCES products(id),
      provider                  TEXT NOT NULL DEFAULT 'asaas',
      provider_customer_id      TEXT,
      external_payment_id       TEXT,
      external_installment_id   TEXT,
      billing_type              TEXT,
      status                    TEXT NOT NULL DEFAULT 'pending',
      amount_total              NUMERIC(12,2),
      installment_count         INTEGER NOT NULL DEFAULT 1,
      paid_installments         INTEGER NOT NULL DEFAULT 0,
      paid_amount               NUMERIC(12,2) NOT NULL DEFAULT 0,
      due_date                  DATE,
      invoice_url               TEXT,
      bank_slip_url             TEXT,
      pix_qr_code_url           TEXT,
      description               TEXT,
      raw_payload               JSONB NOT NULL DEFAULT '{}',
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS payment_orders_cotacao_id ON payment_orders (cotacao_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_unique_cotacao ON payment_orders (cotacao_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_orders_client_id ON payment_orders (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_orders_external_payment_id ON payment_orders (external_payment_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_orders_external_installment_id ON payment_orders (external_installment_id)`;

  // Parcelas individuais da cobrança
  await sql`
    CREATE TABLE IF NOT EXISTS payment_installments (
      id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      payment_order_id        TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
      cotacao_id              TEXT NOT NULL REFERENCES cotacoes(id),
      client_id               TEXT REFERENCES insurance_clients(id),
      provider                TEXT NOT NULL DEFAULT 'asaas',
      external_payment_id     TEXT NOT NULL,
      external_installment_id TEXT,
      installment_number      INTEGER NOT NULL DEFAULT 1,
      status                  TEXT NOT NULL DEFAULT 'pending',
      billing_type            TEXT,
      amount                  NUMERIC(12,2),
      net_amount              NUMERIC(12,2),
      due_date                DATE,
      paid_at                 TIMESTAMPTZ,
      invoice_url             TEXT,
      bank_slip_url           TEXT,
      pix_qr_code_url         TEXT,
      raw_payload             JSONB NOT NULL DEFAULT '{}',
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, external_payment_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS payment_installments_order_id ON payment_installments (payment_order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_installments_cotacao_id ON payment_installments (cotacao_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_installments_client_id ON payment_installments (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payment_installments_external_installment_id ON payment_installments (external_installment_id)`;

  // Trilhas de webhook para auditoria e reprocessamento
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      provider        TEXT NOT NULL,
      event_type      TEXT,
      external_id     TEXT,
      signature_valid BOOLEAN,
      payload         JSONB NOT NULL DEFAULT '{}',
      processed       BOOLEAN NOT NULL DEFAULT false,
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS webhook_events_provider_created_at ON webhook_events (provider, created_at DESC)`;

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

  const [bootstrapAdminRow] = await sql`
    SELECT id
    FROM admin_users
    WHERE email = ${bootstrapAdminConfig.email}
    LIMIT 1
  `;

  if (!bootstrapAdminRow) {
    const passwordHash = await bcrypt.hash(bootstrapAdminConfig.password, 10);
    await sql`
      INSERT INTO admin_users (name, email, password_hash, role, is_active)
      VALUES (${bootstrapAdminConfig.name}, ${bootstrapAdminConfig.email}, ${passwordHash}, ${bootstrapAdminConfig.role}, true)
    `;
  }

  // Templates de E-mail
  await sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      code        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      subject     TEXT NOT NULL,
      body_html   TEXT NOT NULL,
      body_text   TEXT,
      variables   JSONB NOT NULL DEFAULT '[]'::jsonb,
      design_json JSONB DEFAULT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS design_json JSONB DEFAULT NULL`;
  await sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT NULL`;
  await sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates (code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_templates_external_id ON email_templates (external_id)`;

  // Logs de Disparo de E-mail
  await sql`
    CREATE TABLE IF NOT EXISTS email_dispatch_logs (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      template_code   TEXT,
      recipient_email TEXT NOT NULL,
      recipient_name  TEXT,
      subject         TEXT NOT NULL,
      body_html       TEXT,
      status          TEXT NOT NULL DEFAULT 'sent',
      provider        TEXT NOT NULL DEFAULT 'nodemailer_smtp',
      error_message   TEXT,
      metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE email_dispatch_logs ADD COLUMN IF NOT EXISTS body_html TEXT;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_template ON email_dispatch_logs (template_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_created ON email_dispatch_logs (created_at DESC)`;

  // Gatilhos e Árvores de Decisão
  await sql`
    CREATE TABLE IF NOT EXISTS automation_triggers (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      code            TEXT UNIQUE NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      event_type      TEXT NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      tree_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_automation_triggers_event ON automation_triggers (event_type)`;

  // Logs de Execução de Automações
  await sql`
    CREATE TABLE IF NOT EXISTS automation_trigger_logs (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      trigger_id       TEXT REFERENCES automation_triggers(id) ON DELETE SET NULL,
      event_type       TEXT NOT NULL,
      context_id       TEXT,
      context_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
      evaluated_nodes  JSONB NOT NULL DEFAULT '[]'::jsonb,
      actions_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
      status           TEXT NOT NULL DEFAULT 'success',
      error_message    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_automation_trigger_logs_event ON automation_trigger_logs (event_type, created_at DESC)`;

  // Notificações de Renovação de Apólices (D-60, D-30, D-15, D-0)
  await sql`
    CREATE TABLE IF NOT EXISTS policy_renewal_notifications (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sale_id         TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      cotacao_id      TEXT NOT NULL REFERENCES cotacoes(id),
      client_id       TEXT REFERENCES insurance_clients(id),
      partner_id      TEXT NOT NULL REFERENCES partners(id),
      partner_user_id TEXT REFERENCES partner_users(id),
      window_days     INTEGER NOT NULL,
      target_date     DATE NOT NULL,
      recipient_email TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'sent',
      email_log_id    TEXT REFERENCES email_dispatch_logs(id),
      metadata        JSONB NOT NULL DEFAULT '{}',
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (sale_id, window_days, target_date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_renewal_notif_sale_id ON policy_renewal_notifications (sale_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_renewal_notif_partner_id ON policy_renewal_notifications (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_renewal_notif_target_date ON policy_renewal_notifications (target_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_renewal_notif_sent_at ON policy_renewal_notifications (sent_at DESC)`;

  // Notificações de Inadimplência Asaas (A Vencer e Vencidas)
  await sql`
    CREATE TABLE IF NOT EXISTS delinquency_notifications (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      installment_id    TEXT NOT NULL REFERENCES payment_installments(id) ON DELETE CASCADE,
      payment_order_id  TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
      cotacao_id        TEXT NOT NULL REFERENCES cotacoes(id),
      client_id         TEXT REFERENCES insurance_clients(id),
      partner_id        TEXT NOT NULL REFERENCES partners(id),
      notification_type TEXT NOT NULL,
      trigger_day       INTEGER NOT NULL,
      due_date          DATE NOT NULL,
      recipient_email   TEXT NOT NULL,
      recipient_type    TEXT NOT NULL DEFAULT 'broker',
      status            TEXT NOT NULL DEFAULT 'sent',
      email_log_id      TEXT REFERENCES email_dispatch_logs(id),
      metadata          JSONB NOT NULL DEFAULT '{}',
      sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (installment_id, notification_type, trigger_day)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_delinquency_notif_installment_id ON delinquency_notifications (installment_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delinquency_notif_partner_id ON delinquency_notifications (partner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delinquency_notif_due_date ON delinquency_notifications (due_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delinquency_notif_sent_at ON delinquency_notifications (sent_at DESC)`;

  // Histórico e Logs de Execução do Cronjob de Lifecycle
  await sql`
    CREATE TABLE IF NOT EXISTS lifecycle_cron_logs (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      job_type             TEXT NOT NULL DEFAULT 'full',
      status               TEXT NOT NULL DEFAULT 'success',
      renewals_scanned     INTEGER NOT NULL DEFAULT 0,
      renewals_notified    INTEGER NOT NULL DEFAULT 0,
      renewals_skipped     INTEGER NOT NULL DEFAULT 0,
      delinquency_scanned  INTEGER NOT NULL DEFAULT 0,
      delinquency_notified INTEGER NOT NULL DEFAULT 0,
      delinquency_skipped  INTEGER NOT NULL DEFAULT 0,
      errors               JSONB NOT NULL DEFAULT '[]',
      duration_ms          INTEGER NOT NULL DEFAULT 0,
      triggered_by         TEXT NOT NULL DEFAULT 'cron',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_lifecycle_cron_logs_created_at ON lifecycle_cron_logs (created_at DESC)`;

  // Reparo idempotente de registros com valores financeiros inflados (* 100) legados
  try {
    await sql`
      UPDATE cotacoes
      SET importancia_segurada = 100000.00
      WHERE importancia_segurada = 10000000.00
        AND (
          client_data->>'tipo' ILIKE '%100k%'
          OR client_data->>'tipoDePlano' ILIKE '%100k%'
          OR client_data->>'nomePlano' ILIKE '%100k%'
          OR client_data->>'nomePlano' ILIKE '%100 mil%'
          OR client_data->>'planoNome' ILIKE '%100k%'
        )
    `;
    await sql`
      UPDATE cotacoes
      SET importancia_segurada = 200000.00
      WHERE importancia_segurada = 20000000.00
        AND (
          client_data->>'tipo' ILIKE '%200k%'
          OR client_data->>'tipoDePlano' ILIKE '%200k%'
          OR client_data->>'nomePlano' ILIKE '%200k%'
          OR client_data->>'nomePlano' ILIKE '%200 mil%'
        )
    `;
    await sql`
      UPDATE cotacoes
      SET importancia_segurada = 300000.00
      WHERE importancia_segurada = 30000000.00
        AND (
          client_data->>'tipo' ILIKE '%300k%'
          OR client_data->>'tipoDePlano' ILIKE '%300k%'
          OR client_data->>'nomePlano' ILIKE '%300k%'
          OR client_data->>'nomePlano' ILIKE '%300 mil%'
        )
    `;
    await sql`
      UPDATE cotacoes
      SET importancia_segurada = 500000.00
      WHERE importancia_segurada = 50000000.00
        AND (
          client_data->>'tipo' ILIKE '%500k%'
          OR client_data->>'tipoDePlano' ILIKE '%500k%'
          OR client_data->>'nomePlano' ILIKE '%500k%'
          OR client_data->>'nomePlano' ILIKE '%500 mil%'
        )
    `;
    await sql`
      UPDATE cotacoes
      SET premio_final = ROUND(premio_final / 100.0, 2)
      WHERE premio_final >= 10000.00
        AND premio_final <= 100000.00
        AND (
          client_data->>'tipo' ILIKE ANY (ARRAY['%100k%', '%200k%', '%300k%', '%500k%'])
          OR client_data->>'nomePlano' ILIKE ANY (ARRAY['%100k%', '%200k%', '%300k%', '%500k%', '%100 mil%', '%200 mil%', '%300 mil%', '%500 mil%'])
        )
    `;
  } catch {
    // Silencia se tabelas estiverem em criação
  }
}

export async function seedInitialData(): Promise<void> {
  // Produto: Seguro Responsabilidade Civil
  await sql`
    INSERT INTO products (id, name, code, category, insurer_name, description, base_commission_rate, is_active, product_type, flow_key, pricing_strategy, policy_prefix)
    VALUES (
      'prod-rc-001',
      'Seguro Responsabilidade Civil Profissional',
      'RC-001',
      'responsabilidade_civil',
      'A definir',
      'Proteção profissional contra reclamações de terceiros por erros, omissões ou negligências no exercício da profissão.',
      15.00,
      true,
      'insurance',
      'rc_professional_v1',
      'rc_wix_planos_v1',
      'DL-RC'
    )
    ON CONFLICT (code) DO NOTHING
  `;
}
