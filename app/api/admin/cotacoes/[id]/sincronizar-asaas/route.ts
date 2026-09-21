import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { reconcileAsaasForQuote } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;

  try {
    const result = await reconcileAsaasForQuote(id);
    return Response.json(result);
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.admin.cotacoes.sincronizar-asaas.failed');
    return Response.json({ ok: false, error: 'Erro ao sincronizar com o Asaas' }, { status: 500 });
  }
}
