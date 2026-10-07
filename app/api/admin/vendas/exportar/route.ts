import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { PeriodPreset, resolveDateRange } from '@/lib/date-filters';
import { gerarVendasCSV, obterMapaPremioNetConfigurado, VendaExportRow } from '@/lib/vendas-csv';

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
  const user = await verifyAdminAuth();
  if (!user) return unauthorized();

  await ensureSchema();

  const searchParams = request.nextUrl.searchParams;
  const rawStatus = searchParams.get('status') || '';
  const status = statusLabel[rawStatus] ? rawStatus : '';
  const q = (searchParams.get('q') || '').trim().slice(0, 120);
  const productId = searchParams.get('productId') || '';
  const corretoraId = searchParams.get('corretoraId') || '';
  const partnerId = searchParams.get('partnerId') || '';
  const isRenewal = searchParams.get('isRenewal') || '';
  const rawPeriodPreset = searchParams.get('periodPreset') as PeriodPreset | null;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const periodPreset: PeriodPreset =
    (rawPeriodPreset as PeriodPreset) ?? (startDate || endDate ? 'custom' : '30d');

  const conditions = [];

  if (status) {
    conditions.push(sql`s.status = ${status}`);
  }
  if (productId) {
    conditions.push(sql`s.product_id = ${productId}`);
  }
  if (corretoraId) {
    conditions.push(sql`(s.corretora_id = ${corretoraId} OR p.corretora_id = ${corretoraId})`);
  }
  if (partnerId) {
    conditions.push(sql`s.partner_id = ${partnerId}`);
  }
  if (isRenewal === 'true' || isRenewal === 'sim') {
    conditions.push(
      sql`(c.is_renewal = true OR c.client_data->>'isRenovacao' = 'Sim' OR (c.client_data->>'renovacao')::text = 'true')`
    );
  } else if (isRenewal === 'false' || isRenewal === 'nao') {
    conditions.push(
      sql`(c.is_renewal = false AND (c.client_data->>'isRenovacao' IS NULL OR c.client_data->>'isRenovacao' != 'Sim') AND ((c.client_data->>'renovacao')::text IS NULL OR (c.client_data->>'renovacao')::text != 'true'))`
    );
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
        OR p.razao_social ILIKE ${textLike}
        OR c.client_cpf_cnpj ILIKE ${textLike}
        OR regexp_replace(COALESCE(c.client_cpf_cnpj, ''), '\\D', '', 'g') ILIKE ${digitsLike}
        OR regexp_replace(COALESCE(s.policy_number, ''), '\\D', '', 'g') ILIKE ${digitsLike}
      )`);
    } else {
      conditions.push(sql`(
        c.client_name ILIKE ${textLike}
        OR s.policy_number ILIKE ${textLike}
        OR p.razao_social ILIKE ${textLike}
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
      COALESCE(s.metadata->>'source', 'duolife') AS source,
      s.issue_date,
      s.expiry_date,
      s.created_at,
      COALESCE(p.razao_social, 'Sem parceiro') AS partner_name,
      pr.name AS product_name,
      c.client_name,
      c.client_cpf_cnpj,
      c.client_data,
      c.is_renewal
    FROM sales s
    JOIN products pr ON pr.id = s.product_id
    JOIN cotacoes c ON c.id = s.cotacao_id
    LEFT JOIN partners p ON p.id = s.partner_id
    WHERE ${where}
    ORDER BY s.created_at DESC
  `;

  const netMap = await obterMapaPremioNetConfigurado();
  const csv = gerarVendasCSV(vendas, netMap);
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
