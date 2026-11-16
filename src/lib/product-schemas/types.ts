/**
 * Tipagens estritas do ecossistema de esquemas declarativos multi-ramo da DuoLife.
 * 
 * Centraliza as definições de campos, opções, questionários de underwriting,
 * catálogos de planos e estados de formulários multi-ramo (RC Advogados, Médicos,
 * Dentistas, Engenheiros, Contadores e Seguro D&O Executivos).
 */

export type FieldType =
  | 'text'
  | 'cpf_cnpj'
  | 'phone'
  | 'email'
  | 'date'
  | 'currency'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'boolean';

export interface FieldOption {
  key: string;
  label: string;
  description?: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: FieldOption[];
  dependsOn?: {
    field: string;
    value: any;
  };
}

export interface RiskQuestion {
  id: string;
  question: string;
  detailKey: string;
  detailLabel?: string;
  requiredOnAffirmative?: boolean;
}

export interface PlanoDefinition {
  tipoDePlano: string;
  nomeExibido: string;
  cobertura: string;
  franquia: string;
  ordem: number;
  parcela: string;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
  valorPagoKovr?: number;
  maxParcelas?: number;
}

export interface RegistroProfissionalConfig {
  key: string;
  label: string;
  placeholder: string;
  ufKey?: string;
  required?: boolean;
  hasRqe?: boolean;
}

export interface AssociacaoProfissionalConfig {
  enabled?: boolean;
  label?: string;
  sublabel?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputHelpText?: string;
  errorMessage?: string;
}

export interface GrupoTarifarioOption {
  id: string; // 'G1', 'G2', ..., 'G8'
  codigo: string;
  label: string;
  description?: string;
  registroKey?: string;
  registroLabel?: string;
  registroPlaceholder?: string;
  isCirurgico?: boolean;
}

export interface RamoConfig {
  ramoId: string;
  name: string;
  shortName: string;
  category: string;
  flowKeys: string[];
  pricingStrategy: string;
  policyPrefix: string;
  targetAudience: string;
  registroProfissional?: RegistroProfissionalConfig;
  associacaoProfissional?: AssociacaoProfissionalConfig;
  gruposTarifariosLabel?: string;
  gruposTarifarios?: GrupoTarifarioOption[];
  planosPorGrupo?: Record<string, PlanoDefinition[]>;
  especialidadesLabel?: string;
  especialidades?: FieldOption[];
  faturamentoLabel?: string;
  hasFaturamento?: boolean;
  hasPpe?: boolean;
  requiresUnderwriting?: boolean;
  questionarioRisco: RiskQuestion[];
  planos: PlanoDefinition[];
  templateZapSignKey?: string;
  additionalFields?: FieldDefinition[];
}

export interface CargoPPE {
  id: string;
  text: string;
}

/**
 * Catálogo oficial de cargos PPE (mesma numeração da coleção Wix PPECARGOS).
 * A fonte principal em runtime é a coleção Wix (/api/portal/ppe-cargos); esta lista é a
 * reserva quando o catálogo não está disponível e PRECISA manter os mesmos IDs, pois o
 * client_data grava apenas o ID e o contrato traduz o ID pelo catálogo.
 */
export const CARGOS_PPE_PADRAO: CargoPPE[] = [
  { id: '1', text: 'Detentores de mandatos eletivos dos Poderes Executivo e Legislativo da União' },
  { id: '2', text: 'Ministro de Estado ou equiparado' },
  { id: '3', text: 'Natureza especial ou equivalente' },
  { id: '4', text: 'Presidente, vice-presidente e diretor, ou equivalentes, de entidades da administração pública indireta' },
  { id: '5', text: 'Grupo Direção e Assessoramento Superiores – DAS, nível 6, e equivalentes' },
  { id: '6', text: 'Membros do Conselho Nacional de Justiça, do Supremo Tribunal Federal e dos Tribunais Superiores' },
  {
    id: '7',
    text: 'Membros do Conselho Nacional do Ministério Público, o Procurador-Geral da República, o Vice-Procurador-Geral da República, o Procurador-Geral do Trabalho, o Procurador-Geral da Justiça Militar, os Subprocuradores-Gerais da República e os Procuradores-Gerais de Justiça dos Estados do Distrito Federal',
  },
  { id: '8', text: 'Membros do Tribunal de Contas da União e o Procurador-Geral do Ministério Público junto ao Tribunal de Contas da União' },
  { id: '9', text: 'Presidentes e tesoureiro nacional, ou equivalentes, de partidos políticos' },
  {
    id: '10',
    text: 'Governadores e secretários de Estado e do Distrito Federal, os Deputados Estaduais e Distritais, os presidentes, ou equivalentes, de entidades da administração pública indireta estadual e distrital e os presidentes de Tribunais de Justiça, Militares, de Contas ou equivalente de Estado e do Distrito Federal',
  },
  {
    id: '11',
    text: 'Prefeitos, Vereadores, Secretários Municipais, presidentes, ou equivalentes, de entidades da administração pública indireta municipal e os Presidentes de Tribunais de Contas ou equivalente dos Municípios',
  },
  {
    id: '12',
    text: 'Também são consideradas pessoas expostas politicamente aquelas que, no exterior, sejam chefes de estado ou de governo, políticos de escalões superiores, ocupantes de cargos governamentais de escalões superiores, oficiais generais e membros de escalões superiores do poder judiciário, executivos de escalões superiores de empresas públicas, ou dirigentes de partidos políticos',
  },
];

export interface MultiRamoFormState {
  // Passo 1: Seleção de Plano e Condições Comerciais
  planoSelecionado?: string;
  tipoDePlano?: string;
  qtdParcelas?: number;
  descontoManualPercent?: number;
  cupomCodigo?: string;

  // Passo 2: Dados Básicos do Proponente / Segurado
  nome: string;
  cpfCnpj: string;
  email: string;
  celular: string;
  dataNascto?: string;
  dataAtividade?: string;

  // Registro Profissional e de Classe
  registroProfissionalNumero?: string;
  registroProfissionalUf?: string;
  rqe?: string;
  oab?: string;
  crm?: string;
  crmUf?: string;
  cro?: string;
  croUf?: string;
  creaCau?: string;
  creaCauUf?: string;
  crc?: string;
  crcUf?: string;

  // Tomadora PJ (D&O Administradores & Diretores / PJs)
  razaoSocialTomadora?: string;
  cnpjTomadora?: string;
  ativoTotal?: string;
  faturamentoAnual?: string;

  // Endereço de Contato / Comercial
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;

  // Passo 3: Perfil Profissional, Áreas de Atuação e Faturamento
  associadoEscritorio?: 'Sim' | 'Não' | string;
  nomeEscritorio?: string;
  escritorioAssociado?: string;
  titularidade?: string;
  titularidadeTipo?: string;
  titularidadeOutro?: string;
  faturamentoAntes?: string;
  faturamentoDepois?: string;
  especialidades?: string[];
  atuacao?: string[]; // Alias retrocompatível com RC Advogados

  // Pessoa Politicamente Exposta (PPE)
  ppeCargos?: 'Sim' | 'Não' | string;
  ppeRepresenta?: 'Sim' | 'Não' | string;
  ppeCargoSelect?: string[];

  // Vigência e Renovação
  isRenovacao?: 'Sim' | 'Não' | string;
  dataInicioVigencia?: string;

  // Dados de Seguro Anterior (Condicional se isRenovacao === 'Sim')
  seguradora?: string;
  vigencia?: string;
  limite?: string;
  franquiaAnterior?: string;
  premio?: string;
  dataRetroativa?: string;

  // Questionário de Risco (Declarações & Underwriting)
  propostaRecusada?: 'Sim' | 'Não' | string;
  propostaDetalhe?: string;
  reclamacaoProfissional?: 'Sim' | 'Não' | string;
  reclamacaoDetalhe?: string;
  investigacaoAutoridade?: 'Sim' | 'Não' | string;
  investigacaoDetalhe?: string;
  fatoTerceiros?: 'Sim' | 'Não' | string;
  fatoDetalhe?: string;
  pagouReclamacao?: 'Sim' | 'Não' | string;
  pagouDetalhe?: string;

  // Suporte flexível para perguntas declarativas adicionais de underwriting
  [key: string]: any;
}
