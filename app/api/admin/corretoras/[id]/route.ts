import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig, mergeWhiteLabelConfig } from '@/lib/white-label';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;

  try {
    await ensureSchema();

    const [corretora] = await sql`
      SELECT
        c.id,
        c.razao_social,
        c.nome_fantasia,
        c.cnpj,
        c.susep,
        c.email,
        c.phone,
        c.address,
        c.status,
        c.metadata,
        c.logo_base64,
        c.logo_mime_type,
        c.banco,
        c.agencia,
        c.conta,
        c.pix_tipo_chave,
        c.pix_chave,
        c.contrato_social_mime_type,
        c.contrato_social_nome_arquivo,
        c.contrato_social_uploaded_at,
        (c.contrato_social_base64 IS NOT NULL) AS has_contrato_social,
        c.created_at,
        c.updated_at
      FROM corretoras c
      WHERE c.id = ${id}
      LIMIT 1
    `;

    if (!corretora) {
      return Response.json({ error: 'Corretora não encontrada' }, { status: 404 });
    }

    const parceiros = await sql`
      SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, status, created_at
      FROM partners
      WHERE corretora_id = ${id}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const stats = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM partners WHERE corretora_id = ${id}) AS total_parceiros,
        (SELECT COUNT(*)::int FROM cotacoes WHERE corretora_id = ${id}) AS total_cotacoes,
        (SELECT COUNT(*)::int FROM sales WHERE corretora_id = ${id}) AS total_vendas,
        (SELECT COALESCE(SUM(premio_total), 0)::numeric FROM sales WHERE corretora_id = ${id}) AS volume_vendas
    `;

    const whiteLabel = getWhiteLabelConfig(corretora.metadata);
    if (corretora.logo_base64 && corretora.logo_mime_type && !whiteLabel.logoUrl) {
      whiteLabel.logoUrl = `data:${corretora.logo_mime_type};base64,${corretora.logo_base64}`;
    }

    return Response.json({
      corretora: {
        ...corretora,
        whiteLabel,
      },
      parceiros,
      stats: stats[0] || {},
      canManage: isPlatformAdmin(admin),
    });
  } catch (err) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const updateCorretoraSchema = z.object({
  razao_social: z.string().trim().min(2).optional(),
  nome_fantasia: z.string().trim().min(2).optional(),
  susep: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(8).optional(),
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  banco: z.string().trim().optional(),
  agencia: z.string().trim().optional(),
  conta: z.string().trim().optional(),
  pix_tipo_chave: z.enum(['cnpj', 'cpf', 'email', 'telefone', 'aleatoria']).optional(),
  pix_chave: z.string().trim().optional(),
  whiteLabel: z.record(z.string(), z.unknown()).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  logo_base64: z.string().nullable().optional(),
  logo_mime_type: z.string().nullable().optional(),
  contrato_social_base64: z.string().nullable().optional(),
  contrato_social_mime_type: z.string().nullable().optional(),
  contrato_social_nome_arquivo: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem alterar corretoras' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await ensureSchema();

    const parsed = updateCorretoraSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const [current] = await sql`SELECT id, metadata, address, logo_base64, logo_mime_type FROM corretoras WHERE id = ${id} LIMIT 1`;
    if (!current) {
      return Response.json({ error: 'Corretora não encontrada' }, { status: 404 });
    }

    const body = parsed.data;

    // Processamento de logotipo (limite máximo de 2MB)
    const updateLogo = body.logo_base64 !== undefined;
    let logoBase64: string | null = null;
    let logoMimeType: string | null = null;

    if (updateLogo) {
      if (body.logo_base64 && body.logo_base64.trim() !== '') {
        const cleanBase64 = body.logo_base64.replace(/^data:[^;]+;base64,/, '');
        const sizeBytes = Buffer.byteLength(cleanBase64, 'base64');
        if (sizeBytes > 2 * 1024 * 1024) {
          return Response.json({ error: 'O arquivo de logotipo excede o limite máximo permitido de 2MB' }, { status: 400 });
        }
        logoBase64 = cleanBase64;
        logoMimeType = body.logo_mime_type || (body.logo_base64.includes('image/jpeg') ? 'image/jpeg' : 'image/png');
      } else {
        logoBase64 = null;
        logoMimeType = null;
      }
    }

    // Processamento de Contrato Social (limite máximo de 10MB)
    const updateContrato = body.contrato_social_base64 !== undefined;
    let contratoBase64: string | null = null;
    let contratoMimeType: string | null = null;
    let contratoNomeArquivo: string | null = null;

    if (updateContrato) {
      if (body.contrato_social_base64 && body.contrato_social_base64.trim() !== '') {
        const cleanBase64 = body.contrato_social_base64.replace(/^data:[^;]+;base64,/, '');
        const sizeBytes = Buffer.byteLength(cleanBase64, 'base64');
        if (sizeBytes > 10 * 1024 * 1024) {
          return Response.json({ error: 'O arquivo de Contrato Social excede o limite máximo permitido de 10MB' }, { status: 400 });
        }
        contratoBase64 = cleanBase64;
        contratoMimeType = body.contrato_social_mime_type || (body.contrato_social_nome_arquivo?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/pdf');
        contratoNomeArquivo = body.contrato_social_nome_arquivo || 'contrato-social.pdf';
      } else {
        contratoBase64 = null;
        contratoMimeType = null;
        contratoNomeArquivo = null;
      }
    }

    let nextMetadata = (current.metadata as Record<string, unknown>) || {};
    if (body.whiteLabel) {
      nextMetadata = mergeWhiteLabelConfig(nextMetadata, body.whiteLabel as any);
    }
    if (updateLogo) {
      const wl = ((nextMetadata.whiteLabel as Record<string, unknown>) || {});
      wl.logoUrl = logoBase64 && logoMimeType ? `data:${logoMimeType};base64,${logoBase64}` : '';
      nextMetadata = { ...nextMetadata, whiteLabel: wl };
    }

    const nextAddress = body.address ? { ...((current.address as Record<string, unknown>) || {}), ...body.address } : current.address;

    const [updated] = await sql`
      UPDATE corretoras
      SET
        razao_social = COALESCE(${body.razao_social ?? null}, razao_social),
        nome_fantasia = COALESCE(${body.nome_fantasia ?? null}, nome_fantasia),
        susep = COALESCE(${body.susep ?? null}, susep),
        email = COALESCE(${body.email ? body.email.toLowerCase() : null}, email),
        phone = COALESCE(${body.phone ?? null}, phone),
        status = COALESCE(${body.status ?? null}, status),
        banco = COALESCE(${body.banco ?? null}, banco),
        agencia = COALESCE(${body.agencia ?? null}, agencia),
        conta = COALESCE(${body.conta ?? null}, conta),
        pix_tipo_chave = COALESCE(${body.pix_tipo_chave ?? null}, pix_tipo_chave),
        pix_chave = COALESCE(${body.pix_chave ?? null}, pix_chave),
        logo_base64 = CASE WHEN ${updateLogo}::boolean THEN ${logoBase64} ELSE logo_base64 END,
        logo_mime_type = CASE WHEN ${updateLogo}::boolean THEN ${logoMimeType} ELSE logo_mime_type END,
        contrato_social_base64 = CASE WHEN ${updateContrato}::boolean THEN ${contratoBase64} ELSE contrato_social_base64 END,
        contrato_social_mime_type = CASE WHEN ${updateContrato}::boolean THEN ${contratoMimeType} ELSE contrato_social_mime_type END,
        contrato_social_nome_arquivo = CASE WHEN ${updateContrato}::boolean THEN ${contratoNomeArquivo} ELSE contrato_social_nome_arquivo END,
        contrato_social_uploaded_at = CASE WHEN ${updateContrato && contratoBase64 !== null}::boolean THEN NOW() ELSE contrato_social_uploaded_at END,
        address = ${JSON.stringify(nextAddress)}::jsonb,
        metadata = ${JSON.stringify(nextMetadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING
        id, razao_social, nome_fantasia, cnpj, susep, email, phone, status,
        logo_base64, logo_mime_type, banco, agencia, conta, pix_tipo_chave, pix_chave,
        contrato_social_mime_type, contrato_social_nome_arquivo, contrato_social_uploaded_at,
        (contrato_social_base64 IS NOT NULL) AS has_contrato_social,
        metadata, updated_at
    `;

    logger.info({ adminId: admin.userId, corretoraId: id, updatedLogo: updateLogo }, 'admin.corretora.updated');
    return Response.json({
      ok: true,
      corretora: {
        ...updated,
        whiteLabel: getWhiteLabelConfig(updated.metadata),
      },
    });
  } catch (err) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.update.failed');
    return Response.json({ error: 'Erro interno ao atualizar corretora' }, { status: 500 });
  }
}
