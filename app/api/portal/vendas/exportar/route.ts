import { NextRequest } from 'next/server';
import { getPartnerAccessContext, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { gerarVendasCSV, VendaExportRow } from '@/lib/vendas-csv';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  ativa: 'Ativa',
  active: 'Ativa',
  cancelada: 'Cancelada',
  cancelled: 'Cancelada',
  expirada: 'Expirada',
  expired: 'Expirada',
  suspensa: 'Suspensa',
  suspended: 'Suspensa',
};

export async function GET(request: NextRequest) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  const access = await getPartnerAccessContext(user);
  if (!access) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 });
  }

  await ensureSchema();

  const isCorretora = Boolean(access.isCorretoraUser && access.corretoraId);

  const searchParams = request.nextUrl.searchParams;
  const rawStatus = searchParams.get('status') || '';
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (searchParams.get('q') || '').trim().slice(0, 120);
  const productId = searchParams.get('productId') || '';
  const rawPeriodPreset = searchParams.get('periodPreset') as PeriodPreset | null;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const periodPreset: PeriodPreset =
    (rawPeriodPreset as PeriodPreset) ?? (startDate || endDate ? 'custom' : '30d');

  // Cláusulas de controle de acesso do parceiro/corretora
  const conditions = [];

  if (isCorretora) {
    conditions.push(sql`s.corretora_id = ${access.corretoraId}`);
  } else if (access.visibleUserIds === null) {
    conditions.push(sql`s.partner_id = ${access.partnerId}`);
  } else if (access.visibleUserIds.length > 0) {
    conditions.push(
      sql`(s.partner_id = ${access.partnerId} AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL))`
    );
  } else {
    conditions.push(sql`(s.partner_id = ${access.partnerId} AND c.partner_user_id IS NULL)`);
  }

  // Filtros dinâmicos
  if (status) {
    conditions.push(sql`s.status = ${status}`);
  }
  if (productId) {
    conditions.push(sql`s.product_id = ${productId}`);
  }

  const { start, end } = resolveDateRange(periodPreset, startDate, endDate);
  if (start) conditions.push(sql`s.created_at >= ${start}::timestamptz`);
  if (end) conditions.push(sql`s.created_at <= ${end}::timestamptz`);

  if (q) {
    const textLike = `%${q.replace(/([\\%_])/g, '\\$1')}%`;
    const digitsOnly = q.replace(/\D/g, '');
    if (digitsOnly.length >= 3) {
      const digitsLike = `%${digitsOnly.replace(/([\\%_])/g, '\\$1')}%`;
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR regexp_replace(COALESCE(c.client_cpf_cnpj, ''), '\\D', '', 'g') ILIKE ${digitsLike}
        OR regexp_replace(COALESCE(s.policy_number, ''), '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
      )`);
    }
  }

  const where =
    conditions.length > 0
      ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
      : sql`TRUE`;

  const vendas = await sql<VendaExportRow[]>`
    SELECT
      s.id,
      s.cotacao_id,
      s.policy_number,
      COALESCE(s.importancia_segurada, c.importancia_segurada) AS importancia_segurada,
      s.premio_total,
      s.commission_rate,
      s.commission_amount,
      s.status,
      s.issue_date,
      s.expiry_date,
      s.created_at,
      s.product_id,
      p.name AS product_name,
      c.client_name,
      c.client_cpf_cnpj,
      c.client_data,
      c.is_renewal,
      pt.razao_social AS partner_name
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners pt ON pt.id = s.partner_id
    WHERE ${where}
    ORDER BY s.issue_date DESC, s.created_at DESC
  `;

  const csv = gerarVendasCSV(vendas);
  const dataHoje = new Date().toISOString().slice(0, 10);
  const filename = `relatorio-vendas-${dataHoje}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
