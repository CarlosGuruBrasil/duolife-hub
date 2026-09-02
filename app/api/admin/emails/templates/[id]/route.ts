import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  extractTemplateVariables,
  type EmailTemplate,
} from '@/lib/email-service';

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
    const [template] = await sql<EmailTemplate[]>`
      SELECT id, code, name, subject, body_html, body_text, variables, design_json, is_active, created_at, updated_at
      FROM email_templates
      WHERE id = ${id} OR code = ${id}
      LIMIT 1
    `;

    if (!template) {
      return Response.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    return Response.json({ ok: true, template });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.emails.templates.id.get.failed');
    return Response.json({ error: 'Erro ao buscar template', details: err?.message }, { status: 500 });
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
    const { name, subject, body_html, is_active, design_json } = body;

    const [existing] = await sql<EmailTemplate[]>`
      SELECT id, code, name, subject, body_html, variables, design_json, is_active
      FROM email_templates
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing) {
      return Response.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedSubject = subject !== undefined ? String(subject).trim() : existing.subject;
    const updatedHtml = body_html !== undefined ? String(body_html) : existing.body_html;
    const updatedIsActive = is_active !== undefined ? Boolean(is_active) : existing.is_active;

    const updatedDesignJson = design_json !== undefined
      ? (design_json ? (typeof design_json === 'string' ? JSON.parse(design_json) : design_json) : null)
      : existing.design_json;

    const detectedVars = extractTemplateVariables(updatedHtml);

    const [updated] = await sql<EmailTemplate[]>`
      UPDATE email_templates
      SET
        name = ${updatedName},
        subject = ${updatedSubject},
        body_html = ${updatedHtml},
        variables = ${sql.json(detectedVars)},
        design_json = ${updatedDesignJson ? sql.json(updatedDesignJson) : null},
        is_active = ${updatedIsActive},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, subject, body_html, variables, design_json, is_active, created_at, updated_at
    `;

    return Response.json({ ok: true, template: updated });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.emails.templates.id.put.failed');
    return Response.json({ error: 'Erro ao atualizar template', details: err?.message }, { status: 500 });
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
      DELETE FROM email_templates
      WHERE id = ${id}
      RETURNING id
    `;

    if (!deleted) {
      return Response.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    return Response.json({ ok: true, message: 'Template excluído com sucesso.' });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.emails.templates.id.delete.failed');
    return Response.json({ error: 'Erro ao excluir template', details: err?.message }, { status: 500 });
  }
}
