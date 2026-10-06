-- Migração 020: Novos campos e uploads para cadastro de corretoras
-- Expansão com dados cadastrais de contato, sócio principal, sócios adicionais e novos documentos comprobatórios (Cartão CNPJ, Documento do Sócio, Comprovante Bancário).

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS telefone_cadastro TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_nome TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_cpf TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_rg TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_email TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_telefone TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socios_adicionais JSONB DEFAULT '[]';

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS cartao_cnpj_base64 TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS cartao_cnpj_mime_type TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS cartao_cnpj_nome_arquivo TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS cartao_cnpj_uploaded_at TIMESTAMPTZ;

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_documento_base64 TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_documento_mime_type TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_documento_nome_arquivo TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS socio_documento_uploaded_at TIMESTAMPTZ;

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS comprovante_bancario_base64 TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS comprovante_bancario_mime_type TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS comprovante_bancario_nome_arquivo TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS comprovante_bancario_uploaded_at TIMESTAMPTZ;
