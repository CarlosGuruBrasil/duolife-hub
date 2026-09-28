-- Migração 018: Informações bancárias, chave PIX e upload de Contrato Social na tabela corretoras
-- Armazenamento estruturado de dados financeiros e documento societário obrigatório para novas corretoras.

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS banco TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS agencia TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS conta TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS pix_tipo_chave TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS pix_chave TEXT;

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS contrato_social_base64 TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS contrato_social_mime_type TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS contrato_social_nome_arquivo TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS contrato_social_uploaded_at TIMESTAMPTZ;
