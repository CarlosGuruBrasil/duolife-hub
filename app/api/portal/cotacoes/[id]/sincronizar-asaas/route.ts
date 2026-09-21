import { NextRequest } from 'next/server';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { reconcileAsaasForQuote } from '@/lib/asaas-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    const cotacao = await getAccessibleQuoteById(id, user);
    if (!cotacao) {
      return Response.json({ ok: false, error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const result = await reconcileAsaasForQuote(id);
    return Response.json(result);
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.portal.cotacoes.sincronizar-asaas.failed');
    return Response.json({ ok: false, error: 'Erro ao sincronizar com o Asaas' }, { status: 500 });
  }
}
