import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import type { EmailDispatchLog } from '@/lib/email-service';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 50));
  const templateCode = searchParams.get('templateCode')?.trim() || null;
  const status = searchParams.get('status')?.trim() || null;

  try {
    const logs = await sql<EmailDispatchLog[]>`
      SELECT id, template_code, recipient_email, recipient_name, subject, status, provider, error_message, metadata, created_at
      FROM email_dispatch_logs
      WHERE
        (${templateCode}::text IS NULL OR template_code = ${templateCode})
        AND (${status}::text IS NULL OR status = ${status})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return Response.json({
      ok: true,
      logs,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.emails.logs.get.failed');
    return Response.json({ error: 'Erro ao buscar logs de e-mail', details: err?.message }, { status: 500 });
  }
}
