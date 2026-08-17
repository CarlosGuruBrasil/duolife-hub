ALTER TABLE products ADD COLUMN IF NOT EXISTS public_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_days INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_recognition TEXT NOT NULL DEFAULT 'on_payment';
ALTER TABLE products ADD COLUMN IF NOT EXISTS renewal_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_underwriting BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS required_documents JSONB NOT NULL DEFAULT '[]';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_validity_days_check;
ALTER TABLE products ADD CONSTRAINT products_validity_days_check CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 3650);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sale_recognition_check;
ALTER TABLE products ADD CONSTRAINT products_sale_recognition_check CHECK (sale_recognition IN ('on_payment', 'on_full_payment', 'on_issuance'));
