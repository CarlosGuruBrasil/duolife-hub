-- ============================================================================
-- Migração 024: Consolidação Estrita do Catálogo em 2 Produtos Oficiais
-- 1. RC Profissional — Advogados & Escritórios (id: prod-rc-001, code: RC-ADV-001)
-- 2. RC Profissional — Médicos & Profissionais da Saúde (id: prod-rc-med-001, code: RC-MED-001)
-- ============================================================================

-- 1. Caso exista algum produto de RC Médicos com ID diferente de 'prod-rc-med-001',
-- renomeia temporariamente seu código para liberar 'RC-MED-001' e migrar referências.
UPDATE products
SET code = 'RC-MED-LEGACY-' || SUBSTRING(id FROM 1 FOR 8)
WHERE (code = 'RC-MED-001' OR flow_key IN ('rc-medicos', 'rc_medicos_v1'))
  AND id != 'prod-rc-med-001';

-- 2. Garante a existência do produto canônico RC Médicos ('prod-rc-med-001')
-- preservando configurações customizadas existentes (seguradora, comissão, categoria).
INSERT INTO products (
  id, name, code, category, product_type, integration_type,
  insurer_name, insurer_cnpj, description, public_title, target_audience,
  base_commission_rate, min_premium, flow_key, pricing_strategy, policy_prefix,
  is_active, is_quoteable, is_contractable, is_payable,
  validity_days, sale_recognition, renewal_enabled, requires_underwriting
)
VALUES (
  'prod-rc-med-001',
  'RC Profissional — Médicos & Profissionais da Saúde',
  'RC-MED-001',
  COALESCE((SELECT category FROM products WHERE code LIKE 'RC-MED-LEGACY-%' LIMIT 1), 'Responsabilidade Civil Profissional'),
  'insurance',
  'full_journey',
  COALESCE((SELECT insurer_name FROM products WHERE code LIKE 'RC-MED-LEGACY-%' LIMIT 1), 'KEV Seguros'),
  (SELECT insurer_cnpj FROM products WHERE code LIKE 'RC-MED-LEGACY-%' LIMIT 1),
  'Proteção completa contra reclamações de erro médico, procedimentos cirúrgicos, custos de defesa em conselhos de classe (CRM) e indenizações de terceiros.',
  'Seguro RC Profissional Médicos',
  'Médicos de todas as especialidades, cirurgiões, residentes e clínicas médicas',
  COALESCE((SELECT base_commission_rate FROM products WHERE code LIKE 'RC-MED-LEGACY-%' LIMIT 1), 10.00),
  (SELECT min_premium FROM products WHERE code LIKE 'RC-MED-LEGACY-%' LIMIT 1),
  'rc-medicos',
  'rc_medicos_planos_v1',
  'DL-RC-MED',
  true, true, true, true,
  365, 'on_payment', true, true
)
ON CONFLICT (id) DO UPDATE SET
  code = 'RC-MED-001',
  name = 'RC Profissional — Médicos & Profissionais da Saúde',
  flow_key = 'rc-medicos',
  pricing_strategy = 'rc_medicos_planos_v1',
  policy_prefix = 'DL-RC-MED',
  integration_type = 'full_journey',
  is_quoteable = true;

-- 3. Migra referências de eventuais registros legados de RC Médicos para 'prod-rc-med-001'
UPDATE cotacoes SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
UPDATE sales SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
UPDATE leads SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
UPDATE public_sale_links SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
UPDATE payment_orders SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
UPDATE ai_sales_sessions SET product_id = 'prod-rc-med-001' WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');

INSERT INTO partner_commission_rates (partner_id, product_id, rate, valid_from, valid_until)
SELECT partner_id, 'prod-rc-med-001', rate, valid_from, valid_until
FROM partner_commission_rates
WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%')
ON CONFLICT (partner_id, product_id, valid_from) DO NOTHING;

DELETE FROM partner_commission_rates WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');

INSERT INTO partner_product_availability (partner_id, product_id, is_active)
SELECT partner_id, 'prod-rc-med-001', is_active
FROM partner_product_availability
WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%')
ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = partner_product_availability.is_active OR EXCLUDED.is_active;

DELETE FROM partner_product_availability WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'RC-MED-LEGACY-%');
DELETE FROM products WHERE code LIKE 'RC-MED-LEGACY-%';

-- 4. Libera os códigos 'RC-ADV-001' e 'RC-001' caso estejam em linhas com id != 'prod-rc-001'
UPDATE products
SET code = 'RC-ADV-LEGACY-' || SUBSTRING(id FROM 1 FOR 8)
WHERE code IN ('RC-ADV-001', 'RC-001')
  AND id != 'prod-rc-001';

-- 5. Garante a existência e consolidação do produto canônico RC Advogados ('prod-rc-001' / 'RC-ADV-001')
INSERT INTO products (
  id, name, code, category, product_type, integration_type,
  insurer_name, insurer_cnpj, description, public_title, target_audience,
  base_commission_rate, min_premium, flow_key, pricing_strategy, policy_prefix,
  is_active, is_quoteable, is_contractable, is_payable,
  validity_days, sale_recognition, renewal_enabled, requires_underwriting, required_documents
)
VALUES (
  'prod-rc-001',
  'RC Profissional — Advogados & Escritórios',
  'RC-ADV-001',
  'Responsabilidade Civil',
  'insurance',
  'full_journey',
  'KEV Seguros',
  '14.862.008/0001-23',
  'Seguro de Responsabilidade Civil Profissional para Advogados. Proteção contra falhas de prazos judiciais, erros em peças processuais e custos de defesa na OAB. Coberturas de R$ 100k até R$ 3 Milhões.',
  'Seguro RC Profissional Advogados',
  'Advogados autônomos e escritórios de advocacia',
  15.00,
  516.67,
  'rc-advogados',
  'rc_wix_planos_v1',
  'DL-RC-ADV',
  true, true, true, true,
  365, 'on_payment', true, false,
  '["Comprovante de Inscrição na OAB", "Documento de Identidade com CPF"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  category = EXCLUDED.category,
  product_type = 'insurance',
  integration_type = 'full_journey',
  insurer_name = EXCLUDED.insurer_name,
  insurer_cnpj = EXCLUDED.insurer_cnpj,
  description = EXCLUDED.description,
  public_title = EXCLUDED.public_title,
  target_audience = EXCLUDED.target_audience,
  base_commission_rate = COALESCE(products.base_commission_rate, EXCLUDED.base_commission_rate),
  min_premium = EXCLUDED.min_premium,
  flow_key = 'rc-advogados',
  pricing_strategy = 'rc_wix_planos_v1',
  policy_prefix = 'DL-RC-ADV',
  is_active = true,
  is_quoteable = true,
  is_contractable = true,
  is_payable = true;

-- 6. Migra todas as referências de produtos duplicados/descontinuados (RC-001 duplicado, Odonto, Engenheiros, Contadores, etc.) para 'prod-rc-001'
UPDATE cotacoes SET product_id = 'prod-rc-001' WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');
UPDATE sales SET product_id = 'prod-rc-001' WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');
UPDATE leads SET product_id = 'prod-rc-001' WHERE product_id IS NOT NULL AND product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');
UPDATE public_sale_links SET product_id = 'prod-rc-001' WHERE product_id IS NOT NULL AND product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');
UPDATE payment_orders SET product_id = 'prod-rc-001' WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');
UPDATE ai_sales_sessions SET product_id = 'prod-rc-001' WHERE product_id IS NOT NULL AND product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');

INSERT INTO partner_commission_rates (partner_id, product_id, rate, valid_from, valid_until)
SELECT partner_id, 'prod-rc-001', rate, valid_from, valid_until
FROM partner_commission_rates
WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001')
ON CONFLICT (partner_id, product_id, valid_from) DO NOTHING;

DELETE FROM partner_commission_rates WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');

INSERT INTO partner_product_availability (partner_id, product_id, is_active)
SELECT partner_id, 'prod-rc-001', is_active
FROM partner_product_availability
WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001')
ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = partner_product_availability.is_active OR EXCLUDED.is_active;

DELETE FROM partner_product_availability WHERE product_id NOT IN ('prod-rc-001', 'prod-rc-med-001');

-- 7. Remove definitivamente todos os produtos que não sejam os 2 oficiais
DELETE FROM products WHERE id NOT IN ('prod-rc-001', 'prod-rc-med-001');

-- 8. Garante habilitação de parceiros ativos nos 2 produtos oficiais
INSERT INTO partner_product_availability (partner_id, product_id, is_active)
SELECT pa.id, pr.id, true
FROM partners pa
CROSS JOIN products pr
WHERE pa.status = 'active' AND pr.id IN ('prod-rc-001', 'prod-rc-med-001')
ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true;
