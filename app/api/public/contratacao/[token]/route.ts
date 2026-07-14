import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig } from '@/lib/white-label';
import { logSyncEvent } from '@/lib/wix-sync';
import { upsertInsuranceClient } from '@/lib/insurance-ops';

const payloadSchema = z.object({
  clientName: z.string().trim().min(2),
  clientCpfCnpj: z.string().trim().min(11),
  clientEmail: z.string().trim().email().optional().or(z.literal('')),
  clientPhone: z.string().trim().optional().or(z.literal('')),
  importanciaSegurada: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
  clientData: z.record(z.string(), z.unknown()).optional(),
});

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  let link: any = null;
  const { token } = await params;
  try {
    await ensureSchema();

    link = await resolveLink(token);
    if (!link) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    const parsed = payloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const data = parsed.data;
    const documentNumber = data.clientCpfCnpj.replace(/\D/g, '');
    const phone = data.clientPhone ? data.clientPhone.replace(/\D/g, '') : null;
    const partnerId = link.partner_id as string;
    const effectiveProductId = (link.product_id as string | null) || (await sql`
      SELECT id
      FROM products
      WHERE code = 'RC-001'
      LIMIT 1
    `)[0]?.id || null;

    if (!effectiveProductId) {
      return Response.json({ error: 'Produto RC não configurado' }, { status: 422 });
    }

    const client = await upsertInsuranceClient({
      documentNumber: data.clientCpfCnpj,
      fullName: data.clientName,
      email: data.clientEmail || null,
      phone: data.clientPhone || null,
      birthDate: typeof data.clientData?.dataNascto === 'string' ? data.clientData.dataNascto : null,
      metadata: {
        source: 'public_link',
        token,
        partnerId,
      },
    });

    const existingLead = await sql`
      SELECT id
      FROM leads
      WHERE partner_id = ${partnerId}
        AND external_id = ${token}
      LIMIT 1
    `;

    const leadPayload = {
      partner_id: partnerId,
      external_id: token,
      document_number: documentNumber,
      nome: data.clientName,
      email: data.clientEmail || null,
      telefone: phone,
      origem: 'portal_publico',
      status: 'novo',
      product_id: effectiveProductId,
      data_cadastro: new Date(),
      data_atualizacao: new Date(),
      raw: {
        token,
        flowType: link.flow_type,
        publicLinkId: link.id,
        clientData: data.clientData || {},
        notes: data.notes || '',
      },
      source_system: 'duolife-public-link',
      synced_at: new Date(),
    };

    const lead = existingLead[0]
      ? await sql`
          UPDATE leads
          SET
            document_number = ${documentNumber},
            nome = ${data.clientName},
            email = ${data.clientEmail || null},
            telefone = ${phone},
            origem = 'portal_publico',
            status = 'novo',
            product_id = ${effectiveProductId},
            data_atualizacao = NOW(),
            raw = ${JSON.stringify(leadPayload.raw)}::jsonb,
            source_system = 'duolife-public-link',
            synced_at = NOW()
          WHERE id = ${existingLead[0].id}
          RETURNING id
        `
      : await sql`
          INSERT INTO leads (
            partner_id, external_id, document_number, nome, email, telefone, origem,
            status, product_id, data_cadastro, data_atualizacao, raw, synced_at, source_system
          )
          VALUES (
            ${leadPayload.partner_id},
            ${leadPayload.external_id},
            ${leadPayload.document_number},
            ${leadPayload.nome},
            ${leadPayload.email},
            ${leadPayload.telefone},
            ${leadPayload.origem},
            ${leadPayload.status},
            ${effectiveProductId},
            NOW(),
            NOW(),
            ${JSON.stringify(leadPayload.raw)}::jsonb,
            NOW(),
            ${leadPayload.source_system}
          )
          RETURNING id
        `;

    const [cotacao] = await sql`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        partner_user_id,
        product_id,
        lead_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        client_data,
        importancia_segurada,
        status,
        flow_type,
        source_token,
        external_ref,
        notes,
        metadata
      )
      VALUES (
        ${client.id},
        ${partnerId},
        ${null},
        ${effectiveProductId},
        ${lead[0].id},
        ${data.clientName},
        ${data.clientCpfCnpj},
        ${data.clientEmail || null},
        ${data.clientPhone || null},
        ${JSON.stringify(data.clientData || {})}::jsonb,
        ${data.importanciaSegurada || null},
        'enviada',
        'external',
        ${token},
        ${token},
        ${data.notes || null},
        ${JSON.stringify({ publicLinkId: link.id, flowType: link.flow_type })}::jsonb
      )
      RETURNING id, status, created_at
    `;

    await sql`
      UPDATE public_sale_links
      SET used_at = COALESCE(used_at, NOW()),
          updated_at = NOW()
      WHERE id = ${link.id}
    `;

    await logSyncEvent({
      entityType: 'lead',
      entityId: lead[0].id,
      sourceSystem: 'duolife-public-link',
      direction: 'inbound',
      eventType: 'public_quote_created',
      status: 'success',
      payload: {
        token,
        partnerId,
        cotacaoId: cotacao.id,
      },
    });

    logger.info({ partnerId, token, leadId: lead[0].id, cotacaoId: cotacao.id }, 'public.contratacao.created');

    return Response.json({
      ok: true,
      leadId: lead[0].id,
      cotacao,
    }, { status: 201 });
  } catch (err) {
    await logSyncEvent({
      entityType: 'lead',
      entityId: token,
      sourceSystem: 'duolife-public-link',
      direction: 'inbound',
      eventType: 'public_quote_created',
      status: 'error',
      payload: { token, partnerId: link.partner_id },
      errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
    }).catch(() => null);

    logger.error({ err, partnerId: link.partner_id, token }, 'public.contratacao.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
