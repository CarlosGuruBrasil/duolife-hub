/**
 * Tipos e Contratos de Dados para a Central de Pendências e Cancelamentos
 * DuoLife Hub
 */

/** Aba ativa na central */
export type PendenciaTab = 'em_atraso' | 'canceladas' | 'visao_geral';

/** Origem/tipo do registro: cotação direta ou venda registrada */
export type TipoRegistro = 'cotacao' | 'venda';

/** Situação de risco ou status contratual */
export type SituacaoContrato = 'em_atraso_tolerancia' | 'em_atraso_critico' | 'cancelada';

/** Status individual de uma parcela */
export type ParcelaStatus = 'pending' | 'overdue' | 'paid' | 'cancelled';

/**
 * Detalhe de parcela individual de uma contratação
 */
export interface ParcelaDetalhe {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: string; // Formato YYYY-MM-DD
  paidAt: string | null;
  status: string; // 'pending' | 'overdue' | 'paid' | 'cancelled'
  daysOverdue: number;
  cancellationDeadline: string; // Formato YYYY-MM-DD
  isPastDeadline: boolean;
  externalPaymentId: string | null;
  bankSlipUrl?: string | null;
  pixQrCodeUrl?: string | null;
  invoiceUrl?: string | null;
}

/**
 * Item unificado de pendência ou cancelamento (cotação ou venda)
 */
export interface PendenciaCancelamentoItem {
  id: string; // cotacao_id como âncora única da contratação
  cotacaoId: string;
  saleId: string | null;
  tipoRegistro: TipoRegistro;
  policyNumber: string | null;
  clientName: string;
  clientCpfCnpj: string;
  clientEmail: string | null;
  clientPhone: string | null;
  corretoraId: string;
  corretoraNome: string;
  partnerId: string;
  partnerNome: string;
  managerUserId: string | null;
  managerNome: string | null;
  vendedorUserId: string | null;
  vendedorNome: string | null;
  productId: string;
  productName: string;
  valorTotalContratacao: number;
  situacaoContrato: SituacaoContrato;
  motivoCancelamento?: string | null;
  dataCancelamento?: string | null;
  valorRecebidoAntesCancelamento?: number;
  qtdParcelasVencidas: number;
  valorTotalAtraso: number;
  dataVencimentoMaisAntiga: string | null;
  maiorDiasAtraso: number;
  dataLimiteCancelamentoMaisCritica: string | null;
  parcelas: ParcelaDetalhe[];
}

/**
 * Indicadores consolidados (KPIs) da central
 */
export interface PendenciasKPIs {
  totalContratacoesEmAtraso: number;
  valorTotalEmAtraso: number;
  totalContratacoesCanceladas: number;
  valorOriginalTotalCanceladas: number;
}

/** Campos ordenáveis disponíveis em todas as colunas da tabela */
export type PendenciasSortField =
  | 'cliente'
  | 'contratacao'
  | 'produto'
  | 'corretora'
  | 'valor'
  | 'dias_atraso'
  | 'vencimento'
  | 'data_cancelamento';

/**
 * Filtros de busca e paginação para a central
 */
export interface PendenciasFiltros {
  tab?: PendenciaTab;
  q?: string;
  corretoraId?: string;
  partnerId?: string;
  managerUserId?: string;
  vendedorUserId?: string;
  productId?: string;
  tipoRegistro?: TipoRegistro | 'todos';
  situacao?: string;
  motivoCancelamento?: string;
  diasAtrasoMin?: number;
  diasAtrasoMax?: number;
  vencimentoDe?: string;
  vencimentoAte?: string;
  cancelamentoDe?: string;
  cancelamentoAte?: string;
  page?: number;
  pageSize?: number;
  orderBy?: PendenciasSortField;
  orderDir?: 'asc' | 'desc';
}

/**
 * Resultado paginado retornado pelo serviço e pela rota da API
 */
export interface PendenciasPaginadasResult {
  items: PendenciaCancelamentoItem[];
  kpis: PendenciasKPIs;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
