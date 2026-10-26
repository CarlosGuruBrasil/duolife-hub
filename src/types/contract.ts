export interface ProponenteData {
  nome?: string;
  dataNascimento?: string;
  cpf?: string;
  email?: string;
  celular?: string;
  endereco?: string;
  inicioProfissional?: string;
  oab?: string;
  registroLabel?: string;
  registroValor?: string;
}

export interface CondicoesComercializacaoData {
  importanciaSegurada?: string;
  franquia?: string;
  valorPremio?: string;
  formaPagamento?: string;
  vigencia?: string;
  estipulante?: string;
  corretora?: string;
  seguradora?: string;
}

export interface CorretoraContratoData {
  nome?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  cidade?: string;
  estado?: string;
  logoUrl?: string;
}

export interface DataCidadeData {
  cidade?: string;
  dia?: string | number;
  mes?: string;
  ano?: string | number;
}

export interface ContractData {
  proponente?: ProponenteData;
  condicoes?: CondicoesComercializacaoData;
  corretora?: CorretoraContratoData;
  dataCidade?: DataCidadeData;
  /**
   * Se verdadeiro, substitui campos vazios por placeholders literais como {{nome}}, {{cpf}}, etc.
   */
  usePlaceholders?: boolean;
}
