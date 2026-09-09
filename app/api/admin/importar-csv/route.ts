import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { processCsvRowsBatch, parseCsvContent, type RawCsvRow } from '@/lib/csv-import';
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
    let rows: RawCsvRow[] = [];
    let startingRowIndex = body.startingRowIndex || 1;

    if (Array.isArray(body.rows) && body.rows.length > 0) {
      rows = body.rows;
    } else if (typeof body.csvText === 'string' && body.csvText.trim()) {
      const parsed = parseCsvContent(body.csvText);
      rows = parsed.rows;
    } else {
      return Response.json(
        { error: 'Nenhum dado CSV ou lista de linhas fornecida para importação.' },
        { status: 400 }
      );
    }

    const result = await processCsvRowsBatch(rows, { startingRowIndex });

    logger.info({
      adminId: admin.userId,
      adminEmail: admin.email,
      rowsCount: rows.length,
      clientsCreated: result.clientsCreated,
      salesCreated: result.salesCreated,
      errorsCount: result.errorsCount,
    }, 'admin.csv_import.batch_completed');

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao processar importação do CSV';
    logger.error({ err, adminId: admin.userId }, 'admin.csv_import.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
