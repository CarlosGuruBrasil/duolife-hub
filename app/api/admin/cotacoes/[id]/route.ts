import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized, isDevUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

// Exclusão em cascata restrita ao perfil dev — existe só pra limpar cotações de teste/diagnóstico
// (não expor pra parceiros nem pra admin comum: cotação real não deve ser apagável, só cancelável).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) {
    return Response.json({ error: 'Exclusão de cotação é exclusiva do perfil dev' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await sql.begin(async (tx) => {
      const [cotacao] = await tx`SELECT id, client_id FROM cotacoes WHERE id = ${id}`;
      if (!cotacao) return null;

      await tx`DELETE FROM payment_installments WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM payment_orders WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM signature_documents WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM cupom_uso_eventos WHERE cotacao_id = ${id}`;
      await tx`DELETE FROM webhook_events WHERE external_id IN (
        SELECT external_document_id FROM signature_documents WHERE cotacao_id = ${id}
      )`;
      await tx`UPDATE cotacoes SET renewed_from_cotacao_id = NULL WHERE renewed_from_cotacao_id = ${id}`;
      await tx`DELETE FROM cotacoes WHERE id = ${id}`;

      // Cliente segurado só é removido se não sobrar nenhuma outra cotação apontando pra ele
      // (o mesmo CPF pode ter várias cotações reais ao longo do tempo).
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

    if (!result) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    logger.warn({ cotacaoId: id, adminId: admin.userId, clientRemoved: result.clientRemoved }, 'admin.cotacoes.deleted');
    return Response.json({ ok: true, deletedClient: result.clientRemoved });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'admin.cotacoes.delete.failed');
    return Response.json({ error: 'Erro interno ao excluir cotação' }, { status: 500 });
  }
}
