-- Migration: 026-contract-templates.sql
-- Módulo de Gerenciamento de Templates de Contrato e Termos de Adesão

CREATE TABLE IF NOT EXISTS contract_templates (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug              TEXT UNIQUE NOT NULL,
  ramo_id           TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao         TEXT,
  versao            INT NOT NULL DEFAULT 1,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  titulo            TEXT NOT NULL,
  subtitulo         TEXT,
  declaracao_texto  TEXT NOT NULL,
  tabela_proponente JSONB NOT NULL DEFAULT '[]'::jsonb,
  tabela_condicoes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  configuracoes     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_templates_slug ON contract_templates (slug);
CREATE INDEX IF NOT EXISTS idx_contract_templates_ramo_id ON contract_templates (ramo_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_ativo ON contract_templates (ativo);

-- Seed inicial padrão: Termo de Adesão RC Advogados
INSERT INTO contract_templates (
  slug,
  ramo_id,
  nome,
  descricao,
  versao,
  ativo,
  titulo,
  subtitulo,
  declaracao_texto,
  tabela_proponente,
  tabela_condicoes,
  configuracoes
) VALUES (
  'rc_advogados_adesao',
  'rc-advogados',
  'Termo de Adesão - RC Advogados',
  'Modelo padrão de termo de adesão para Seguro de Responsabilidade Civil Profissional para Advogados',
  1,
  true,
  'Seguro de Responsabilidade Civil para Advogado',
  'Termo de Adesão por parte do Advogado',
  'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.',
  '[
    {"key": "nome", "label": "Nome:", "tipo": "texto", "obrigatorio": true},
    {"key": "dataNascto", "label": "Nascimento:", "tipo": "data", "obrigatorio": true},
    {"key": "cpf", "label": "CPF:", "tipo": "cpf", "obrigatorio": true},
    {"key": "email", "label": "E-mail:", "tipo": "email", "obrigatorio": true},
    {"key": "celular", "label": "Celular:", "tipo": "telefone", "obrigatorio": true},
    {"key": "enderecoCompleto", "label": "Endereço:", "tipo": "texto", "obrigatorio": true},
    {"key": "inicioProfissional", "label": "Início profissional:", "tipo": "data", "obrigatorio": true},
    {"key": "oab", "label": "OAB:", "tipo": "texto", "obrigatorio": true}
  ]'::jsonb,
  '[
    {"key": "importanciaSegurada", "label": "Importância Segurada:", "tipo": "moeda"},
    {"key": "formaPagamento", "label": "Forma de Pagamento:", "tipo": "texto"},
    {"key": "valorPremio", "label": "Valor do Prêmio a Pagar:", "tipo": "moeda"},
    {"key": "estipulante", "label": "Estipulante:", "tipo": "texto", "valor_padrao": "DUOLIFE PLATAFORMA DE NEGÓCIOS"},
    {"key": "vigencia", "label": "Vigência do Seguro:", "tipo": "texto"},
    {"key": "seguradora", "label": "Seguradora:", "tipo": "texto", "valor_padrao": "AKAD Seguros S.A."},
    {"key": "corretora", "label": "Corretora:", "tipo": "texto"},
    {"key": "franquia", "label": "Franquia:", "tipo": "texto"}
  ]'::jsonb,
  '{
    "estipulante": "DUOLIFE PLATAFORMA DE NEGOCIOS LTDA",
    "seguradora": "AKAD Seguros S.A.",
    "signatarios": [
      {"papel": "proponente", "descricao": "Proponente / Segurado"},
      {"papel": "estipulante", "descricao": "Estipulante (DuoLife)"}
    ],
    "exibir_logo_seguradora": true,
    "exibir_logo_estipulante": true,
    "exibir_logo_corretora": true
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  subtitulo = EXCLUDED.subtitulo,
  declaracao_texto = EXCLUDED.declaracao_texto;
