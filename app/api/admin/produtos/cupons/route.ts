import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import crypto from 'crypto';

export interface CouponData {
  id: string;
  codigo: string;
  nome: string;
  desconto: number;
  validade: string | null;
  cupomAtivo: boolean;
  quantidade: number;
  quantidadeUsada: number;
}

function parsePayload(raw: unknown): Record<string, unknown> {
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
    return obj as Record<string, unknown>;
  }
  return {};
}

function getCollectionData(raw: unknown): Record<string, unknown> {
  const parsed = parsePayload(raw);
  const itemObj = (parsed.item || parsed) as Record<string, unknown>;
  const dataObj = (itemObj.data || itemObj) as Record<string, unknown>;
  return dataObj;
}

export async function GET() {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const rows = await sql`
      SELECT wi.id, wi.wix_item_id, wi.payload
      FROM wix_items wi
      JOIN wix_collections wc ON wi.wix_collection_id = wc.id
      WHERE wc.collection_name ILIKE '%CUPOM%' OR wc.collection_id ILIKE '%CUPOM%'
      ORDER BY wi.created_at DESC
    `;

    const coupons: CouponData[] = rows.map((r) => {
      const d = getCollectionData(r.payload);
      let validadeStr: string | null = null;
      if (d.validade) {
        if (typeof d.validade === 'string') validadeStr = d.validade;
        else if (typeof d.validade === 'object' && (d.validade as Record<string, string>).$date) {
          validadeStr = (d.validade as Record<string, string>).$date;
        }
      }

      return {
        id: r.id,
        codigo: String(d.codigo || d.nome || ''),
        nome: String(d.nome || d.codigo || 'Cupom'),
        desconto: Number(d.desconto || 0),
        validade: validadeStr,
        cupomAtivo: d.cupomAtivo !== false,
        quantidade: Number(d.quantidade || 1000),
        quantidadeUsada: Number(d.quantidadeUsada || 0),
      };
    });

    coupons.sort((a, b) => b.desconto - a.desconto);

    return Response.json({ coupons });
  } catch (error) {
    logger.error({ error }, 'admin.produtos.cupons.get.failed');
    return Response.json({ coupons: [] });
  }
}

const createCouponSchema = z.object({
  codigo: z.string().trim().min(1),
  desconto: z.number().min(0).max(100),
  validade: z.string().optional(),
  quantidade: z.number().optional().default(1000),
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json();
    const parsed = createCouponSchema.parse(body);

    const [coll] = await sql<{ id: string }[]>`
      SELECT id FROM wix_collections WHERE collection_name ILIKE '%CUPOM%' OR collection_id ILIKE '%CUPOM%' LIMIT 1
    `;

    if (!coll) {
      return Response.json({ error: 'Coleção de cupons não encontrada' }, { status: 400 });
    }

    const newItemId = crypto.randomUUID();
    const validadeObj = parsed.validade
      ? { $date: new Date(parsed.validade).toISOString() }
      : { $date: '2040-12-31T23:59:59.000Z' };

    const payloadObj = {
      collectionId: 'CUPOMPROMOCIONAL',
      item: {
        id: newItemId,
        dataCollectionId: 'CUPOMPROMOCIONAL',
        data: {
          _id: newItemId,
          codigo: parsed.codigo.toLowerCase(),
          nome: parsed.codigo.toLowerCase(),
          desconto: parsed.desconto,
          quantidade: parsed.quantidade,
          quantidadeUsada: 0,
          cupomAtivo: true,
          validade: validadeObj,
          _createdDate: { $date: new Date().toISOString() },
          _updatedDate: { $date: new Date().toISOString() },
        },
      },
    };

    await sql`
      INSERT INTO wix_items (id, wix_collection_id, wix_item_id, payload, created_at, updated_at)
      VALUES (${newItemId}, ${coll.id}, ${newItemId}, ${JSON.stringify(payloadObj)}, NOW(), NOW())
    `;

    return Response.json({ success: true, id: newItemId });
  } catch (error) {
    logger.error({ error }, 'admin.produtos.cupons.post.failed');
    return Response.json({ error: 'Erro ao criar cupom' }, { status: 500 });
  }
}

const updateCouponSchema = z.object({
  id: z.string(),
  codigo: z.string().trim().min(1),
  desconto: z.number().min(0).max(100),
  validade: z.string().optional(),
  cupomAtivo: z.boolean(),
  quantidade: z.number().optional(),
});

export async function PUT(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const body = await req.json();
    const parsed = updateCouponSchema.parse(body);

    const [item] = await sql<{ id: string; payload: unknown }[]>`
      SELECT id, payload FROM wix_items WHERE id = ${parsed.id} LIMIT 1
    `;

    if (!item) {
      return Response.json({ error: 'Cupom não encontrado' }, { status: 404 });
    }

    const payloadObj = parsePayload(item.payload);
    const itemObj = ((payloadObj.item || payloadObj) as Record<string, unknown>) || {};
    const dataObj = ((itemObj.data || itemObj) as Record<string, unknown>) || {};

    dataObj.codigo = parsed.codigo.toLowerCase();
    dataObj.nome = parsed.codigo.toLowerCase();
    dataObj.desconto = parsed.desconto;
    dataObj.cupomAtivo = parsed.cupomAtivo;
    if (parsed.quantidade !== undefined) dataObj.quantidade = parsed.quantidade;
    if (parsed.validade) {
      dataObj.validade = { $date: new Date(parsed.validade).toISOString() };
    }
    dataObj._updatedDate = { $date: new Date().toISOString() };

    const newPayload = {
      collectionId: 'CUPOMPROMOCIONAL',
      item: {
        id: parsed.id,
        dataCollectionId: 'CUPOMPROMOCIONAL',
        data: dataObj,
      },
    };

    await sql`
      UPDATE wix_items
      SET payload = ${JSON.stringify(newPayload)}, updated_at = NOW()
      WHERE id = ${parsed.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'admin.produtos.cupons.put.failed');
    return Response.json({ error: 'Erro ao atualizar cupom' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'ID do cupom não fornecido' }, { status: 400 });
    }

    await sql`DELETE FROM wix_items WHERE id = ${id}`;

    return Response.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'admin.produtos.cupons.delete.failed');
    return Response.json({ error: 'Erro ao excluir cupom' }, { status: 500 });
  }
}
