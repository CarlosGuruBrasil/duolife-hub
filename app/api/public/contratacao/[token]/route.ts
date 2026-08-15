import { NextRequest } from 'next/server';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig } from '@/lib/white-label';

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://duolife.com.br';
}

async function resolveLink(token: string) {
  const [link] = await sql`
    SELECT
      pl.id, pl.token, pl.partner_id, pl.product_id, pl.flow_type, pl.label, pl.status, pl.expires_at,
      pl.used_at, pl.metadata, pl.created_at,
      p.razao_social, p.nome_fantasia, p.email, p.phone, p.metadata AS partner_metadata,
      pr.name AS product_name, pr.code AS product_code
    FROM public_sale_links pl
    JOIN partners p ON p.id = pl.partner_id
    LEFT JOIN products pr ON pr.id = pl.product_id
    WHERE pl.token = ${token}
      AND pl.status = 'active'
      AND (pl.expires_at IS NULL OR pl.expires_at > NOW())
    LIMIT 1
  `;
  return link ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await ensureSchema();
    const { token } = await params;

    const link = await resolveLink(token);
    if (!link) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    return Response.json({
      link: {
        token: link.token,
        label: link.label,
        flowType: link.flow_type,
        partner: {
          id: link.partner_id,
          razaoSocial: link.razao_social,
          nomeFantasia: link.nome_fantasia,
          email: link.email,
          phone: link.phone,
          whiteLabel: getWhiteLabelConfig(link.partner_metadata),
        },
        product: link.product_id ? {
          id: link.product_id,
          name: link.product_name,
          code: link.product_code,
        } : null,
        url: `${appBaseUrl()}/contratar/${token}`,
        usedAt: link.used_at,
        expiresAt: link.expires_at,
      },
    });
  } catch (err) {
    logger.error({ err }, 'public.link.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ponytail: só existia um handler POST aqui, nunca chamado por nenhum client — o fluxo real de
// criação de cotação/contrato/pagamento passa inteiro por /api/cotacoes + gerar-contrato +
// gerar-pagamento (ver CotacaoFormRC.tsx). Removido pra não manter uma segunda implementação
// divergente e nunca testada — reintroduzir só se um caller real vier a precisar dele.
