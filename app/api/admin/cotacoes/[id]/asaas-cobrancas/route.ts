import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { listAsaasChargesForClient } from '@/lib/asaas-charges';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Cobranças do cliente direto no Asaas (tempo real).
 *
 * Resolve o cliente por `customerId` (cus_xxx) vindo da cotação, da ordem de
 * pagamento ou do cadastro do segurado, e também pelo CPF/CNPJ — o que cobre
 * os registros importados do Wix, em que o `customerId` nem sempre veio.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;

  try {
    const [cotacao] = await sql<
      Array<{ id: string; client_cpf_cnpj: string | null; client_data: unknown; client_id: string | null }>
    >`
      SELECT id, client_cpf_cnpj, client_data, client_id
      FROM cotacoes
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!cotacao) {
      return Response.json({ ok: false, error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);

    const [order] = await sql<Array<{ provider_customer_id: string | null; external_payment_id: string | null }>>`
      SELECT provider_customer_id, external_payment_id
      FROM payment_orders
      WHERE cotacao_id = ${id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    let clientMetaCustomerId: string | null = null;
    if (cotacao.client_id) {
      const [client] = await sql<Array<{ metadata: unknown }>>`
        SELECT metadata FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
      `;
      if (client) {
        const meta = parseJsonbField<Record<string, unknown>>(client.metadata);
        clientMetaCustomerId =
          typeof meta.asaasCustomerId === 'string' ? meta.asaasCustomerId : null;
      }
    }

    const result = await listAsaasChargesForClient({
      customerIds: [
        typeof clientData.clienteId === 'string' ? clientData.clienteId : null,
        typeof clientData.asaasCustomerId === 'string' ? clientData.asaasCustomerId : null,
        order?.provider_customer_id ?? null,
        clientMetaCustomerId,
      ],
      cpfCnpj: cotacao.client_cpf_cnpj,
    });

    // Identificadores desta cotação, para destacar as cobranças dela na lista.
    const currentIds = [
      typeof clientData.checkoutId === 'string' ? clientData.checkoutId : null,
      order?.external_payment_id ?? null,
    ].filter((v): v is string => !!v);

    return Response.json({ ...result, currentIds });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.admin.cotacoes.asaas_cobrancas.failed');
    return Response.json(
      { ok: false, error: 'Erro ao consultar cobranças no Asaas' },
      { status: 500 }
    );
  }
}
