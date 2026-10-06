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
        comprovante_bancario_base64,
        comprovante_bancario_mime_type,
        comprovante_bancario_nome_arquivo,
        nome_fantasia
      FROM corretoras
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!corretora || !corretora.comprovante_bancario_base64) {
      return new Response('Comprovante Bancário não anexado ou não encontrado', { status: 404 });
    }

    const cleanBase64 = corretora.comprovante_bancario_base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const mime = corretora.comprovante_bancario_mime_type || 'application/pdf';
    const filename = corretora.comprovante_bancario_nome_arquivo || `comprovante-bancario-${corretora.nome_fantasia || id}.pdf`;

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
    logger.error({ err, corretoraId: id }, 'admin.corretora.comprovante_bancario.failed');
    return new Response('Erro interno ao buscar Comprovante Bancário', { status: 500 });
  }
}
