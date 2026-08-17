import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isDevUser, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export interface PlanData {
  id: string;
  wix_item_id: string;
  nomeExibido: string;
  tipoDePlano: string;
  cobertura: string;
  franquia: string;
  parcela: string;
  parcela2X: string;
  parcela3X: string;
  parcela4X: string;
  parcela6X: string;
  quantidadeDeParcelas: string;
  valorPagoKovr: number | null;
  ordem: number;
}

function parsePayloadData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj === 'object' && obj !== null) {
    const itemObj = (obj as Record<string, unknown>).item || obj;
    const dataObj = (itemObj as Record<string, unknown>).data || itemObj;
    return dataObj as Record<string, unknown>;
  }
  return {};
}

export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  try {
    const rows = await sql`
      SELECT wi.id, wi.wix_item_id, wi.payload
      FROM wix_items wi
      JOIN wix_collections wc ON wi.wix_collection_id = wc.id
      WHERE wc.collection_id = 'Planos' OR wc.collection_name = 'Planos'
      ORDER BY wi.created_at ASC
    `;

    const plans: PlanData[] = rows.map((r) => {
      const data = parsePayloadData(r.payload);
      return {
        id: r.id,
        wix_item_id: r.wix_item_id,
        nomeExibido: String(data.nomeExibido || data.tipoDePlano || 'Plano'),
        tipoDePlano: String(data.tipoDePlano || ''),
        cobertura: String(data.cobertura || 'R$ 0,00'),
        franquia: String(data.franquia || 'R$ 3.000,00'),
        parcela: String(data.parcela || 'R$ 0,00'),
        parcela2X: String(data.parcela2X || ''),
        parcela3X: String(data.parcela3X || ''),
        parcela4X: String(data.parcela4X || ''),
        parcela6X: String(data.parcela6X || ''),
        quantidadeDeParcelas: String(data.quantidadeDeParcelas || 'em até 6 parcelas'),
        valorPagoKovr: typeof data.valorPagoKovr === 'number' ? data.valorPagoKovr : parseFloat(String(data.valorPagoKovr || 0)) || null,
        ordem: Number(data.ordem) || 0,
      };
    });

    plans.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    return Response.json({ plans });
  } catch (error) {
    logger.error({ error }, 'admin.produtos.planos.get.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const updatePlanSchema = z.object({
  id: z.string(),
  nomeExibido: z.string().trim().min(1),
  cobertura: z.string().trim().min(1),
  franquia: z.string().trim().min(1),
  parcela: z.string().trim().min(1),
  parcela2X: z.string().trim().optional(),
  parcela3X: z.string().trim().optional(),
  parcela4X: z.string().trim().optional(),
  parcela6X: z.string().trim().optional(),
  quantidadeDeParcelas: z.string().trim().optional(),
  valorPagoKovr: z.number().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isDevUser(admin)) return Response.json({ error: 'Sem permissão para alterar planos' }, { status: 403 });

  const parsed = updatePlanSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'Dados do plano inválidos' }, { status: 400 });
  }

  const input = parsed.data;

  try {
    const [row] = await sql`
      SELECT id, payload FROM wix_items WHERE id = ${input.id} LIMIT 1
    `;

    if (!row) {
      return Response.json({ error: 'Plano não encontrado' }, { status: 404 });
    }

    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
    } catch {}

    const item = (payloadObj.item as Record<string, unknown>) || {};
    const data = (item.data as Record<string, unknown>) || payloadObj.data || payloadObj || {};

    data.nomeExibido = input.nomeExibido;
    data.cobertura = input.cobertura;
    data.franquia = input.franquia;
    data.parcela = input.parcela;
    if (input.parcela2X !== undefined) data.parcela2X = input.parcela2X;
    if (input.parcela3X !== undefined) data.parcela3X = input.parcela3X;
    if (input.parcela4X !== undefined) data.parcela4X = input.parcela4X;
    if (input.parcela6X !== undefined) data.parcela6X = input.parcela6X;
    if (input.quantidadeDeParcelas !== undefined) data.quantidadeDeParcelas = input.quantidadeDeParcelas;
    if (input.valorPagoKovr !== undefined) data.valorPagoKovr = input.valorPagoKovr;

    const newPayload = {
      collectionId: 'Planos',
      item: {
        id: row.id,
        dataCollectionId: 'Planos',
        data,
      },
    };

    await sql`
      UPDATE wix_items
      SET payload = ${JSON.stringify(newPayload)}::jsonb,
          updated_at = NOW()
      WHERE id = ${input.id}
    `;

    logger.info({ adminId: admin.userId, planId: input.id }, 'admin.plan.updated');
    return Response.json({ success: true });
  } catch (error) {
    logger.error({ error, planId: input.id }, 'admin.plan.update.failed');
    return Response.json({ error: 'Erro ao atualizar plano' }, { status: 500 });
  }
}
