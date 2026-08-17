ALTER TABLE products ADD COLUMN IF NOT EXISTS integration_type TEXT NOT NULL DEFAULT 'full_journey';
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_link_url TEXT;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_integration_type_check;
ALTER TABLE products ADD CONSTRAINT products_integration_type_check CHECK (integration_type IN ('full_journey', 'external_link'));
