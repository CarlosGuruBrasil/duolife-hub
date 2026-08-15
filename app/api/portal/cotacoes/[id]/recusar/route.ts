import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    const cotacao = await getAccessibleQuoteById(id, user);
    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    if (ESTADOS_TERMINAIS.includes(cotacao.status)) {
      return Response.json({ error: `Cotação já está em estado final (${cotacao.status})` }, { status: 422 });
    }

    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === 'string' ? body.motivo.slice(0, 500) : null;

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    clientData.recusadoEm = new Date().toISOString();
    clientData.recusadoMotivo = motivo;
    clientData.recusadoPor = user.userId;

    await sql`
      UPDATE cotacoes
      SET status = 'recusada', client_data = ${JSON.stringify(clientData)}::jsonb, updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    logger.info({ cotacaoId: cotacao.id, userId: user.userId }, 'api.portal.cotacoes.recusar');
    return Response.json({ ok: true, status: 'recusada' });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.portal.cotacoes.recusar.failed');
    return Response.json({ error: 'Erro interno ao recusar cotação' }, { status: 500 });
  }
}
