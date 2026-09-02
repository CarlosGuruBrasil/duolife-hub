export type TipoNo =
  | 'GATILHO'
  | 'LOGICO_E'
  | 'LOGICO_OU'
  | 'CONDICAO_SE'
  | 'ACAO_EMAIL'
  | 'ACAO_WHATSAPP'
  | 'ACAO_STATUS'
  | 'ACAO_WEBHOOK';

export type EventoDominio =
  | 'COTACAO_CRIADA'
  | 'PROPOSTA_ENVIADA'
  | 'CONTRATO_ASSINADO'
  | 'CONTRATO_RECUSADO'
  | 'PAGAMENTO_CONFIRMADO'
  | 'FATURA_VENCIDA'
  | 'APOLICE_EMITIDA'
  | 'LEAD_CRIADO'
  | 'RECUPERAR_SENHA';

export interface DestinatarioConfig {
  destinatario_tipo: 'CLIENTE' | 'PARCEIRO' | 'ADMIN' | 'PERSONALIZADO';
  destinatario_email?: string;
  destinatario_nome?: string;
  destinatario_admin_id?: string;
}

export type OperadorCondicao =
  | 'IGUAL'
  | 'DIFERENTE'
  | 'CONTEM'
  | 'MAIOR'
  | 'MENOR'
  | 'ESTA_EM'
  | 'NAO_ESTA_EM';

export interface ConfiguracaoNo {
  // Configuração de Nó Gatilho
  gatilho_codigo?: string;

  // Configuração de Condição SE
  campo?: string; // ex: 'cotacao.status', 'cotacao.premio_final', 'cliente.cpf', 'produto.codigo'
  operador?: OperadorCondicao;
  valor_comparacao?: string;

  // Configuração de Ação de E-mail
  template_id?: string; // código ou id do template
  assunto?: string;
  destinatarios?: DestinatarioConfig[];
  destinatario_tipo?: string;
  destinatario_email?: string;
  destinatario_nome?: string;

  // Configuração de Ação de WhatsApp
  mensagem?: string;
  telefone_destino?: string;

  // Configuração de Ação de Alteração de Status
  status?: string;

  // Configuração de Webhook
  webhook_url?: string;
  webhook_method?: 'POST' | 'PUT';
  webhook_headers?: Record<string, string>;
}

export interface NoArvore {
  id: string;
  tipo: TipoNo;
  titulo: string;
  subtitulo?: string;
  parentId?: string | null;
  configuracao?: ConfiguracaoNo;
  ativo?: boolean;
  posicaoX?: number;
  posicaoY?: number;
}

export interface ArvoreDecisao {
  id: string;
  codigo?: string;
  nome: string;
  descricao?: string;
  gatilhoCodigo: string; // EventoDominio ou código customizado
  ativo: boolean;
  nos: NoArvore[];
}

export interface AutomationTriggerRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  event_type: string;
  is_active: boolean;
  tree_definition: {
    nos: NoArvore[];
  };
  created_at: string;
  updated_at: string;
}

export interface AutomationTriggerLogRecord {
  id: string;
  trigger_id: string | null;
  event_type: string;
  context_id: string | null;
  context_data: Record<string, any>;
  evaluated_nodes: Array<{
    nodeId: string;
    tipo: TipoNo;
    evaluatedTo: boolean;
    reason?: string;
  }>;
  actions_executed: Array<{
    nodeId: string;
    tipo: TipoNo;
    status: 'success' | 'failed' | 'skipped';
    output?: any;
    error?: string;
  }>;
  status: 'success' | 'partial' | 'failed' | 'no_action';
  error_message: string | null;
  created_at: string;
}

export interface TriggerEvaluationContext {
  eventType?: string;
  contextId?: string;
  cliente?: {
    nome?: string;
    email?: string;
    documento?: string;
    telefone?: string;
  };
  parceiro?: {
    id?: string;
    nome?: string;
    email?: string;
    codigoVenda?: string;
  };
  cotacao?: {
    id?: string;
    status?: string;
    premio_final?: number;
    cobertura?: number;
    produto_codigo?: string;
    produto_nome?: string;
  };
  transacao?: {
    id?: string;
    valor?: number;
    vencimento?: string;
    forma_pagamento?: string;
    link_fatura?: string;
  };
  usuario?: {
    id?: string;
    nome?: string;
    email?: string;
    tipo?: 'partner' | 'admin' | string;
  };
  dados?: Record<string, any>;
}
