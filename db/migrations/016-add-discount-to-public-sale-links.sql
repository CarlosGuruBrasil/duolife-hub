-- Migração 016: Adiciona coluna discount_percent na tabela public_sale_links
-- Permite que o vendedor configure previamente um desconto comercial (0% a 40%)
-- que será aplicado automaticamente a todos os clientes que realizarem autocadastro por aquele link.

ALTER TABLE public_sale_links
ADD COLUMN IF NOT EXISTS discount_percent INT NOT NULL DEFAULT 0;

-- Garante que o desconto respeite a trava inegociável de segurança comercial (0% a 40%)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_public_sale_links_discount'
  ) THEN
    ALTER TABLE public_sale_links
    ADD CONSTRAINT chk_public_sale_links_discount
    CHECK (discount_percent >= 0 AND discount_percent <= 40);
  END IF;
END $$;
