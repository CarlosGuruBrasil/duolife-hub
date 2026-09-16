import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized, isDevUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { deleteAsaasPayment } from '@/lib/asaas-charges';

const PAID_STATUSES = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) {
    return Response.json(
      { error: 'Exclusão de boleto é exclusiva do perfil Desenvolvedor' },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'ID do boleto não informado' }, { status: 400 });
  }

  try {
    // 1. Busca parcela pelo ID interno ou pelo ID externo do Asaas
    const [installment] = await sql<Array<{
      id: string;
      payment_order_id: string;
      cotacao_id: string;
      external_payment_id: string;
      status: string;
      amount: string;
      installment_number: number;
    }>>`
      SELECT id, payment_order_id, cotacao_id, external_payment_id, status, amount, installment_number
      FROM payment_installments
      WHERE id = ${id} OR external_payment_id = ${id}
      LIMIT 1
    `;

    if (!installment) {
      // Tenta buscar se o ID fornecido foi de uma payment_order direta
      const [order] = await sql<Array<{
        id: string;
        cotacao_id: string;
        external_payment_id: string | null;
        status: string;
      }>>`
        SELECT id, cotacao_id, external_payment_id, status
        FROM payment_orders
        WHERE id = ${id} OR external_payment_id = ${id}
        LIMIT 1
      `;

      if (!order) {
        return Response.json({ error: 'Boleto/Cobrança não encontrada' }, { status: 404 });
      }

      if (PAID_STATUSES.includes(order.status)) {
        return Response.json(
          { error: 'Não é possível excluir uma cobrança que já foi compensada/paga.' },
          { status: 400 }
        );
      }

      // Se possui ID no Asaas, cancela no Asaas
      if (order.external_payment_id) {
        const asaasRes = await deleteAsaasPayment(order.external_payment_id);
        if (!asaasRes.ok) {
          return Response.json(
            { error: `Falha ao cancelar no Asaas: ${asaasRes.error}` },
            { status: 400 }
          );
        }
      }

      // Remove ordem e parcelas no banco
      await sql.begin(async (tx) => {
        await tx`DELETE FROM delinquency_notifications WHERE payment_order_id = ${order.id}`;
        await tx`DELETE FROM payment_installments WHERE payment_order_id = ${order.id}`;
        await tx`DELETE FROM payment_orders WHERE id = ${order.id}`;

        // Limpa cotação se apontava para essa cobrança
        const [c] = await tx`SELECT client_data, status FROM cotacoes WHERE id = ${order.cotacao_id}`;
        if (c) {
          const cd = typeof c.client_data === 'object' && c.client_data !== null
            ? (c.client_data as Record<string, unknown>)
            : {};
          delete cd.linkBoleto;
          delete cd.checkoutId;
          delete cd.faturaId;

          const newStatus = c.status === 'pagamento_gerado' ? 'assinado' : c.status;
          await tx`
            UPDATE cotacoes
            SET client_data = ${JSON.stringify(cd)}::jsonb,
                status = ${newStatus},
                updated_at = NOW()
            WHERE id = ${order.cotacao_id}
          `;
        }
      });

      logger.warn({ orderId: order.id, cotacaoId: order.cotacao_id, adminId: admin.userId }, 'admin.boletos.order_deleted');
      return Response.json({ ok: true, deletedOrderId: order.id });
    }

    // 2. Parcela encontrada: verifica se já foi paga
    if (PAID_STATUSES.includes(installment.status)) {
      return Response.json(
        { error: 'Não é possível excluir uma parcela que já foi compensada/paga.' },
        { status: 400 }
      );
    }

    // 3. Cancela cobrança no Asaas
    if (installment.external_payment_id) {
      const asaasRes = await deleteAsaasPayment(installment.external_payment_id);
      if (!asaasRes.ok) {
        return Response.json(
          { error: `Falha ao cancelar cobrança no Asaas: ${asaasRes.error}` },
          { status: 400 }
        );
      }
    }

    // 4. Executa limpeza no banco de dados local
    await sql.begin(async (tx) => {
      // Remove notificações associadas
      await tx`DELETE FROM delinquency_notifications WHERE installment_id = ${installment.id}`;

      // Remove parcela
      await tx`DELETE FROM payment_installments WHERE id = ${installment.id}`;

      // Verifica parcelas restantes na mesma ordem
      const remaining = await tx<Array<{ id: string; amount: string; status: string }>>`
        SELECT id, amount, status FROM payment_installments
        WHERE payment_order_id = ${installment.payment_order_id}
      `;

      if (remaining.length === 0) {
        // Se não restou nenhuma parcela, exclui a ordem completa
        await tx`DELETE FROM payment_orders WHERE id = ${installment.payment_order_id}`;

        // Limpa referências na cotação
        const [c] = await tx`SELECT client_data, status FROM cotacoes WHERE id = ${installment.cotacao_id}`;
        if (c) {
          const cd = typeof c.client_data === 'object' && c.client_data !== null
            ? (c.client_data as Record<string, unknown>)
            : {};
          delete cd.linkBoleto;
          delete cd.checkoutId;
          delete cd.faturaId;

          const newStatus = c.status === 'pagamento_gerado' ? 'assinado' : c.status;
          await tx`
            UPDATE cotacoes
            SET client_data = ${JSON.stringify(cd)}::jsonb,
                status = ${newStatus},
                updated_at = NOW()
            WHERE id = ${installment.cotacao_id}
          `;
        }
      } else {
        // Recalcula totais da ordem
        const newTotal = remaining.reduce((acc, r) => acc + parseFloat(r.amount || '0'), 0);
        await tx`
          UPDATE payment_orders
          SET installment_count = ${remaining.length},
              amount_total = ${newTotal},
              updated_at = NOW()
          WHERE id = ${installment.payment_order_id}
        `;
      }
    });

    logger.warn(
      { installmentId: installment.id, externalPaymentId: installment.external_payment_id, adminId: admin.userId },
      'admin.boletos.installment_deleted'
    );

    return Response.json({ ok: true, deletedInstallmentId: installment.id });
  } catch (err) {
    logger.error({ err, id }, 'admin.boletos.delete.failed');
    return Response.json(
      { error: 'Erro interno ao excluir boleto/cobrança' },
      { status: 500 }
    );
  }
}
