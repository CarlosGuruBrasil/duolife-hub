import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  if (!roleIsDev(admin.role)) {
    return Response.json(
      { error: 'Acesso permitido exclusivamente a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { confirm, includeLeads } = body as { confirm?: string; includeLeads?: boolean };

    if (confirm !== 'TRUNCAR') {
      return Response.json(
        { error: 'Confirmação inválida. Envie o campo confirm com o valor "TRUNCAR".' },
        { status: 400 }
      );
    }

    // 1. Contagem prévia para auditoria
    const [counts] = await sql<Array<{
      clients: string;
      quotes: string;
      sales: string;
      commissions: string;
      orders: string;
      installments: string;
    }>>`
      SELECT
        (SELECT COUNT(*)::text FROM insurance_clients) AS clients,
        (SELECT COUNT(*)::text FROM cotacoes) AS quotes,
        (SELECT COUNT(*)::text FROM sales) AS sales,
        (SELECT COUNT(*)::text FROM commissions) AS commissions,
        (SELECT COUNT(*)::text FROM payment_orders) AS orders,
        (SELECT COUNT(*)::text FROM payment_installments) AS installments
    `;

    // 2. Truncamento com integridade referencial preservada
    if (includeLeads) {
      await sql`
        TRUNCATE TABLE
          payment_installments,
          payment_orders,
          signature_documents,
          cupom_uso_eventos,
          commissions,
          sales,
          cotacoes,
          insurance_clients,
          leads
        CASCADE
      `;
    } else {
      await sql`
        TRUNCATE TABLE
          payment_installments,
          payment_orders,
          signature_documents,
          cupom_uso_eventos,
          commissions,
          sales,
          cotacoes,
          insurance_clients
        CASCADE
      `;
    }

    logger.warn({
      adminId: admin.userId,
      adminEmail: admin.email,
      includeLeads: Boolean(includeLeads),
      previousCounts: counts,
    }, 'admin.comparativo_wix.database_truncated');

    return Response.json({
      ok: true,
      message: 'Tabelas locais de clientes, cotações e vendas truncadas com sucesso.',
      cleared: {
        clients: Number(counts?.clients || 0),
        quotes: Number(counts?.quotes || 0),
        sales: Number(counts?.sales || 0),
        commissions: Number(counts?.commissions || 0),
        orders: Number(counts?.orders || 0),
        installments: Number(counts?.installments || 0),
        leadsIncluded: Boolean(includeLeads),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao truncar tabelas locais';
    logger.error({ err, adminId: admin.userId }, 'admin.comparativo_wix.truncate_failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
