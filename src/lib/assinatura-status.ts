/**
 * Definições e Utilitários de Status de Assinaturas (DuoLife Hub)
 *
 * Mapeamento e identificação dinâmica de assinaturas (ZapSign / Contratos):
 * - Contratos via Modelo ZapSign (ID do modelo): necessitam de 1 assinatura (Cliente/Proponente).
 * - Contratos via PDF dinâmico enviado ao ZapSign: necessitam de 2 assinaturas (Cliente e Corretora).
 *
 * Status possíveis:
 * - 1 assinatura:
 *   - 0/1: Falta Cliente
 *   - 1/1: Assinada (todas_assinadas)
 * - 2 assinaturas:
 *   - 0/2: Faltam Ambas
 *   - 1/2: Falta Corretora OU Falta Cliente
 *   - 2/2: Ambas Assinadas (todas_assinadas)
 */

export type StatusAssinaturaValue =
  | 'todas_assinadas'
  | 'falta_corretora'
  | 'falta_cliente'
  | 'faltam_ambas';

export type StatusAssinaturaFilter =
  | 'falta_1'
  | 'falta_corretora'
  | 'falta_cliente'
  | 'faltam_ambas'
  | 'ambas_assinadas'
  | 'todas_assinadas';

export const STATUS_ASSINATURA_FILTER_OPTIONS: Array<{
  value: StatusAssinaturaFilter;
  label: string;
}> = [
  { value: 'falta_1', label: 'Falta 1 assinatura' },
  { value: 'falta_corretora', label: 'Falta assinatura da corretora' },
  { value: 'falta_cliente', label: 'Falta assinatura do cliente' },
  { value: 'faltam_ambas', label: 'Faltam ambas assinaturas (0/2)' },
  { value: 'ambas_assinadas', label: 'Todas assinadas (1/1 ou 2/2)' },
];

export function formatStatusAssinaturaFilterLabel(
  filterValue: string | null | undefined
): string | null {
  if (!filterValue) return null;
  const match = STATUS_ASSINATURA_FILTER_OPTIONS.find((opt) => opt.value === filterValue);
  return match ? match.label : null;
}

export type PapelAssinante = 'cliente' | 'corretora';

export interface RequisitosAssinatura {
  total: number; // 1 ou 2
  modo: 'dynamic_pdf' | 'template';
  papeis: PapelAssinante[];
  precisaCliente: boolean;
  precisaCorretora: boolean;
  labelDescricao: string;
}

export interface AssinaturaBadgeInfo {
  status: StatusAssinaturaValue | null;
  label: string;
  badgeClass: string;
  countLabel: string;
  totalNecessario: number;
}

/**
 * Identifica dinamicamente quantas e quais assinaturas um contrato necessita:
 * - Modelo ZapSign (template): 1 assinatura (Cliente).
 * - PDF enviado ao ZapSign (dynamic_pdf): 2 assinaturas (Cliente e Corretora).
 */
export function identificarRequisitosAssinatura(
  clientData?: Record<string, any> | null,
  contextoOuCotacao?: Record<string, any> | null
): RequisitosAssinatura {
  const cd = clientData || {};

  // 1. Se explicitamente gravado na cotação/client_data
  if (cd.totalAssinaturas === 1 || cd.contratoModo === 'template') {
    return {
      total: 1,
      modo: 'template',
      papeis: ['cliente'],
      precisaCliente: true,
      precisaCorretora: false,
      labelDescricao: '1 assinatura (Cliente)',
    };
  }

  if (cd.totalAssinaturas === 2 || cd.contratoModo === 'dynamic_pdf') {
    return {
      total: 2,
      modo: 'dynamic_pdf',
      papeis: ['cliente', 'corretora'],
      precisaCliente: true,
      precisaCorretora: true,
      labelDescricao: '2 assinaturas (Cliente e Corretora)',
    };
  }

  // 2. Se o signature_document guardou template_id específico de modelo
  const templateId = contextoOuCotacao?.template_id;
  if (templateId && templateId !== 'dynamic_pdf') {
    return {
      total: 1,
      modo: 'template',
      papeis: ['cliente'],
      precisaCliente: true,
      precisaCorretora: false,
      labelDescricao: '1 assinatura (Cliente)',
    };
  }

  // 3. Se for médico / Termo de Adesão da Saúde (gerado como PDF dinâmico com 2 assinaturas)
  const isMedico =
    cd.flowKey === 'rc_medicos_v1' ||
    cd.flowKey === 'rc-medicos' ||
    contextoOuCotacao?.flowKey === 'rc_medicos_v1' ||
    contextoOuCotacao?.flow_key === 'rc_medicos_v1' ||
    contextoOuCotacao?.flow_key === 'rc-medicos' ||
    contextoOuCotacao?.productId === 'prod-rc-med-001' ||
    contextoOuCotacao?.product_id === 'prod-rc-med-001';

  if (isMedico) {
    return {
      total: 2,
      modo: 'dynamic_pdf',
      papeis: ['cliente', 'corretora'],
      precisaCliente: true,
      precisaCorretora: true,
      labelDescricao: '2 assinaturas (Cliente e Corretora)',
    };
  }

  // 4. Padrão de negócio: modelos ZapSign requerem apenas 1 assinatura do cliente
  return {
    total: 1,
    modo: 'template',
    papeis: ['cliente'],
    precisaCliente: true,
    precisaCorretora: false,
    labelDescricao: '1 assinatura (Cliente)',
  };
}

/**
 * Determina o status visual de assinatura da cotação a partir dos dados do cliente,
 * do status geral e do total de assinaturas exigido.
 */
export function getCotacaoAssinaturaInfo(
  status: string | null | undefined,
  clientData: Record<string, any> | null | undefined,
  contextoOuCotacao?: Record<string, any> | null
): AssinaturaBadgeInfo | null {
  const rawStatus = (status || '').toLowerCase().trim();
  const cData = clientData || {};
  const statusAssinatura = cData.statusAssinatura as StatusAssinaturaValue | undefined;
  const isVendaConcluida = ['aprovada', 'emitida', 'ativa', 'active'].includes(rawStatus);

  const requisitos = identificarRequisitosAssinatura(cData, contextoOuCotacao);

  // ==========================================
  // CASO A: CONTRATO DE 1 ASSINATURA (CLIENTE)
  // ==========================================
  if (requisitos.total === 1) {
    const assinado =
      statusAssinatura === 'todas_assinadas' ||
      Boolean(cData.clienteAssinou) ||
      isVendaConcluida;

    if (assinado) {
      return {
        status: 'todas_assinadas',
        label: '1/1 Assinada',
        countLabel: '1/1',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
        totalNecessario: 1,
      };
    }

    const hasContrato =
      rawStatus === 'contrato_gerado' ||
      rawStatus === 'assinado' ||
      Boolean(cData.contratoPdf || cData.signUrl || cData.docToken || cData.contratoToken || cData.linkContrato);

    if (hasContrato || statusAssinatura === 'falta_cliente' || statusAssinatura === 'faltam_ambas') {
      return {
        status: 'falta_cliente',
        label: '0/1 Assinatura',
        countLabel: '0/1',
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
        totalNecessario: 1,
      };
    }

    return null;
  }

  // ==========================================
  // CASO B: CONTRATO DE 2 ASSINATURAS (CLIENTE + CORRETORA)
  // ==========================================
  if (statusAssinatura === 'falta_corretora') {
    return {
      status: 'falta_corretora',
      label: '1/2 - Falta Corretora',
      countLabel: '1/2',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
      totalNecessario: 2,
    };
  }

  if (statusAssinatura === 'falta_cliente') {
    return {
      status: 'falta_cliente',
      label: '1/2 - Falta Cliente',
      countLabel: '1/2',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
      totalNecessario: 2,
    };
  }

  if (statusAssinatura === 'faltam_ambas') {
    return {
      status: 'faltam_ambas',
      label: '0/2 Assinaturas',
      countLabel: '0/2',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      totalNecessario: 2,
    };
  }

  if (statusAssinatura === 'todas_assinadas' || isVendaConcluida) {
    return {
      status: 'todas_assinadas',
      label: '2/2 Assinadas',
      countLabel: '2/2',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
      totalNecessario: 2,
    };
  }

  const hasContratoGerado =
    rawStatus === 'contrato_gerado' ||
    rawStatus === 'assinado' ||
    Boolean(cData.contratoPdf || cData.signUrl || cData.docToken || cData.contratoToken || cData.linkContrato);

  if (hasContratoGerado) {
    return {
      status: 'faltam_ambas',
      label: '0/2 Assinaturas',
      countLabel: '0/2',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      totalNecessario: 2,
    };
  }

  return null;
}
