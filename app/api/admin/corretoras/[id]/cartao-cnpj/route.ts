import { NextRequest } from 'next/server';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return new Response('Acesso negado', { status: 403 });
  }

  const { id } = await params;

  try {
    await ensureSchema();

    const [corretora] = await sql`
      SELECT
        cartao_cnpj_base64,
        cartao_cnpj_mime_type,
        cartao_cnpj_nome_arquivo,
        nome_fantasia
      FROM corretoras
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!corretora || !corretora.cartao_cnpj_base64) {
      return new Response('Cartão CNPJ não anexado ou não encontrado', { status: 404 });
    }

    const cleanBase64 = corretora.cartao_cnpj_base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const mime = corretora.cartao_cnpj_mime_type || 'application/pdf';
    const filename = corretora.cartao_cnpj_nome_arquivo || `cartao-cnpj-${corretora.nome_fantasia || id}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.cartao_cnpj.failed');
    return new Response('Erro interno ao buscar Cartão CNPJ', { status: 500 });
  }
}
