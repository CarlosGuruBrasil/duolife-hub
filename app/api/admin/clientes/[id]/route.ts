import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized, isDevUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { deleteAsaasPayment } from '@/lib/asaas-charges';

const PAID_STATUSES = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

// Exclusão completa de cliente em cascata restrita ao perfil Desenvolvedor
// Regra: Caso exclua o cliente, exclui também todas as cotações e cobranças.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) {
    return Response.json(
      { error: 'Exclusão de cliente é exclusiva do perfil Desenvolvedor' },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'ID do cliente não informado' }, { status: 400 });
  }

  try {
    const [client] = await sql<Array<{ id: string; document_number: string; full_name: string }>>`
      SELECT id, document_number, full_name
      FROM insurance_clients
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!client) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // 1. Busca todas as cotações do cliente (por id ou documento)
    const quoteRows = await sql<Array<{ id: string }>>`
      SELECT id FROM cotacoes
      WHERE client_id = ${id}
         OR (client_cpf_cnpj = ${client.document_number} AND ${client.document_number} != '')
    `;
    const quoteIds = quoteRows.map((q) => q.id);

    // 2. Busca todas as parcelas e ordens (pelas cotações ou diretamente pelo client_id)
    const installmentRows = await sql<Array<{
      id: string;
      external_payment_id: string;
      status: string;
    }>>`
      SELECT id, external_payment_id, status
      FROM payment_installments
      WHERE client_id = ${id}
        ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
    `;

    const orderRows = await sql<Array<{
      id: string;
      external_payment_id: string | null;
      status: string;
    }>>`
      SELECT id, external_payment_id, status
      FROM payment_orders
      WHERE client_id = ${id}
        ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
    `;

    // 3. Cancela cobranças NÃO PAGAS no Asaas
    const externalIdsToCancel = new Set<string>();
    for (const inst of installmentRows) {
      if (inst.external_payment_id && !PAID_STATUSES.includes(inst.status)) {
        externalIdsToCancel.add(inst.external_payment_id);
      }
    }
    for (const ord of orderRows) {
      if (ord.external_payment_id && !PAID_STATUSES.includes(ord.status)) {
        externalIdsToCancel.add(ord.external_payment_id);
      }
    }

    for (const extId of externalIdsToCancel) {
      try {
        await deleteAsaasPayment(extId);
      } catch (asaasErr) {
        logger.warn({ asaasErr, extId, clientId: id }, 'admin.clientes.delete.asaas_cancel_warn');
      }
    }

    // 4. Transação atômica de exclusão de todas as entidades dependentes
    await sql.begin(async (tx) => {
      // a) Notificações de inadimplência
      await tx`
        DELETE FROM delinquency_notifications
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;

      // b) Notificações de renovação
      await tx`
        DELETE FROM policy_renewal_notifications
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;

      // c) Comissões e vendas (apólices)
      const sales = await tx<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;
      const saleIds = sales.map((s) => s.id);
      if (saleIds.length > 0) {
        await tx`DELETE FROM commissions WHERE sale_id IN ${sql(saleIds)}`;
        await tx`DELETE FROM sales WHERE id IN ${sql(saleIds)}`;
      }

      // d) Parcelas e ordens de pagamento
      await tx`
        DELETE FROM payment_installments
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;
      await tx`
        DELETE FROM payment_orders
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;

      // e) Documentos de assinatura e eventos de webhook
      const sigDocs = await tx<Array<{ external_document_id: string | null }>>`
        SELECT external_document_id FROM signature_documents
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;
      const extDocIds = sigDocs
        .map((d) => d.external_document_id)
        .filter((d): d is string => !!d);

      if (extDocIds.length > 0) {
        await tx`DELETE FROM webhook_events WHERE external_id IN ${sql(extDocIds)}`;
      }

      await tx`
        DELETE FROM signature_documents
        WHERE client_id = ${id}
          ${quoteIds.length > 0 ? sql`OR cotacao_id IN ${sql(quoteIds)}` : sql``}
      `;

      // f) Cupons promocionais vinculados às cotações
      if (quoteIds.length > 0) {
        await tx`DELETE FROM cupom_uso_eventos WHERE cotacao_id IN ${sql(quoteIds)}`;
      }

      // g) Desvincula renovações que apontavam para cotações deste cliente
      if (quoteIds.length > 0) {
        await tx`
          UPDATE cotacoes
          SET renewed_from_cotacao_id = NULL
          WHERE renewed_from_cotacao_id IN ${sql(quoteIds)}
        `;
      }

      // h) Exclui todas as cotações
      if (quoteIds.length > 0) {
        await tx`DELETE FROM cotacoes WHERE id IN ${sql(quoteIds)}`;
      }

      // i) Exclui o cliente de insurance_clients
      await tx`DELETE FROM insurance_clients WHERE id = ${id}`;
    });

    logger.warn(
      {
        clientId: id,
        clientName: client.full_name,
        adminId: admin.userId,
        deletedQuotesCount: quoteIds.length,
        deletedInstallmentsCount: installmentRows.length,
        canceledAsaasChargesCount: externalIdsToCancel.size,
      },
      'admin.clientes.cascade_deleted'
    );

    return Response.json({
      ok: true,
      deletedClientId: id,
      deletedQuotesCount: quoteIds.length,
      deletedInstallmentsCount: installmentRows.length,
      canceledAsaasChargesCount: externalIdsToCancel.size,
    });
  } catch (err) {
    logger.error({ err, clientId: id }, 'admin.clientes.delete.failed');
    return Response.json({ error: 'Erro interno ao excluir cliente' }, { status: 500 });
  }
}
