import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from './auth';
import { getAccessibleQuoteById } from './access';
import { sql } from './pg';
import { logger } from './logger';
import { gerarContratoPdfBuffer } from './pdf-contract-generator';

export async function handlePreviewContratoPdf(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
): Promise<Response> {
  const { id } = await paramsPromise;
  const publicToken = req.headers.get('x-public-token') || req.nextUrl.searchParams.get('token');
  const isDownload = req.nextUrl.searchParams.get('download') === 'true';

  try {
    let cotacao = null;

    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id FROM public_sale_links
        WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `;
      if (!link) {
        return new Response('Token público inválido ou expirado', { status: 401 });
      }

      const [found] = await sql`
        SELECT * FROM cotacoes
        WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${link.partner_id}
        LIMIT 1
      `;
      cotacao = found;
    } else {
      const user = await verifyAuth();
      if (!user) return unauthorized();

      cotacao = await getAccessibleQuoteById(id, user);
    }

    if (!cotacao) {
      return new Response('Cotação não encontrada ou acesso negado', { status: 404 });
    }

    // Gera o PDF sob demanda com os dados e a logo da corretora
    const pdfData = await gerarContratoPdfBuffer(cotacao.id);

    const disposition = isDownload ? 'attachment' : 'inline';

    return new Response(new Uint8Array(pdfData.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${pdfData.docName}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    logger.error({ err, id }, 'api.cotacoes.preview-contrato-pdf.failed');
    return new Response('Erro ao gerar prévia do contrato em PDF', { status: 500 });
  }
}
