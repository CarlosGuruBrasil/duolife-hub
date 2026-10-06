import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { validarCpf, somenteDigitos } from '@/lib/documento';
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
        c.telefone_cadastro,
        c.socio_nome,
        c.socio_cpf,
        c.socio_rg,
        c.socio_email,
        c.socio_telefone,
        c.socios_adicionais,
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
        c.cartao_cnpj_mime_type,
        c.cartao_cnpj_nome_arquivo,
        c.cartao_cnpj_uploaded_at,
        c.socio_documento_mime_type,
        c.socio_documento_nome_arquivo,
        c.socio_documento_uploaded_at,
        c.comprovante_bancario_mime_type,
        c.comprovante_bancario_nome_arquivo,
        c.comprovante_bancario_uploaded_at,
        (c.contrato_social_base64 IS NOT NULL) AS has_contrato_social,
        (c.cartao_cnpj_base64 IS NOT NULL) AS has_cartao_cnpj,
        (c.socio_documento_base64 IS NOT NULL) AS has_socio_documento,
        (c.comprovante_bancario_base64 IS NOT NULL) AS has_comprovante_bancario,
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
  telefone_cadastro: z.string().trim().min(8).optional(),
  socio_nome: z.string().trim().min(2).optional(),
  socio_cpf: z.string().trim().optional(),
  socio_rg: z.string().trim().optional(),
  socio_email: z.string().trim().email().optional(),
  socio_telefone: z.string().trim().optional(),
  socios_adicionais: z.unknown().optional(),
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
  cartao_cnpj_base64: z.string().nullable().optional(),
  cartao_cnpj_mime_type: z.string().nullable().optional(),
  cartao_cnpj_nome_arquivo: z.string().nullable().optional(),
  socio_documento_base64: z.string().nullable().optional(),
  socio_documento_mime_type: z.string().nullable().optional(),
  socio_documento_nome_arquivo: z.string().nullable().optional(),
  comprovante_bancario_base64: z.string().nullable().optional(),
  comprovante_bancario_mime_type: z.string().nullable().optional(),
  comprovante_bancario_nome_arquivo: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.socio_cpf && data.socio_cpf.trim()) {
    const clean = somenteDigitos(data.socio_cpf);
    if (!validarCpf(clean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['socio_cpf'],
        message: 'CPF do sócio inválido',
      });
    }
  }
});

function parseDocUpdate(
  val: string | null | undefined,
  mimeVal: string | null | undefined,
  nameVal: string | null | undefined,
  defaultName: string
) {
  if (val === undefined) return { isUpdating: false, base64: null, mime: null, name: null };
  if (!val || val.trim() === '') return { isUpdating: true, base64: null, mime: null, name: null };

  const cleanBase64 = val.replace(/^data:[^;]+;base64,/, '');
  const sizeBytes = Buffer.byteLength(cleanBase64, 'base64');
  if (sizeBytes > 10 * 1024 * 1024) {
    throw new Error(`Arquivo excede o limite máximo permitido de 10MB`);
  }

  const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  let mime = mimeVal;
  if (!mime && val.startsWith('data:')) {
    const match = val.match(/^data:([^;]+);base64,/);
    if (match) mime = match[1];
  }
  if (!mime) {
    const fn = (nameVal || '').toLowerCase();
    if (fn.endsWith('.pdf')) mime = 'application/pdf';
    else if (fn.endsWith('.png')) mime = 'image/png';
    else if (fn.endsWith('.jpg') || fn.endsWith('.jpeg')) mime = 'image/jpeg';
    else if (fn.endsWith('.webp')) mime = 'image/webp';
    else mime = 'application/pdf';
  }

  if (!allowedMimes.includes(mime)) {
    throw new Error('Formato do documento inválido. Envie um arquivo PDF ou imagem (PNG/JPEG)');
  }

  return {
    isUpdating: true,
    base64: cleanBase64,
    mime,
    name: nameVal || defaultName,
  };
}

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
      const issue = parsed.error.issues[0]?.message || 'Dados inválidos';
      return Response.json({ error: issue, issues: parsed.error.issues }, { status: 400 });
    }

    const [current] = await sql`
      SELECT id, metadata, address, logo_base64, logo_mime_type, socios_adicionais
      FROM corretoras
      WHERE id = ${id}
      LIMIT 1
    `;
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

    // Processamento de documentos (limite máximo de 10MB)
    const docContrato = parseDocUpdate(body.contrato_social_base64, body.contrato_social_mime_type, body.contrato_social_nome_arquivo, 'contrato-social.pdf');
    const docCnpj = parseDocUpdate(body.cartao_cnpj_base64, body.cartao_cnpj_mime_type, body.cartao_cnpj_nome_arquivo, 'cartao-cnpj.pdf');
    const docSocio = parseDocUpdate(body.socio_documento_base64, body.socio_documento_mime_type, body.socio_documento_nome_arquivo, 'documento-socio.pdf');
    const docBanco = parseDocUpdate(body.comprovante_bancario_base64, body.comprovante_bancario_mime_type, body.comprovante_bancario_nome_arquivo, 'comprovante-bancario.pdf');

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
    const nextSociosAdicionais = body.socios_adicionais !== undefined ? body.socios_adicionais : current.socios_adicionais;

    const [updated] = await sql`
      UPDATE corretoras
      SET
        razao_social = COALESCE(${body.razao_social ?? null}, razao_social),
        nome_fantasia = COALESCE(${body.nome_fantasia ?? null}, nome_fantasia),
        susep = COALESCE(${body.susep ?? null}, susep),
        email = COALESCE(${body.email ? body.email.toLowerCase() : null}, email),
        phone = COALESCE(${body.phone ?? null}, phone),
        telefone_cadastro = COALESCE(${body.telefone_cadastro ?? null}, telefone_cadastro),
        socio_nome = COALESCE(${body.socio_nome ?? null}, socio_nome),
        socio_cpf = COALESCE(${body.socio_cpf ? somenteDigitos(body.socio_cpf) : null}, socio_cpf),
        socio_rg = COALESCE(${body.socio_rg ?? null}, socio_rg),
        socio_email = COALESCE(${body.socio_email ? body.socio_email.toLowerCase() : null}, socio_email),
        socio_telefone = COALESCE(${body.socio_telefone ?? null}, socio_telefone),
        socios_adicionais = ${JSON.stringify(nextSociosAdicionais)}::jsonb,
        status = COALESCE(${body.status ?? null}, status),
        banco = COALESCE(${body.banco ?? null}, banco),
        agencia = COALESCE(${body.agencia ?? null}, agencia),
        conta = COALESCE(${body.conta ?? null}, conta),
        pix_tipo_chave = COALESCE(${body.pix_tipo_chave ?? null}, pix_tipo_chave),
        pix_chave = COALESCE(${body.pix_chave ?? null}, pix_chave),
        logo_base64 = CASE WHEN ${updateLogo}::boolean THEN ${logoBase64} ELSE logo_base64 END,
        logo_mime_type = CASE WHEN ${updateLogo}::boolean THEN ${logoMimeType} ELSE logo_mime_type END,
        contrato_social_base64 = CASE WHEN ${docContrato.isUpdating}::boolean THEN ${docContrato.base64} ELSE contrato_social_base64 END,
        contrato_social_mime_type = CASE WHEN ${docContrato.isUpdating}::boolean THEN ${docContrato.mime} ELSE contrato_social_mime_type END,
        contrato_social_nome_arquivo = CASE WHEN ${docContrato.isUpdating}::boolean THEN ${docContrato.name} ELSE contrato_social_nome_arquivo END,
        contrato_social_uploaded_at = CASE
          WHEN ${docContrato.isUpdating && docContrato.base64 !== null}::boolean THEN NOW()
          WHEN ${docContrato.isUpdating && docContrato.base64 === null}::boolean THEN NULL
          ELSE contrato_social_uploaded_at
        END,
        cartao_cnpj_base64 = CASE WHEN ${docCnpj.isUpdating}::boolean THEN ${docCnpj.base64} ELSE cartao_cnpj_base64 END,
        cartao_cnpj_mime_type = CASE WHEN ${docCnpj.isUpdating}::boolean THEN ${docCnpj.mime} ELSE cartao_cnpj_mime_type END,
        cartao_cnpj_nome_arquivo = CASE WHEN ${docCnpj.isUpdating}::boolean THEN ${docCnpj.name} ELSE cartao_cnpj_nome_arquivo END,
        cartao_cnpj_uploaded_at = CASE
          WHEN ${docCnpj.isUpdating && docCnpj.base64 !== null}::boolean THEN NOW()
          WHEN ${docCnpj.isUpdating && docCnpj.base64 === null}::boolean THEN NULL
          ELSE cartao_cnpj_uploaded_at
        END,
        socio_documento_base64 = CASE WHEN ${docSocio.isUpdating}::boolean THEN ${docSocio.base64} ELSE socio_documento_base64 END,
        socio_documento_mime_type = CASE WHEN ${docSocio.isUpdating}::boolean THEN ${docSocio.mime} ELSE socio_documento_mime_type END,
        socio_documento_nome_arquivo = CASE WHEN ${docSocio.isUpdating}::boolean THEN ${docSocio.name} ELSE socio_documento_nome_arquivo END,
        socio_documento_uploaded_at = CASE
          WHEN ${docSocio.isUpdating && docSocio.base64 !== null}::boolean THEN NOW()
          WHEN ${docSocio.isUpdating && docSocio.base64 === null}::boolean THEN NULL
          ELSE socio_documento_uploaded_at
        END,
        comprovante_bancario_base64 = CASE WHEN ${docBanco.isUpdating}::boolean THEN ${docBanco.base64} ELSE comprovante_bancario_base64 END,
        comprovante_bancario_mime_type = CASE WHEN ${docBanco.isUpdating}::boolean THEN ${docBanco.mime} ELSE comprovante_bancario_mime_type END,
        comprovante_bancario_nome_arquivo = CASE WHEN ${docBanco.isUpdating}::boolean THEN ${docBanco.name} ELSE comprovante_bancario_nome_arquivo END,
        comprovante_bancario_uploaded_at = CASE
          WHEN ${docBanco.isUpdating && docBanco.base64 !== null}::boolean THEN NOW()
          WHEN ${docBanco.isUpdating && docBanco.base64 === null}::boolean THEN NULL
          ELSE comprovante_bancario_uploaded_at
        END,
        address = ${JSON.stringify(nextAddress)}::jsonb,
        metadata = ${JSON.stringify(nextMetadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING
        id, razao_social, nome_fantasia, cnpj, susep, email, phone, telefone_cadastro,
        socio_nome, socio_cpf, socio_rg, socio_email, socio_telefone, socios_adicionais,
        status, logo_base64, logo_mime_type, banco, agencia, conta, pix_tipo_chave, pix_chave,
        contrato_social_mime_type, contrato_social_nome_arquivo, contrato_social_uploaded_at,
        cartao_cnpj_mime_type, cartao_cnpj_nome_arquivo, cartao_cnpj_uploaded_at,
        socio_documento_mime_type, socio_documento_nome_arquivo, socio_documento_uploaded_at,
        comprovante_bancario_mime_type, comprovante_bancario_nome_arquivo, comprovante_bancario_uploaded_at,
        (contrato_social_base64 IS NOT NULL) AS has_contrato_social,
        (cartao_cnpj_base64 IS NOT NULL) AS has_cartao_cnpj,
        (socio_documento_base64 IS NOT NULL) AS has_socio_documento,
        (comprovante_bancario_base64 IS NOT NULL) AS has_comprovante_bancario,
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
  } catch (err: any) {
    logger.error({ err, corretoraId: id }, 'admin.corretora.update.failed');
    return Response.json({ error: err.message || 'Erro interno ao atualizar corretora' }, { status: 500 });
  }
}
