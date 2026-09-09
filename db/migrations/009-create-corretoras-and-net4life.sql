-- Migração 009: Arquitetura Multi-Corretora & Cadastro da NET4Life (#1)
-- DuoLife (Super Admin / Hub) -> Corretoras (Empresas) -> Parceiros (Corretores/Canais)

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
);

CREATE INDEX IF NOT EXISTS idx_corretoras_cnpj ON corretoras(cnpj);
CREATE INDEX IF NOT EXISTS idx_corretoras_status ON corretoras(status);

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
);

CREATE INDEX IF NOT EXISTS idx_corretora_users_corretora_id ON corretora_users(corretora_id);

-- 1. Cadastro da Corretora NET4Life (#1) com dados oficiais
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
  updated_at    = NOW();

-- 2. Vinculação em partners e backfill para NET4Life
ALTER TABLE partners ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id);
CREATE INDEX IF NOT EXISTS idx_partners_corretora_id ON partners(corretora_id);
UPDATE partners SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;

-- 3. Vinculação em cotacoes e backfill para NET4Life
ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_corretora_id ON cotacoes(corretora_id);
UPDATE cotacoes SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;

-- 4. Vinculação em sales e backfill para NET4Life
ALTER TABLE sales ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id);
CREATE INDEX IF NOT EXISTS idx_sales_corretora_id ON sales(corretora_id);
UPDATE sales SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;

-- 5. Vinculação em commissions e backfill para NET4Life
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id);
CREATE INDEX IF NOT EXISTS idx_commissions_corretora_id ON commissions(corretora_id);
UPDATE commissions SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;

-- 6. Vinculação em leads e backfill para NET4Life
ALTER TABLE leads ADD COLUMN IF NOT EXISTS corretora_id TEXT REFERENCES corretoras(id);
CREATE INDEX IF NOT EXISTS idx_leads_corretora_id ON leads(corretora_id);
UPDATE leads SET corretora_id = 'corretora_net4life_001' WHERE corretora_id IS NULL;
