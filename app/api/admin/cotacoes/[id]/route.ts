import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized, isDevUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { deleteAsaasPayment } from '@/lib/asaas-charges';

const PAID_STATUSES = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

// Exclusão em cascata restrita ao perfil dev — existe só pra limpar cotações de teste/diagnóstico
// (não expor pra parceiros nem pra admin comum: cotação real não deve ser apagável, só cancelável).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) {
    return Response.json({ error: 'Exclusão de cotação é exclusiva do perfil Desenvolvedor' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'ID da cotação não informado' }, { status: 400 });
  }

  try {
    const [cotacao] = await sql`SELECT id, client_id, status FROM cotacoes WHERE id = ${id}`;
    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    // 1. Busca todas as parcelas e ordens desta cotação
    const installments = await sql<Array<{
      id: string;
      external_payment_id: string;
      status: string;
    }>>`
      SELECT id, external_payment_id, status
      FROM payment_installments
      WHERE cotacao_id = ${id}
    `;

    const orders = await sql<Array<{
      id: string;
      external_payment_id: string | null;
      status: string;
    }>>`
      SELECT id, external_payment_id, status
      FROM payment_orders
      WHERE cotacao_id = ${id}
    `;

    // 2. Opção 1: Verifica se existe alguma cobrança PAGA nesta cotação
    const hasPaidInstallment = installments.some((i) => PAID_STATUSES.includes(i.status));
    const hasPaidOrder = orders.some((o) => PAID_STATUSES.includes(o.status));

    if (hasPaidInstallment || hasPaidOrder) {
      return Response.json(
        {
          error: 'Não é possível excluir esta cotação pois ela possui cobranças que já foram compensadas/pagas. Para remover o registro completo, utilize a exclusão direta do cliente.',
        },
        { status: 400 }
      );
    }

    // 3. Cancela cobranças não pagas no Asaas
    const externalIds = new Set<string>();
    for (const inst of installments) {
      if (inst.external_payment_id && !PAID_STATUSES.includes(inst.status)) {
        externalIds.add(inst.external_payment_id);
      }
    }
    for (const ord of orders) {
      if (ord.external_payment_id && !PAID_STATUSES.includes(ord.status)) {
        externalIds.add(ord.external_payment_id);
      }
    }

    for (const extId of externalIds) {
      try {
        await deleteAsaasPayment(extId);
      } catch (asaasErr) {
        logger.warn({ asaasErr, extId, cotacaoId: id }, 'admin.cotacoes.delete.asaas_cancel_warn');
      }
    }

    // 4. Executa a exclusão em cascata atômica no PostgreSQL
    const result = await sql.begin(async (tx) => {
      // Remove notificações
      await tx`DELETE FROM delinquency_notifications WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM policy_renewal_notifications WHERE cotacao_id = ${id}`;

      // Remove comissões e vendas se houver
      const sales = await tx<Array<{ id: string }>>`SELECT id FROM sales WHERE cotacao_id = ${id}`;
      for (const sale of sales) {
        await tx`DELETE FROM commissions WHERE sale_id = ${sale.id}`;
      }
      await tx`DELETE FROM sales WHERE cotacao_id = ${id}`;

      // Remove parcelas e ordens de pagamento
      await tx`DELETE FROM payment_installments WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM payment_orders WHERE cotacao_id = ${id}`;

      // Remove eventos de webhook e documentos ZapSign
      await tx`DELETE FROM webhook_events WHERE external_id IN (
        SELECT external_document_id FROM signature_documents WHERE cotacao_id = ${id}
      )`;
      await tx`DELETE FROM signature_documents WHERE cotacao_id = ${id}`;

      // Remove usos de cupom
      await tx`DELETE FROM cupom_uso_eventos WHERE cotacao_id = ${id}`;

      // Desvincula renovações
      await tx`UPDATE cotacoes SET renewed_from_cotacao_id = NULL WHERE renewed_from_cotacao_id = ${id}`;

      // Exclui a cotação
      await tx`DELETE FROM cotacoes WHERE id = ${id}`;

      // Cliente segurado só é removido se não sobrar nenhuma outra cotação apontando pra ele
      let clientRemoved = false;
      if (cotacao.client_id) {
        const [{ count }] = await tx`SELECT COUNT(*)::int AS count FROM cotacoes WHERE client_id = ${cotacao.client_id}`;
        if (Number(count) === 0) {
          await tx`DELETE FROM insurance_clients WHERE id = ${cotacao.client_id}`;
          clientRemoved = true;
        }
      }

      return { clientRemoved };
    });

    logger.warn(
      { cotacaoId: id, adminId: admin.userId, clientRemoved: result.clientRemoved, canceledCharges: externalIds.size },
      'admin.cotacoes.deleted'
    );

    return Response.json({
      ok: true,
      deletedClient: result.clientRemoved,
      canceledChargesCount: externalIds.size,
    });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'admin.cotacoes.delete.failed');
    return Response.json({ error: 'Erro interno ao excluir cotação' }, { status: 500 });
  }
}
