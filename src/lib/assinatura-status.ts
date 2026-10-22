/**
 * Definições e Utilitários de Status de Assinaturas (DuoLife Hub)
 *
 * Mapeamento e filtragem de status de assinaturas (ZapSign / Contratos):
 * - Falta 1 assinatura: falta corretora OU falta cliente
 * - Falta assinatura da corretora
 * - Falta assinatura do cliente
 * - Faltam ambas assinaturas
 * - Ambas assinadas
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
  | 'ambas_assinadas';

export const STATUS_ASSINATURA_FILTER_OPTIONS: Array<{
  value: StatusAssinaturaFilter;
  label: string;
}> = [
  { value: 'falta_1', label: 'Falta 1 assinatura' },
  { value: 'falta_corretora', label: 'Falta assinatura da corretora' },
  { value: 'falta_cliente', label: 'Falta assinatura do cliente' },
  { value: 'faltam_ambas', label: 'Faltam ambas assinaturas' },
  { value: 'ambas_assinadas', label: 'Ambas assinadas' },
];

export function formatStatusAssinaturaFilterLabel(
  filterValue: string | null | undefined
): string | null {
  if (!filterValue) return null;
  const match = STATUS_ASSINATURA_FILTER_OPTIONS.find((opt) => opt.value === filterValue);
  return match ? match.label : null;
}

export interface AssinaturaBadgeInfo {
  status: StatusAssinaturaValue | null;
  label: string;
  badgeClass: string;
  countLabel: string;
}

/**
 * Determina o status visual de assinatura da cotação a partir dos dados do cliente e do status geral
 */
export function getCotacaoAssinaturaInfo(
  status: string | null | undefined,
  clientData: Record<string, any> | null | undefined
): AssinaturaBadgeInfo | null {
  const rawStatus = (status || '').toLowerCase().trim();
  const cData = clientData || {};
  const statusAssinatura = cData.statusAssinatura as StatusAssinaturaValue | undefined;

  // 1. Caso o statusAssinatura esteja explicitamente gravado no client_data
  if (statusAssinatura === 'falta_corretora') {
    return {
      status: 'falta_corretora',
      label: '1/2 - Falta Corretora',
      countLabel: '1/2',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
    };
  }

  if (statusAssinatura === 'falta_cliente') {
    return {
      status: 'falta_cliente',
      label: '1/2 - Falta Cliente',
      countLabel: '1/2',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
    };
  }

  if (statusAssinatura === 'faltam_ambas') {
    return {
      status: 'faltam_ambas',
      label: '0/2 Assinaturas',
      countLabel: '0/2',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  }

  if (statusAssinatura === 'todas_assinadas') {
    return {
      status: 'todas_assinadas',
      label: '2/2 Assinadas',
      countLabel: '2/2',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
    };
  }

  // 2. Fallbacks para cotações antigas sem o campo explícito
  const isContratoAssinado =
    ['assinado', 'signed', 'pagamento_gerado', 'aprovada', 'emitida', 'ativa', 'active'].includes(
      rawStatus
    ) || Boolean(cData.contratoPdf || cData.signedFileUrl || cData.assinadoEm);

  if (isContratoAssinado) {
    return {
      status: 'todas_assinadas',
      label: '2/2 Assinadas',
      countLabel: '2/2',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
    };
  }

  const hasContratoGerado =
    rawStatus === 'contrato_gerado' ||
    Boolean(cData.signUrl || cData.docToken || cData.linkContrato);

  if (hasContratoGerado) {
    return {
      status: 'faltam_ambas',
      label: '0/2 Assinaturas',
      countLabel: '0/2',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  }

  return null;
}
