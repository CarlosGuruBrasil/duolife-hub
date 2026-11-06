import { isInternalUser, roleIsCorretoraManagement, type AuthUser } from './auth';
import { recordActionAudit } from './action-audit';
import { logger } from './logger';
import { sql } from './pg';
import { deleteAsaasPayment, deleteAsaasInstallment } from './asaas-charges';

/**
 * Regras de correção de contrato depois que o cliente já assinou.
 *
 * - Correção cadastral: dados do cliente/proposta; valores e cobrança permanecem intactos.
 *   Permitida a quem tem acesso à cotação (vendedor dono e hierarquia acima).
 * - Correção financeira: valores, plano, parcelas ou desconto. Exige gestor do vendedor,
 *   diretor, gestão da corretora ou administrador. Bloqueada se houver parcela paga.
 * - Em ambos os casos o motivo é obrigatório e fica registrado em auditoria.
 */

export const MOTIVO_CORRECAO_MIN = 10;
export const MOTIVO_CORRECAO_MAX = 500;

export type TipoCorrecaoContrato = 'cadastral' | 'financeira';

/** Status em que o contrato já foi assinado pelo cliente. */
const STATUS_CONTRATO_ASSINADO = ['assinado', 'pagamento_gerado'];

export function isContratoAssinadoPeloCliente(
  status: string | null | undefined,
  clientData: Record<string, any> | null | undefined
): boolean {
  return (
    STATUS_CONTRATO_ASSINADO.includes(String(status || '')) ||
    clientData?.clienteAssinou === true
  );
}

/** Retorna o motivo normalizado ou null se não atender ao tamanho mínimo. */
export function normalizarMotivoCorrecao(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const motivo = raw.replace(/\s+/g, ' ').trim();
  if (motivo.length < MOTIVO_CORRECAO_MIN) return null;
  return motivo.slice(0, MOTIVO_CORRECAO_MAX);
}

export const MENSAGEM_MOTIVO_OBRIGATORIO = `Informe o motivo da correção (mínimo de ${MOTIVO_CORRECAO_MIN} caracteres).`;

/** Gestor do vendedor, diretor, gestão da corretora e administradores internos. */
export function podeCorrigirFinanceiroPosAssinatura(user: AuthUser): boolean {
  return (
    isInternalUser(user) ||
    roleIsCorretoraManagement(user.role) ||
    user.partnerRole === 'director' ||
    user.partnerRole === 'manager'
  );
}

/** Status de parcela/pedido considerados pagos. */
export const STATUS_PAGOS = ['paid', 'received', 'confirmed', 'received_in_cash'];

/** Status de pedido de pagamento que não representam mais uma cobrança ativa. */
export const STATUS_PEDIDO_INATIVO = ['cancelled', 'canceled', 'refunded', 'deleted'];

const STATUS_PAGOS_OU_PARCIAL = [...STATUS_PAGOS, 'partially_paid'];
/** Pedido que não pode mais ser cancelado: já inativo ou já pago. */
const STATUS_PEDIDO_ENCERRADO = [...STATUS_PEDIDO_INATIVO, ...STATUS_PAGOS];

export interface RegistroCorrecaoContrato {
  tipo: TipoCorrecaoContrato;
  motivo: string;
  em: string;
  porUserId: string | null;
  porNome: string | null;
  documentoAnterior: string | null;
  statusAnterior: string | null;
}

/** Acrescenta a correção ao histórico guardado em client_data (mutação in-place). */
export function anexarHistoricoCorrecao(
  clientData: Record<string, any>,
  registro: RegistroCorrecaoContrato
): void {
  const historico = Array.isArray(clientData.historicoCorrecoesContrato)
    ? clientData.historicoCorrecoesContrato
    : [];
  historico.push(registro);
  clientData.historicoCorrecoesContrato = historico.slice(-50);
}

/** Registra a correção na trilha de auditoria. Falhas não interrompem o fluxo. */
export async function auditarCorrecaoContrato(params: {
  user: AuthUser;
  cotacaoId: string;
  clientName?: string | null;
  action: 'contrato_assinado_refeito' | 'correcao_financeira_pos_assinatura';
  registro: RegistroCorrecaoContrato;
  extra?: Record<string, any>;
  req?: Request;
}): Promise<void> {
  try {
    await recordActionAudit({
      userId: params.user.userId,
      userName: params.user.name,
      userEmail: params.user.email,
      userRole: params.user.role,
      action: params.action,
      module: 'cotacoes',
      targetType: 'cotacao',
      targetId: params.cotacaoId,
      targetName: params.clientName || null,
      description:
        params.action === 'contrato_assinado_refeito'
          ? `Contrato assinado cancelado e refeito (${params.registro.tipo}). Motivo: ${params.registro.motivo}`
          : `Correção financeira após assinatura. Motivo: ${params.registro.motivo}`,
      status: 'warning',
      metadata: { ...params.registro, ...(params.extra || {}) },
      req: params.req,
    });
  } catch (err) {
    logger.error({ err, cotacaoId: params.cotacaoId }, 'contrato_correcao.audit_failed');
  }
}

/**
 * Indica se já houve qualquer recebimento (parcela paga, pedido pago/parcial ou apólice ativa).
 * Nesses casos a correção financeira é bloqueada e deve ser tratada pelo administrador.
 */
export async function possuiPagamentoRecebido(cotacaoId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM payment_installments
    WHERE cotacao_id = ${cotacaoId}
      AND LOWER(COALESCE(status, '')) IN ${sql(STATUS_PAGOS)}
    UNION ALL
    SELECT 1 FROM payment_orders
    WHERE cotacao_id = ${cotacaoId}
      AND (
        LOWER(COALESCE(status, '')) IN ${sql(STATUS_PAGOS_OU_PARCIAL)}
        OR COALESCE(paid_installments, 0) > 0
      )
    UNION ALL
    SELECT 1 FROM sales
    WHERE cotacao_id = ${cotacaoId}
      AND COALESCE(status, '') <> 'cancelada'
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Cancela no Asaas e remove localmente as cobranças ainda ativas (não pagas) da cotação,
 * no mesmo padrão usado ao regerar a cobrança. Falha fechada: se o Asaas recusar o
 * cancelamento, nada é removido localmente e o erro é devolvido.
 */
export async function cancelarCobrancasPendentes(
  cotacaoId: string
): Promise<{ ok: boolean; error?: string; pedidosCancelados: string[] }> {
  const pedidos = await sql<{ id: string; external_payment_id: string | null; external_installment_id: string | null }[]>`
    SELECT id, external_payment_id, external_installment_id
    FROM payment_orders
    WHERE cotacao_id = ${cotacaoId}
      AND LOWER(COALESCE(status, '')) NOT IN ${sql(STATUS_PEDIDO_ENCERRADO)}
  `;

  const pedidosCancelados: string[] = [];
  for (const pedido of pedidos) {
    const resultado = pedido.external_installment_id
      ? await deleteAsaasInstallment(pedido.external_installment_id)
      : pedido.external_payment_id
        ? await deleteAsaasPayment(pedido.external_payment_id)
        : { ok: true, deleted: false };

    if (!resultado.ok) {
      logger.error({ cotacaoId, pedidoId: pedido.id, error: resultado.error }, 'contrato_correcao.cancelar_cobranca_failed');
      return {
        ok: false,
        error: `Não foi possível cancelar a cobrança no Asaas: ${resultado.error || 'erro desconhecido'}`,
        pedidosCancelados,
      };
    }

    await sql.begin(async (tx) => {
      await tx`DELETE FROM delinquency_notifications WHERE payment_order_id = ${pedido.id}`;
      await tx`DELETE FROM payment_installments WHERE payment_order_id = ${pedido.id}`;
      await tx`DELETE FROM payment_orders WHERE id = ${pedido.id}`;
    });
    pedidosCancelados.push(pedido.id);
  }

  return { ok: true, pedidosCancelados };
}
