-- Migration: 007-email-template-design-json.sql
-- Adiciona suporte ao armazenamento da estrutura em blocos do Editor Visual

ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS design_json JSONB DEFAULT NULL;
