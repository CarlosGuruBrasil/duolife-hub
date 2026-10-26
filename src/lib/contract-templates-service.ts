import { sql } from './pg';
import { logger } from './logger';

export interface CampoTabelaProponente {
  key: string;
  label: string;
  tipo: 'texto' | 'data' | 'cpf' | 'cnpj' | 'email' | 'telefone' | 'select' | 'numero';
  obrigatorio?: boolean;
  opcoes?: string[];
  valor_padrao?: string;
  largura?: string;
}

export interface CampoTabelaCondicoes {
  key: string;
  label: string;
  tipo: 'texto' | 'moeda' | 'data' | 'numero';
  valor_padrao?: string;
  largura?: string;
}

export interface ConfiguracoesTemplate {
  estipulante?: string;
  seguradora?: string;
  cnpj_estipulante?: string;
  cnpj_seguradora?: string;
  signatarios?: Array<{
    papel: string;
    descricao: string;
  }>;
  exibir_logo_seguradora?: boolean;
  exibir_logo_estipulante?: boolean;
  exibir_logo_corretora?: boolean;
  rodape_texto?: string;
  [key: string]: unknown;
}

export interface ContractTemplate {
  id: string;
  slug: string;
  ramo_id: string;
  nome: string;
  descricao: string | null;
  versao: number;
  ativo: boolean;
  titulo: string;
  subtitulo: string | null;
  declaracao_texto: string;
  tabela_proponente: CampoTabelaProponente[];
  tabela_condicoes: CampoTabelaCondicoes[];
  configuracoes: ConfiguracoesTemplate;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface CreateContractTemplateInput {
  slug: string;
  ramo_id: string;
  nome: string;
  descricao?: string | null;
  versao?: number;
  ativo?: boolean;
  titulo: string;
  subtitulo?: string | null;
  declaracao_texto: string;
  tabela_proponente?: CampoTabelaProponente[];
  tabela_condicoes?: CampoTabelaCondicoes[];
  configuracoes?: ConfiguracoesTemplate;
}

export interface UpdateContractTemplateInput {
  slug?: string;
  ramo_id?: string;
  nome?: string;
  descricao?: string | null;
  ativo?: boolean;
  titulo?: string;
  subtitulo?: string | null;
  declaracao_texto?: string;
  tabela_proponente?: CampoTabelaProponente[];
  tabela_condicoes?: CampoTabelaCondicoes[];
  configuracoes?: ConfiguracoesTemplate;
  incrementar_versao?: boolean;
}

/**
 * Templates padrão embutidos no código para fallback resiliente.
 */
export const DEFAULT_CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: 'tpl_rc_advogados_adesao',
    slug: 'rc_advogados_adesao',
    ramo_id: 'rc-advogados',
    nome: 'Termo de Adesão - RC Advogados',
    descricao: 'Modelo padrão de termo de adesão para Seguro de Responsabilidade Civil Profissional para Advogados',
    versao: 1,
    ativo: true,
    titulo: 'Seguro de Responsabilidade Civil para Advogado',
    subtitulo: 'Termo de Adesão por parte do Advogado',
    declaracao_texto:
      'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.',
    tabela_proponente: [
      { key: 'nome', label: 'Nome:', tipo: 'texto', obrigatorio: true },
      { key: 'dataNascto', label: 'Nascimento:', tipo: 'data', obrigatorio: true },
      { key: 'cpf', label: 'CPF:', tipo: 'cpf', obrigatorio: true },
      { key: 'email', label: 'E-mail:', tipo: 'email', obrigatorio: true },
      { key: 'celular', label: 'Celular:', tipo: 'telefone', obrigatorio: true },
      { key: 'enderecoCompleto', label: 'Endereço:', tipo: 'texto', obrigatorio: true },
      { key: 'inicioProfissional', label: 'Início profissional:', tipo: 'data', obrigatorio: true },
      { key: 'oab', label: 'OAB:', tipo: 'texto', obrigatorio: true },
    ],
    tabela_condicoes: [
      { key: 'importanciaSegurada', label: 'Importância Segurada:', tipo: 'moeda' },
      { key: 'formaPagamento', label: 'Forma de Pagamento:', tipo: 'texto' },
      { key: 'valorPremio', label: 'Valor do Prêmio a Pagar:', tipo: 'moeda' },
      { key: 'estipulante', label: 'Estipulante:', tipo: 'texto', valor_padrao: 'DUOLIFE PLATAFORMA DE NEGÓCIOS' },
      { key: 'vigencia', label: 'Vigência do Seguro:', tipo: 'texto' },
      { key: 'seguradora', label: 'Seguradora:', tipo: 'texto', valor_padrao: 'AKAD Seguros S.A.' },
      { key: 'corretora', label: 'Corretora:', tipo: 'texto' },
      { key: 'franquia', label: 'Franquia:', tipo: 'texto' },
    ],
    configuracoes: {
      estipulante: 'DUOLIFE PLATAFORMA DE NEGOCIOS LTDA',
      seguradora: 'AKAD Seguros S.A.',
      signatarios: [
        { papel: 'proponente', descricao: 'Proponente / Segurado' },
        { papel: 'estipulante', descricao: 'Estipulante (DuoLife)' },
      ],
      exibir_logo_seguradora: true,
      exibir_logo_estipulante: true,
      exibir_logo_corretora: true,
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl_rc_medicos_adesao',
    slug: 'rc_medicos_adesao',
    ramo_id: 'rc-medicos',
    nome: 'Termo de Adesão - RC Médicos e Saúde',
    descricao: 'Modelo padrão de termo de adesão para Seguro de Responsabilidade Civil Profissional para Médicos e Profissionais da Saúde',
    versao: 1,
    ativo: true,
    titulo: 'Seguro de Responsabilidade Civil para Profissionais de Saúde',
    subtitulo: 'Termo de Adesão por parte do Profissional de Saúde',
    declaracao_texto:
      'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.',
    tabela_proponente: [
      { key: 'nome', label: 'Nome:', tipo: 'texto', obrigatorio: true },
      { key: 'dataNascto', label: 'Nascimento:', tipo: 'data', obrigatorio: true },
      { key: 'cpf', label: 'CPF:', tipo: 'cpf', obrigatorio: true },
      { key: 'email', label: 'E-mail:', tipo: 'email', obrigatorio: true },
      { key: 'celular', label: 'Celular:', tipo: 'telefone', obrigatorio: true },
      { key: 'enderecoCompleto', label: 'Endereço:', tipo: 'texto', obrigatorio: true },
      { key: 'inicioProfissional', label: 'Início profissional:', tipo: 'data', obrigatorio: true },
      { key: 'registroProfissional', label: 'CRM / CRO / Registro:', tipo: 'texto', obrigatorio: true },
    ],
    tabela_condicoes: [
      { key: 'importanciaSegurada', label: 'Importância Segurada:', tipo: 'moeda' },
      { key: 'formaPagamento', label: 'Forma de Pagamento:', tipo: 'texto' },
      { key: 'valorPremio', label: 'Valor do Prêmio a Pagar:', tipo: 'moeda' },
      { key: 'estipulante', label: 'Estipulante:', tipo: 'texto', valor_padrao: 'DUOLIFE PLATAFORMA DE NEGÓCIOS' },
      { key: 'vigencia', label: 'Vigência do Seguro:', tipo: 'texto' },
      { key: 'seguradora', label: 'Seguradora:', tipo: 'texto', valor_padrao: 'Kovr Seguradora S.A.' },
      { key: 'corretora', label: 'Corretora:', tipo: 'texto' },
      { key: 'franquia', label: 'Franquia:', tipo: 'texto' },
    ],
    configuracoes: {
      estipulante: 'DUOLIFE PLATAFORMA DE NEGOCIOS LTDA',
      seguradora: 'Kovr Seguradora S.A.',
      signatarios: [
        { papel: 'proponente', descricao: 'Proponente / Segurado' },
        { papel: 'estipulante', descricao: 'Estipulante (DuoLife)' },
      ],
      exibir_logo_seguradora: true,
      exibir_logo_estipulante: true,
      exibir_logo_corretora: true,
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Garante que os templates padrão existam no banco de dados.
 */
export async function ensureDefaultContractTemplates(): Promise<void> {
  try {
    for (const tpl of DEFAULT_CONTRACT_TEMPLATES) {
      await sql`
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
          ${tpl.slug},
          ${tpl.ramo_id},
          ${tpl.nome},
          ${tpl.descricao},
          ${tpl.versao},
          ${tpl.ativo},
          ${tpl.titulo},
          ${tpl.subtitulo},
          ${tpl.declaracao_texto},
          ${sql.json(tpl.tabela_proponente as any)},
          ${sql.json(tpl.tabela_condicoes as any)},
          ${sql.json(tpl.configuracoes as any)}
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    }
  } catch (error) {
    logger.warn({ error }, 'contract_templates.ensureDefaultContractTemplates.skipped_or_failed');
  }
}

/**
 * Busca template por slug com fallback seguro para os templates padrão.
 */
export async function getContractTemplateBySlug(slug: string): Promise<ContractTemplate | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    const [row] = await sql<ContractTemplate[]>`
      SELECT
        id,
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
        configuracoes,
        created_at,
        updated_at
      FROM contract_templates
      WHERE slug = ${normalizedSlug}
      LIMIT 1
    `;

    if (row) {
      return row;
    }
  } catch (err) {
    logger.warn({ err, slug }, 'contract_templates.getContractTemplateBySlug.db_failed_using_fallback');
  }

  // Fallback seguro nos templates predefinidos
  const fallback = DEFAULT_CONTRACT_TEMPLATES.find((t) => t.slug === normalizedSlug);
  return fallback || null;
}

/**
 * Busca template por id ou slug com fallback seguro.
 */
export async function getContractTemplateByIdOrSlug(idOrSlug: string): Promise<ContractTemplate | null> {
  const search = idOrSlug.trim();
  const searchLower = search.toLowerCase();

  try {
    const [row] = await sql<ContractTemplate[]>`
      SELECT
        id,
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
        configuracoes,
        created_at,
        updated_at
      FROM contract_templates
      WHERE id = ${search} OR slug = ${searchLower}
      LIMIT 1
    `;

    if (row) {
      return row;
    }
  } catch (err) {
    logger.warn({ err, idOrSlug }, 'contract_templates.getContractTemplateByIdOrSlug.db_failed_using_fallback');
  }

  const fallback = DEFAULT_CONTRACT_TEMPLATES.find((t) => t.id === search || t.slug === searchLower);
  return fallback || null;
}

/**
 * Lista todos os templates de contrato com filtros opcionais.
 */
export async function listContractTemplates(options?: {
  ramoId?: string;
  ativo?: boolean;
}): Promise<ContractTemplate[]> {
  try {
    await ensureDefaultContractTemplates();

    let rows: ContractTemplate[];
    if (options?.ramoId && options.ativo !== undefined) {
      rows = await sql<ContractTemplate[]>`
        SELECT *
        FROM contract_templates
        WHERE ramo_id = ${options.ramoId} AND ativo = ${options.ativo}
        ORDER BY nome ASC
      `;
    } else if (options?.ramoId) {
      rows = await sql<ContractTemplate[]>`
        SELECT *
        FROM contract_templates
        WHERE ramo_id = ${options.ramoId}
        ORDER BY nome ASC
      `;
    } else if (options?.ativo !== undefined) {
      rows = await sql<ContractTemplate[]>`
        SELECT *
        FROM contract_templates
        WHERE ativo = ${options.ativo}
        ORDER BY nome ASC
      `;
    } else {
      rows = await sql<ContractTemplate[]>`
        SELECT *
        FROM contract_templates
        ORDER BY nome ASC
      `;
    }

    if (rows && rows.length > 0) {
      return rows;
    }
  } catch (err) {
    logger.warn({ err }, 'contract_templates.listContractTemplates.db_failed_using_defaults');
  }

  // Fallback para os templates padrão
  let filtered = [...DEFAULT_CONTRACT_TEMPLATES];
  if (options?.ramoId) {
    filtered = filtered.filter((t) => t.ramo_id === options.ramoId);
  }
  if (options?.ativo !== undefined) {
    filtered = filtered.filter((t) => t.ativo === options.ativo);
  }
  return filtered;
}

/**
 * Cria um novo template de contrato.
 */
export async function createContractTemplate(input: CreateContractTemplateInput): Promise<ContractTemplate> {
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const nome = input.nome.trim();
  const titulo = input.titulo.trim();
  const declaracao = input.declaracao_texto.trim();
  const subtitulo = input.subtitulo ? input.subtitulo.trim() : null;
  const descricao = input.descricao ? input.descricao.trim() : null;
  const versao = input.versao && input.versao > 0 ? input.versao : 1;
  const ativo = input.ativo !== undefined ? Boolean(input.ativo) : true;
  const tabelaProponente = input.tabela_proponente || [];
  const tabelaCondicoes = input.tabela_condicoes || [];
  const configuracoes = input.configuracoes || {};

  const [created] = await sql<ContractTemplate[]>`
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
      configuracoes,
      created_at,
      updated_at
    ) VALUES (
      ${slug},
      ${input.ramo_id.trim()},
      ${nome},
      ${descricao},
      ${versao},
      ${ativo},
      ${titulo},
      ${subtitulo},
      ${declaracao},
      ${sql.json(tabelaProponente as any)},
      ${sql.json(tabelaCondicoes as any)},
      ${sql.json(configuracoes as any)},
      NOW(),
      NOW()
    )
    RETURNING *
  `;

  return created;
}

/**
 * Atualiza um template de contrato por ID ou Slug, incrementando a versão se solicitado.
 */
export async function updateContractTemplate(
  idOrSlug: string,
  input: UpdateContractTemplateInput
): Promise<ContractTemplate> {
  const existing = await getContractTemplateByIdOrSlug(idOrSlug);
  if (!existing) {
    throw new Error(`Template de contrato "${idOrSlug}" não encontrado.`);
  }

  const newSlug = input.slug !== undefined
    ? input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    : existing.slug;
  const newRamoId = input.ramo_id !== undefined ? input.ramo_id.trim() : existing.ramo_id;
  const newNome = input.nome !== undefined ? input.nome.trim() : existing.nome;
  const newDescricao = input.descricao !== undefined ? (input.descricao ? input.descricao.trim() : null) : existing.descricao;
  const newAtivo = input.ativo !== undefined ? Boolean(input.ativo) : existing.ativo;
  const newTitulo = input.titulo !== undefined ? input.titulo.trim() : existing.titulo;
  const newSubtitulo = input.subtitulo !== undefined ? (input.subtitulo ? input.subtitulo.trim() : null) : existing.subtitulo;
  const newDeclaracao = input.declaracao_texto !== undefined ? input.declaracao_texto.trim() : existing.declaracao_texto;
  const newTabelaProponente = input.tabela_proponente !== undefined ? input.tabela_proponente : existing.tabela_proponente;
  const newTabelaCondicoes = input.tabela_condicoes !== undefined ? input.tabela_condicoes : existing.tabela_condicoes;
  const newConfiguracoes = input.configuracoes !== undefined ? input.configuracoes : existing.configuracoes;

  // Por padrão incrementa a versão em qualquer atualização substancial de conteúdo
  const shouldIncrementVersion = input.incrementar_versao ?? true;
  const novaVersao = shouldIncrementVersion ? (existing.versao || 1) + 1 : existing.versao;

  const [updated] = await sql<ContractTemplate[]>`
    UPDATE contract_templates
    SET
      slug = ${newSlug},
      ramo_id = ${newRamoId},
      nome = ${newNome},
      descricao = ${newDescricao},
      versao = ${novaVersao},
      ativo = ${newAtivo},
      titulo = ${newTitulo},
      subtitulo = ${newSubtitulo},
      declaracao_texto = ${newDeclaracao},
      tabela_proponente = ${sql.json(newTabelaProponente as any)},
      tabela_condicoes = ${sql.json(newTabelaCondicoes as any)},
      configuracoes = ${sql.json(newConfiguracoes as any)},
      updated_at = NOW()
    WHERE id = ${existing.id}
    RETURNING *
  `;

  if (!updated) {
    // Se o banco estava vazio e estávamos trabalhando em cima de fallback, cria o registro
    return await createContractTemplate({
      slug: newSlug,
      ramo_id: newRamoId,
      nome: newNome,
      descricao: newDescricao,
      versao: novaVersao,
      ativo: newAtivo,
      titulo: newTitulo,
      subtitulo: newSubtitulo,
      declaracao_texto: newDeclaracao,
      tabela_proponente: newTabelaProponente,
      tabela_condicoes: newTabelaCondicoes,
      configuracoes: newConfiguracoes,
    });
  }

  return updated;
}
