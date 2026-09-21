import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { resolveEmailLogHtml, EmailDispatchLog } from '@/lib/email-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'ID do log não fornecido' }, { status: 400 });
  }

  try {
    const [log] = await sql<EmailDispatchLog[]>`
      SELECT
        id,
        template_code,
        recipient_email,
        recipient_name,
        subject,
        body_html,
        status,
        provider,
        error_message,
        metadata,
        created_at
      FROM email_dispatch_logs
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!log) {
      return Response.json({ error: 'Log de e-mail não encontrado' }, { status: 404 });
    }

    const html = await resolveEmailLogHtml(log);

    return Response.json({
      ok: true,
      log: {
        id: log.id,
        subject: log.subject,
        recipient_email: log.recipient_email,
        recipient_name: log.recipient_name,
        template_code: log.template_code,
        status: log.status,
        provider: log.provider,
        created_at: log.created_at,
      },
      html,
    });
  } catch (err: any) {
    logger.error({ err, id }, 'api.admin.emails.auditoria.preview.failed');
    return Response.json(
      { error: 'Erro ao gerar prévia do e-mail', details: err?.message },
      { status: 500 }
    );
  }
}
