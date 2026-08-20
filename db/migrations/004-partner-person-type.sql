-- Corretor independente (pessoa física) passa a caber no mesmo cadastro de parceiro:
-- ele é uma operação de uma pessoa só, onde ele mesmo é o diretor. Sem tabela paralela,
-- o motor de visibilidade que já existe continua sendo o único.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS person_type TEXT NOT NULL DEFAULT 'pj';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS cpf TEXT;

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_person_type_check;
ALTER TABLE partners ADD CONSTRAINT partners_person_type_check CHECK (person_type IN ('pj', 'pf'));

CREATE UNIQUE INDEX IF NOT EXISTS partners_cpf_key ON partners (cpf) WHERE cpf IS NOT NULL;

-- Perfil de desenvolvedor separado do de administrador: ações destrutivas deixam de
-- pertencer a quem administra o negócio no dia a dia.
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('duolife_dev', 'duolife_admin', 'duolife_staff'));
