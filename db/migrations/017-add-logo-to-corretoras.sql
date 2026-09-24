-- Migração 017: Campo de logotipo (logo_base64) na tabela corretoras
-- Permite armazenar diretamente no banco de dados a imagem do logo da corretora (até 2MB)
-- para uso dinâmico nos contratos e white-label.

ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS logo_mime_type TEXT;

-- Atualiza a NET4Life (#1) com o logo oficial padrão se ainda não tiver
UPDATE corretoras
SET 
  logo_mime_type = 'image/png',
  updated_at = NOW()
WHERE id = 'corretora_net4life_001' AND logo_base64 IS NULL;
