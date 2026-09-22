-- Migração 013: Permitir refresh tokens para usuários de corretoras
-- Remove a foreign key que restringia refresh_tokens exclusivamente a partner_users,
-- viabilizando login e renovação de sessão para gestores e administradores de corretoras.

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_partner_user_id_fkey;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_partner_user_id ON refresh_tokens(partner_user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
