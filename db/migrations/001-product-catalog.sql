ALTER TABLE products ALTER COLUMN insurer_name DROP NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'insurance';
ALTER TABLE products ADD COLUMN IF NOT EXISTS flow_key TEXT NOT NULL DEFAULT 'rc_professional_v1';
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_strategy TEXT NOT NULL DEFAULT 'rc_wix_planos_v1';
ALTER TABLE products ADD COLUMN IF NOT EXISTS policy_prefix TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_quoteable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_contractable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_payable BOOLEAN NOT NULL DEFAULT true;

UPDATE products
SET product_type = 'insurance',
    flow_key = 'rc_professional_v1',
    pricing_strategy = 'rc_wix_planos_v1',
    policy_prefix = 'DL-RC'
WHERE code = 'RC-001';

CREATE TABLE IF NOT EXISTS partner_product_availability (
  partner_id TEXT NOT NULL REFERENCES partners(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (partner_id, product_id)
);

CREATE INDEX IF NOT EXISTS partner_product_availability_product_id
  ON partner_product_availability (product_id);

INSERT INTO partner_product_availability (partner_id, product_id, is_active)
SELECT partner.id, product.id, true
FROM partners partner
CROSS JOIN products product
WHERE partner.status = 'active' AND product.is_active = true
ON CONFLICT (partner_id, product_id) DO NOTHING;
