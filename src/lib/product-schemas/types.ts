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

export const CARGOS_PPE_PADRAO: CargoPPE[] = [
  { id: '1', text: 'Detentores de mandatos eletivos dos Poderes Executivo e Legislativo da União' },
  { id: '2', text: 'Ocupantes de cargo, no Poder Executivo da União (Ministro, Secretário Especial, DAS-6/NES)' },
  { id: '3', text: 'Membros do STF, Tribunais Superiores, TRFs, TRTs, TREs, STM e MPU' },
  { id: '4', text: 'Membros do TCU e da AGU' },
  { id: '5', text: 'Presidentes e diretores de órgãos da administração pública indireta, empresas públicas ou SEMs' },
  { id: '6', text: 'Governadores, Vice-Governadores, Secretários de Estado e do DF, Deputados Estaduais/Distritais' },
  { id: '7', text: 'Prefeitos, Vice-Prefeitos, Vereadores, Presidentes de Câmaras Municipais' },
  { id: '8', text: 'Dirigentes de partidos políticos nacionais e membros de conselhos de estatais' },
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
