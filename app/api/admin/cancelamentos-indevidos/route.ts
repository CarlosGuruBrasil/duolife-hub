import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { listarCanceladosIndevidos } from '@/lib/cancelamentos-indevidos-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const items = await listarCanceladosIndevidos();

    const totalContratos = items.length;
    const totalValorContratado = items.reduce((acc, i) => acc + i.valorTotalContratado, 0);
    const totalValorPago = items.reduce((acc, i) => acc + i.totalPago, 0);
    const totalSaldoFaltante = items.reduce((acc, i) => acc + i.saldoFaltante, 0);
    const totalReativados = items.filter((i) => i.statusReativacao === 'reativado').length;
    const totalPendentes = items.filter((i) => i.statusReativacao === 'pendente').length;

    return Response.json({
      ok: true,
      kpis: {
        totalContratos,
        totalValorContratado,
        totalValorPago,
        totalSaldoFaltante,
        totalReativados,
        totalPendentes,
      },
      items,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.cancelamentos_indevidos.get_failed');
    return Response.json(
      { ok: false, error: 'Erro interno ao consultar cancelamentos indevidos' },
      { status: 500 }
    );
  }
}
