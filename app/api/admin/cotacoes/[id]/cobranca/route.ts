import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { updateAsaasPayment } from '@/lib/asaas-charges';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface AlterarCobrancaBody {
  valorTotal?: number;
  qtdParcelas?: number;
  dueDate?: string;
  billingType?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED' | string;
  description?: string;
  forceRecreate?: boolean;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) {
    return Response.json({ ok: false, error: 'ID da cotação não informado' }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as AlterarCobrancaBody;

    // 1. Busca a ordem de pagamento atual da cotação
    const [order] = await sql<
      Array<{
        id: string;
        cotacao_id: string;
        external_payment_id: string | null;
        external_installment_id: string | null;
        billing_type: string;
        status: string;
        amount_total: string;
        installment_count: number;
        due_date: string;
        description: string | null;
      }>
    >`
      SELECT
        id,
        cotacao_id,
        external_payment_id,
        external_installment_id,
        billing_type,
        status,
        amount_total,
        installment_count,
        due_date,
        description
      FROM payment_orders
      WHERE cotacao_id = ${id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!order) {
      return Response.json(
        {
          ok: false,
          error: 'Nenhuma cobrança encontrada para esta cotação. Utilize a opção "Criar Cobrança".',
        },
        { status: 404 }
      );
    }

    const isPaid = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(
      order.status
    );
    if (isPaid) {
      return Response.json(
        {
          ok: false,
          error: 'Esta cobrança já foi compensada/paga no Asaas e não pode ter suas informações alteradas.',
        },
        { status: 400 }
      );
    }

    const currentTotal = parseFloat(order.amount_total) || 0;
    const currentParcelas = order.installment_count || 1;
    const currentDue = (order.due_date || '').slice(0, 10);
    const currentDesc = order.description || '';

    const newTotal =
      body.valorTotal !== undefined && body.valorTotal > 0
        ? Math.round(Number(body.valorTotal) * 100) / 100
        : currentTotal;
    const newParcelas =
      body.qtdParcelas !== undefined && body.qtdParcelas > 0
        ? Math.floor(Number(body.qtdParcelas))
        : currentParcelas;
    const newDue = body.dueDate ? body.dueDate.trim().slice(0, 10) : currentDue;
    const newDesc = body.description !== undefined ? body.description.trim() : currentDesc;
    const newBillingType = (body.billingType || order.billing_type || 'UNDEFINED').toUpperCase();
    const currentBillingType = (order.billing_type || 'UNDEFINED').toUpperCase();
    const billingTypeChanged = Boolean(body.billingType && newBillingType !== currentBillingType);

    const parcelasChanged = newParcelas !== currentParcelas;
    const totalChanged = Math.abs(newTotal - currentTotal) > 0.009;
    const dueChanged = newDue !== currentDue;
    const descChanged = newDesc !== currentDesc;

    // Se o usuário já confirmou a substituição forçada (após impedimento do Asaas)
    if (body.forceRecreate) {
      const recResult = await generateAsaasPaymentForQuote(id, {
        isManualAdmin: true,
        forceRecreate: true,
        customValues: {
          valorTotal: newTotal,
          qtdParcelas: newParcelas,
          dueDate: newDue,
          billingType: newBillingType,
          description: newDesc,
        },
      });

      if (!recResult.ok) {
        return Response.json(
          { ok: false, error: recResult.error || 'Falha ao substituir cobrança no Asaas' },
          { status: 400 }
        );
      }

      await sql`
        UPDATE cotacoes
        SET
          status = CASE
            WHEN status IN ('aprovada', 'emitida') THEN status
            ELSE 'pagamento_gerado'
          END,
          updated_at = NOW()
        WHERE id = ${id}
      `;

      return Response.json({
        ok: true,
        recreated: true,
        message: 'Cobrança anterior cancelada e nova cobrança gerada com sucesso!',
        checkoutId: recResult.checkoutId,
        linkBoleto: recResult.linkBoleto,
        dueDate: recResult.dueDate,
      });
    }

    // Caso 1: Houve alteração no número de parcelas.
    // O Asaas NÃO permite alterar a quantidade de parcelas de uma cobrança já existente.
    if (parcelasChanged) {
      return Response.json({
        ok: false,
        requiresRecreate: true,
        reason: `A quantidade de parcelas foi alterada de ${currentParcelas}x para ${newParcelas}x. O Asaas não permite alterar o parcelamento de uma cobrança já emitida.`,
      });
    }

    // Caso 2: Cobrança parcelada existente onde o valor total foi alterado.
    // O Asaas não permite alterar o valor global de um carnê sem recriá-lo.
    if (currentParcelas > 1 && totalChanged) {
      return Response.json({
        ok: false,
        requiresRecreate: true,
        reason: 'O Asaas não permite alterar o valor total de uma cobrança parcelada sem recriar as parcelas.',
      });
    }

    // Caso 3: Houve alteração na forma de pagamento (billingType).
    // O Asaas NÃO permite alterar a modalidade de uma cobrança já existente.
    if (billingTypeChanged) {
      const getLabel = (t: string) => {
        switch (t.toUpperCase()) {
          case 'BOLETO': return 'Boleto Bancário (com PIX)';
          case 'PIX': return 'PIX Direto';
          case 'CREDIT_CARD': return 'Cartão de Crédito';
          case 'UNDEFINED': return 'Fatura (Cliente escolhe)';
          default: return t;
        }
      };
      return Response.json({
        ok: false,
        requiresRecreate: true,
        reason: `A forma de pagamento foi alterada de "${getLabel(currentBillingType)}" para "${getLabel(newBillingType)}". O Asaas não permite alterar a forma de pagamento de uma cobrança já gerada sem cancelá-la e emitir uma nova.`,
      });
    }

    // Caso 3: Tentativa de alteração direta via API do Asaas.
    if (!order.external_payment_id) {
      return Response.json({
        ok: false,
        requiresRecreate: true,
        reason: 'Cobrança não possui ID externo do Asaas registrado localmente.',
      });
    }

    const updatesToAsaas: { dueDate?: string; value?: number; description?: string } = {};
    if (dueChanged) updatesToAsaas.dueDate = newDue;
    if (totalChanged && currentParcelas === 1) updatesToAsaas.value = newTotal;
    if (descChanged) updatesToAsaas.description = newDesc;

    if (Object.keys(updatesToAsaas).length === 0) {
      return Response.json({ ok: true, message: 'Nenhuma alteração detectada' });
    }

    const asaasRes = await updateAsaasPayment(order.external_payment_id, updatesToAsaas);

    if (!asaasRes.ok) {
      // O Asaas recusou a alteração direta (impedimento de negócio/bancário)
      logger.warn(
        { cotacaoId: id, orderId: order.id, error: asaasRes.error },
        'api.admin.cotacoes.cobranca.asaas_impediment'
      );
      return Response.json({
        ok: false,
        requiresRecreate: true,
        reason: asaasRes.error || 'O Asaas não permitiu alterar esta cobrança diretamente.',
      });
    }

    // Sucesso na alteração direta no Asaas -> Atualiza no banco local
    await sql`
      UPDATE payment_orders
      SET
        amount_total = ${newTotal},
        due_date = ${newDue},
        description = ${newDesc},
        updated_at = NOW()
      WHERE id = ${order.id}
    `;

    // Atualiza a parcela correspondente
    await sql`
      UPDATE payment_installments
      SET
        amount = ${newTotal},
        due_date = ${newDue},
        updated_at = NOW()
      WHERE payment_order_id = ${order.id} AND external_payment_id = ${order.external_payment_id}
    `;

    // Atualiza dados na cotação
    const [c] = await sql<Array<{ client_data: unknown }>>`
      SELECT client_data FROM cotacoes WHERE id = ${id} LIMIT 1
    `;
    if (c) {
      const clientData = parseJsonbField<Record<string, unknown>>(c.client_data);
      clientData.dataVencimento = newDue;
      if (currentParcelas === 1) {
        clientData.valor = newTotal;
      }
      await sql`
        UPDATE cotacoes
        SET
          status = CASE
            WHEN status IN ('aprovada', 'emitida') THEN status
            ELSE 'pagamento_gerado'
          END,
          client_data = ${JSON.stringify(clientData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    return Response.json({
      ok: true,
      recreated: false,
      message: 'Cobrança atualizada com sucesso no Asaas e no sistema!',
      dueDate: newDue,
      amountTotal: newTotal,
    });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.admin.cotacoes.cobranca.patch_failed');
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro interno ao atualizar cobrança',
      },
      { status: 500 }
    );
  }
}
