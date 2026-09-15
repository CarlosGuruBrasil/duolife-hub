-- Migração 012: Atualização dos ativos de marca da NET4Life (Ícone e Logotipo Oficial)
-- Garante a resolução do logo em alta definição e ícone dedicado para listagens

UPDATE corretoras
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{whiteLabel,logoUrl}',
    '"/images/corretoras/net4life-logo.png"'
  ),
  '{whiteLabel,iconUrl}',
  '"/images/corretoras/net4life-icon.png"'
)
WHERE id = 'corretora_net4life_001';
