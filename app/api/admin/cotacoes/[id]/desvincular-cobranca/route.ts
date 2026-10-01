import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Desvincula cobrança da cotação no banco local.
 * Utilizado para expurgar cobranças históricas ou indevidamente vinculadas,
 * permitindo que a cotação retorne ao seu estado correto para emissão da cobrança legítima.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) {
    return Response.json({ ok: false, error: 'ID da cotação não informado' }, { status: 400 });
  }

  try {
    const [cotacao] = await sql<Array<{ id: string; status: string; client_data: unknown }>>`
      SELECT id, status, client_data
      FROM cotacoes
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!cotacao) {
      return Response.json({ ok: false, error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);

    await sql.begin(async (tx) => {
      // 1. Remove notificações vinculadas
      await tx`
        DELETE FROM delinquency_notifications
        WHERE cotacao_id = ${id}
           OR payment_order_id IN (SELECT id FROM payment_orders WHERE cotacao_id = ${id})
      `;

      // 2. Remove parcelas locais
      await tx`DELETE FROM payment_installments WHERE cotacao_id = ${id}`;

      // 3. Remove ordem de pagamento
      await tx`DELETE FROM payment_orders WHERE cotacao_id = ${id}`;

      // 4. Remove venda espúria caso não possua apólice oficial emitida
      await tx`
        DELETE FROM sales
        WHERE cotacao_id = ${id}
          AND (policy_number IS NULL OR policy_number LIKE 'PRE-%')
      `;

      // 5. Limpa referências no client_data
      delete clientData.checkoutId;
      delete clientData.linkBoleto;
      delete clientData.dataVencimento;
      delete clientData.faturaId;
      delete clientData.externalInstallmentId;
      delete clientData.paidAt;
      delete clientData.pagoEm;

      // 6. Restaura status da cotação
      const [sigDoc] = await tx<Array<{ status: string }>>`
        SELECT status FROM signature_documents
        WHERE cotacao_id = ${id} AND status = 'signed'
        LIMIT 1
      `;

      const restoredStatus = sigDoc
        ? 'assinado'
        : (['aprovada', 'emitida', 'pagamento_gerado'].includes(cotacao.status) ? 'contrato_gerado' : cotacao.status);

      await tx`
        UPDATE cotacoes
        SET status = ${restoredStatus},
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
        WHERE id = ${id}
      `;
    });

    logger.warn({ cotacaoId: id, adminId: admin.userId }, 'admin.cotacoes.desvincular_cobranca.success');

    return Response.json({
      ok: true,
      message: 'Cobrança desvinculada com sucesso. A cotação está liberada para emissão da cobrança correta.',
    });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'admin.cotacoes.desvincular_cobranca.failed');
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno ao desvincular cobrança' },
      { status: 500 }
    );
  }
}
