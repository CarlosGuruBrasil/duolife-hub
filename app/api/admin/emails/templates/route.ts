import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  extractTemplateVariables,
  ensureDefaultEmailTemplates,
  type EmailTemplate,
} from '@/lib/email-service';

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    // Garante que templates padrão existam
    await ensureDefaultEmailTemplates();

    const templates = await sql<EmailTemplate[]>`
      SELECT id, code, name, subject, body_html, body_text, variables, design_json, is_active, created_at, updated_at
      FROM email_templates
      ORDER BY updated_at DESC, name ASC
    `;

    return Response.json({
      ok: true,
      templates,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.emails.templates.get.failed');
    return Response.json({ error: 'Erro ao listar templates de e-mail', details: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, subject, body_html, code, is_active = true, design_json } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Nome do template é obrigatório' }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return Response.json({ error: 'Assunto do e-mail é obrigatório' }, { status: 400 });
    }

    if (!body_html || typeof body_html !== 'string' || !body_html.trim()) {
      return Response.json({ error: 'Conteúdo HTML do template é obrigatório' }, { status: 400 });
    }

    // Gera ou normaliza o código slug
    const normalizedCode = (
      code && typeof code === 'string' && code.trim()
        ? code.trim().toLowerCase()
        : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    ) || `tpl_${Date.now()}`;

    // Extrai automaticamente as variáveis {{variavel}}
    const detectedVars = extractTemplateVariables(body_html);

    const parsedDesignJson = design_json
      ? typeof design_json === 'string'
        ? JSON.parse(design_json)
        : design_json
      : null;

    const [created] = await sql<EmailTemplate[]>`
      INSERT INTO email_templates (
        code, name, subject, body_html, variables, design_json, is_active, updated_at
      ) VALUES (
        ${normalizedCode},
        ${name.trim()},
        ${subject.trim()},
        ${body_html},
        ${sql.json(detectedVars)},
        ${parsedDesignJson ? sql.json(parsedDesignJson) : null},
        ${Boolean(is_active)},
        NOW()
      )
      RETURNING id, code, name, subject, body_html, variables, design_json, is_active, created_at, updated_at
    `;

    return Response.json({
      ok: true,
      template: created,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.emails.templates.post.failed');
    if (err?.code === '23505') {
      return Response.json({ error: 'Já existe um template com este código/identificador.' }, { status: 409 });
    }
    return Response.json({ error: 'Erro ao cadastrar template', details: err?.message }, { status: 500 });
  }
}
