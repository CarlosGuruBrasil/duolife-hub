import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema, seedInitialData } from '@/lib/schema';

const cotacaoSchema = z.object({
  clientName: z.string().trim().min(2),
  clientCpfCnpj: z.string().trim().min(11),
  clientEmail: z.string().trim().email().optional().or(z.literal('')),
  clientPhone: z.string().trim().optional(),
  importanciaSegurada: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
  clientData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const requestedPartnerId = url.searchParams.get('partnerId');

  // Se for parceiro, força o ID dele. Se for admin, usa o solicitado ou busca todos (se não enviar)
  let targetPartnerId = user.partnerId;
  if (user.role === 'duolife_admin' || user.role === 'duolife_staff') {
    targetPartnerId = requestedPartnerId || null;
  } else if (!targetPartnerId) {
    return unauthorized();
  }

  try {
    await ensureSchema();
    await seedInitialData();

    const cotacoes = await sql`
      SELECT
        c.id,
        c.client_name,
        c.client_cpf_cnpj,
        c.client_email,
        c.client_phone,
        c.importancia_segurada,
        c.premio_final,
        c.status,
        c.valid_until,
        c.created_at,
        p.name AS product_name
      FROM cotacoes c
      JOIN products p ON p.id = c.product_id
      WHERE ${targetPartnerId ? sql`c.partner_id = ${targetPartnerId}` : sql`1=1`}
      ORDER BY c.created_at DESC
      LIMIT 100
    `;

    return Response.json({ cotacoes });
  } catch (err) {
    logger.error({ err, partnerId: user.partnerId }, 'cotacoes.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await seedInitialData();

    const publicToken = req.headers.get('x-public-token');
    let targetPartnerId: string | null = null;
    let userId: string | null = null;
    let sourceToken: string | null = null;
    let flowType = 'internal';

    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id, id, flow_type
        FROM public_sale_links
        WHERE token = ${publicToken}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
      
      targetPartnerId = link.partner_id;
      sourceToken = publicToken;
      flowType = link.flow_type || 'external';
    }

    const payloadBody = await req.json();
    const parsed = cotacaoSchema.safeParse(payloadBody);
    if (!parsed.success) {
      return Response.json({ error: 'Dados da cotação inválidos' }, { status: 400 });
    }
    const data = parsed.data as any;

    if (!publicToken) {
      const user = await verifyAuth();
      if (!user) return unauthorized();

      userId = user.userId;
      targetPartnerId = user.partnerId;

      if (user.role === 'duolife_admin' || user.role === 'duolife_staff') {
        if (!data.adminSelectedPartnerId) {
          return Response.json({ error: 'Administradores precisam informar o Parceiro dono da cotação' }, { status: 400 });
        }
        targetPartnerId = data.adminSelectedPartnerId;
      } else if (!targetPartnerId) {
        return unauthorized();
      }
    }

    const [product] = await sql`
      SELECT id FROM products WHERE code = 'RC-001' AND is_active = true
    `;

    if (!product) {
      return Response.json({ error: 'Produto RC não configurado' }, { status: 422 });
    }

    const [cotacao] = await sql`
      INSERT INTO cotacoes (
        partner_id,
        partner_user_id,
        product_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        client_data,
        importancia_segurada,
        status,
        notes,
        flow_type,
        source_token
      )
      VALUES (
        ${targetPartnerId},
        ${userId},
        ${product.id},
        ${data.clientName},
        ${data.clientCpfCnpj},
        ${data.clientEmail || null},
        ${data.clientPhone || null},
        ${JSON.stringify(data.clientData || {})},
        ${data.importanciaSegurada || null},
        'rascunho',
        ${data.notes || null},
        ${flowType},
        ${sourceToken}
      )
      RETURNING id, status, created_at
    `;

    if (publicToken) {
      await sql`
        UPDATE public_sale_links
        SET used_at = COALESCE(used_at, NOW()),
            updated_at = NOW()
        WHERE token = ${publicToken}
      `;
    }

    return Response.json({ ok: true, cotacao }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'cotacoes.create.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
