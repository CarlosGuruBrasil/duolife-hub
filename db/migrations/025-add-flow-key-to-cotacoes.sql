-- ============================================================================
-- Migração 025: Adiciona coluna flow_key na tabela cotacoes e garante integridade
-- ============================================================================

-- 1. Garante coluna flow_key na tabela products caso ainda não exista
ALTER TABLE products ADD COLUMN IF NOT EXISTS flow_key TEXT NOT NULL DEFAULT 'rc-advogados';

-- 2. Adiciona coluna flow_key na tabela cotacoes para suporte a consultas diretas
ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS flow_key TEXT;

-- 3. Preenche flow_key a partir do produto vinculado
UPDATE cotacoes c
SET flow_key = p.flow_key
FROM products p
WHERE c.product_id = p.id
  AND c.flow_key IS NULL;

-- 4. Preenche flow_key a partir de client_data caso produto não esteja vinculado
UPDATE cotacoes
SET flow_key = COALESCE(client_data->>'flowKey', 'rc-advogados')
WHERE flow_key IS NULL;

-- 5. Cria índice para buscas rápidas por flow_key
CREATE INDEX IF NOT EXISTS idx_cotacoes_flow_key ON cotacoes (flow_key);
