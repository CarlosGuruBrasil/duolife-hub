import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  extractTemplateVariables,
  type EmailTemplate,
} from '@/lib/email-service';
import { isNet4LifeInfoEnabled } from '@/lib/system-settings';
import { pushTemplateToNet4Life, deleteTemplateFromNet4Life } from '@/lib/net4life-service';

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
      SELECT id, code, name, subject, body_html, body_text, variables, design_json, external_id, last_synced_at, is_active, created_at, updated_at
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
      SELECT id, code, name, subject, body_html, variables, design_json, external_id, last_synced_at, is_active
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

    let newExternalId = existing.external_id;
    let newSyncedAt = existing.last_synced_at;

    // Sincronização automática com a API Net4Life Info
    if (await isNet4LifeInfoEnabled()) {
      try {
        const syncRes = await pushTemplateToNet4Life({
          externalId: existing.external_id,
          name: updatedName,
          subject: updatedSubject,
          bodyHtml: updatedHtml,
          variables: detectedVars,
        });

        if (syncRes.success && syncRes.externalId) {
          newExternalId = syncRes.externalId;
          newSyncedAt = new Date().toISOString();
        }
      } catch (syncErr) {
        logger.warn({ syncErr, id }, 'Falha no auto-sync de atualização do template com Net4Life Info');
      }
    }

    const [updated] = await sql<EmailTemplate[]>`
      UPDATE email_templates
      SET
        name = ${updatedName},
        subject = ${updatedSubject},
        body_html = ${updatedHtml},
        variables = ${sql.json(detectedVars)},
        design_json = ${updatedDesignJson ? sql.json(updatedDesignJson) : null},
        external_id = ${newExternalId || null},
        last_synced_at = ${newSyncedAt ? sql`NOW()` : null},
        is_active = ${updatedIsActive},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, subject, body_html, variables, design_json, external_id, last_synced_at, is_active, created_at, updated_at
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
    const [existing] = await sql<EmailTemplate[]>`
      SELECT id, external_id
      FROM email_templates
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing) {
      return Response.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    // Se estiver sincronizado com o Net4Life Info, remove também remotamente
    if (existing.external_id && (await isNet4LifeInfoEnabled())) {
      try {
        await deleteTemplateFromNet4Life(existing.external_id);
      } catch (delRemoteErr) {
        logger.warn({ delRemoteErr, externalId: existing.external_id }, 'Falha ao remover template no Net4Life Info');
      }
    }

    await sql`
      DELETE FROM email_templates
      WHERE id = ${id}
    `;

    return Response.json({ ok: true, message: 'Template excluído com sucesso.' });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.emails.templates.id.delete.failed');
    return Response.json({ error: 'Erro ao excluir template', details: err?.message }, { status: 500 });
  }
}
