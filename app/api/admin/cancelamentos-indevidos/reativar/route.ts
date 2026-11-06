import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { reativarCobrancaFaltante } from '@/lib/cancelamentos-indevidos-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ReativarBody {
  cotacaoId?: string;
  cotacaoIds?: string[];
  dueDateOverride?: string;
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = (await req.json().catch(() => ({}))) as ReativarBody;

    // Processamento em lote
    if (Array.isArray(body.cotacaoIds) && body.cotacaoIds.length > 0) {
      const results: any[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (const cId of body.cotacaoIds) {
        if (!cId || !cId.trim()) continue;
        const res = await reativarCobrancaFaltante({
          cotacaoId: cId.trim(),
          dueDateOverride: body.dueDateOverride,
        });

        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
        }
        results.push(res);
      }

      return Response.json({
        ok: true,
        batch: true,
        total: body.cotacaoIds.length,
        successCount,
        errorCount,
        results,
      });
    }

    // Processamento individual
    if (!body.cotacaoId || !body.cotacaoId.trim()) {
      return Response.json(
        { ok: false, error: 'Informe cotacaoId ou cotacaoIds no payload.' },
        { status: 400 }
      );
    }

    const result = await reativarCobrancaFaltante({
      cotacaoId: body.cotacaoId.trim(),
      dueDateOverride: body.dueDateOverride,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error || 'Falha ao reativar cobrança' },
        { status: 400 }
      );
    }

    return Response.json(result);
  } catch (err: any) {
    logger.error({ err }, 'api.admin.cancelamentos_indevidos.reativar_failed');
    return Response.json(
      { ok: false, error: 'Erro interno ao reativar cobrança residual' },
      { status: 500 }
    );
  }
}
