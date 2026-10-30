-- Migração 028: Segmentação de links públicos por vendedor vs corretora e suporte a exclusão
ALTER TABLE public_sale_links
  ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN IF NOT EXISTS seller_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_public_sale_links_seller_user_id ON public_sale_links (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_public_sale_links_link_type ON public_sale_links (link_type);
