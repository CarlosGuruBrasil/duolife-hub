import { NextRequest } from 'next/server';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; tipo: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return new Response('Acesso negado', { status: 403 });
  }

  const { id, tipo } = await params;

  try {
    await ensureSchema();

    const [corretora] = await sql`
      SELECT
        nome_fantasia,
        socio_nome,
        contrato_social_base64,
        contrato_social_mime_type,
        contrato_social_nome_arquivo,
        cartao_cnpj_base64,
        cartao_cnpj_mime_type,
        cartao_cnpj_nome_arquivo,
        socio_documento_base64,
        socio_documento_mime_type,
        socio_documento_nome_arquivo,
        comprovante_bancario_base64,
        comprovante_bancario_mime_type,
        comprovante_bancario_nome_arquivo
      FROM corretoras
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!corretora) {
      return new Response('Corretora não encontrada', { status: 404 });
    }

    let rawBase64: string | null = null;
    let mime: string | null = null;
    let filename: string | null = null;

    if (tipo === 'contrato-social') {
      rawBase64 = corretora.contrato_social_base64;
      mime = corretora.contrato_social_mime_type || 'application/pdf';
      filename = corretora.contrato_social_nome_arquivo || `contrato-social-${corretora.nome_fantasia || id}.pdf`;
    } else if (tipo === 'cartao-cnpj') {
      rawBase64 = corretora.cartao_cnpj_base64;
      mime = corretora.cartao_cnpj_mime_type || 'application/pdf';
      filename = corretora.cartao_cnpj_nome_arquivo || `cartao-cnpj-${corretora.nome_fantasia || id}.pdf`;
    } else if (tipo === 'socio-documento' || tipo === 'documento-socio') {
      rawBase64 = corretora.socio_documento_base64;
      mime = corretora.socio_documento_mime_type || 'application/pdf';
      filename = corretora.socio_documento_nome_arquivo || `documento-socio-${corretora.socio_nome || corretora.nome_fantasia || id}.pdf`;
    } else if (tipo === 'comprovante-bancario') {
      rawBase64 = corretora.comprovante_bancario_base64;
      mime = corretora.comprovante_bancario_mime_type || 'application/pdf';
      filename = corretora.comprovante_bancario_nome_arquivo || `comprovante-bancario-${corretora.nome_fantasia || id}.pdf`;
    } else {
      return new Response('Tipo de documento inválido', { status: 400 });
    }

    if (!rawBase64) {
      return new Response('Documento não anexado ou não encontrado', { status: 404 });
    }

    const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const finalFilename = filename || `documento-${tipo}-${corretora.nome_fantasia || id}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime || 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(finalFilename)}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    logger.error({ err, corretoraId: id, tipo }, 'admin.corretora.documento.failed');
    return new Response('Erro interno ao buscar documento', { status: 500 });
  }
}
