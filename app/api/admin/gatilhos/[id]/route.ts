import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import type { AutomationTriggerRecord } from '@/lib/triggers/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const [trigger] = await sql<AutomationTriggerRecord[]>`
      SELECT id, code, name, description, event_type, is_active, tree_definition, created_at, updated_at
      FROM automation_triggers
      WHERE id = ${id} OR code = ${id}
      LIMIT 1
    `;

    if (!trigger) {
      return Response.json({ error: 'Árvore de decisão não encontrada' }, { status: 404 });
    }

    return Response.json({ ok: true, trigger });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.gatilhos.id.get.failed');
    return Response.json({ error: 'Erro ao buscar árvore de decisão', details: err?.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, description, event_type, is_active, tree_definition } = body;

    const [existing] = await sql<AutomationTriggerRecord[]>`
      SELECT id, code, name, description, event_type, is_active, tree_definition
      FROM automation_triggers
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing) {
      return Response.json({ error: 'Árvore de decisão não encontrada' }, { status: 404 });
    }

    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedDesc = description !== undefined ? (description ? String(description).trim() : null) : existing.description;
    const updatedEvent = event_type !== undefined ? String(event_type).trim() : existing.event_type;
    const updatedIsActive = is_active !== undefined ? Boolean(is_active) : existing.is_active;
    const updatedTree = tree_definition !== undefined ? tree_definition : existing.tree_definition;

    const [updated] = await sql<AutomationTriggerRecord[]>`
      UPDATE automation_triggers
      SET
        name = ${updatedName},
        description = ${updatedDesc},
        event_type = ${updatedEvent},
        is_active = ${updatedIsActive},
        tree_definition = ${sql.json(updatedTree)},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, description, event_type, is_active, tree_definition, created_at, updated_at
    `;

    return Response.json({ ok: true, trigger: updated });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.gatilhos.id.put.failed');
    return Response.json({ error: 'Erro ao atualizar árvore de decisão', details: err?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const [deleted] = await sql<{ id: string }[]>`
      DELETE FROM automation_triggers
      WHERE id = ${id}
      RETURNING id
    `;

    if (!deleted) {
      return Response.json({ error: 'Árvore de decisão não encontrada' }, { status: 404 });
    }

    return Response.json({ ok: true, message: 'Árvore de decisão removida com sucesso.' });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.gatilhos.id.delete.failed');
    return Response.json({ error: 'Erro ao excluir árvore de decisão', details: err?.message }, { status: 500 });
  }
}
