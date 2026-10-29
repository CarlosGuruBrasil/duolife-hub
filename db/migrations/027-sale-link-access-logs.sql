-- Migração 027: Adiciona colunas de métricas em public_sale_links e cria tabela de auditoria de acessos sale_link_access_logs

ALTER TABLE public_sale_links
ADD COLUMN IF NOT EXISTS views_count INT NOT NULL DEFAULT 0;

ALTER TABLE public_sale_links
ADD COLUMN IF NOT EXISTS unique_views_count INT NOT NULL DEFAULT 0;

ALTER TABLE public_sale_links
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sale_link_access_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  link_id    TEXT NOT NULL REFERENCES public_sale_links(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  ip_hash    TEXT NOT NULL,
  user_agent TEXT,
  referer    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_link_access_logs_link_id    ON sale_link_access_logs (link_id);
CREATE INDEX IF NOT EXISTS idx_sale_link_access_logs_token      ON sale_link_access_logs (token);
CREATE INDEX IF NOT EXISTS idx_sale_link_access_logs_partner_id ON sale_link_access_logs (partner_id);
CREATE INDEX IF NOT EXISTS idx_sale_link_access_logs_link_ip    ON sale_link_access_logs (link_id, ip_hash);
