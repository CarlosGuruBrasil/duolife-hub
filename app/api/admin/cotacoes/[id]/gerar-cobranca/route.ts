import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { generateAsaasPaymentForQuote, GeneratePaymentCustomValues } from '@/lib/asaas-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface GerarCobrancaBody {
  valorTotal?: number;
  qtdParcelas?: number;
  dueDate?: string;
  billingType?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED' | string;
  description?: string;
  forceRecreate?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) {
    return Response.json({ ok: false, error: 'ID da cotação não informado' }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as GerarCobrancaBody;

    const customValues: GeneratePaymentCustomValues = {};

    if (body.valorTotal !== undefined && body.valorTotal > 0) {
      customValues.valorTotal = Number(body.valorTotal);
    }
    if (body.qtdParcelas !== undefined && body.qtdParcelas > 0) {
      customValues.qtdParcelas = Math.floor(Number(body.qtdParcelas));
    }
    if (body.dueDate && typeof body.dueDate === 'string') {
      customValues.dueDate = body.dueDate.trim().slice(0, 10);
    }
    if (body.billingType) {
      const bt = String(body.billingType).toUpperCase();
      if (['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED'].includes(bt)) {
        customValues.billingType = bt;
      }
    } else {
      customValues.billingType = 'UNDEFINED';
    }
    if (body.description && typeof body.description === 'string') {
      customValues.description = body.description.trim();
    }

    const hasCustomValues = Object.keys(customValues).length > 0;

    const result = await generateAsaasPaymentForQuote(id, {
      isManualAdmin: true,
      customValues: hasCustomValues ? customValues : undefined,
      forceRecreate: Boolean(body.forceRecreate),
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error || 'Falha ao emitir cobrança no Asaas',
          alreadyExisted: result.alreadyExisted,
          checkoutId: result.checkoutId,
          linkBoleto: result.linkBoleto,
          dueDate: result.dueDate,
        },
        { status: 400 }
      );
    }

    // Garante atomicamente que o status da cotação seja atualizado para 'pagamento_gerado'
    await sql`
      UPDATE cotacoes
      SET
        status = CASE
          WHEN status IN ('aprovada', 'emitida') THEN status
          ELSE 'pagamento_gerado'
        END,
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return Response.json({
      ok: true,
      checkoutId: result.checkoutId,
      linkBoleto: result.linkBoleto,
      dueDate: result.dueDate,
      netValue: result.netValue,
      alreadyExisted: result.alreadyExisted,
    });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.admin.cotacoes.gerar_cobranca.failed');
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro interno ao processar cobrança Asaas',
      },
      { status: 500 }
    );
  }
}
