import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { isNet4LifeInfoEnabled, getNet4LifeInfoConfig } from '@/lib/system-settings';
import type { EmailDispatchLog } from '@/lib/email-service';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito a desenvolvedores e administradores' }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(10, Number(searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
  const search = searchParams.get('search')?.trim() || null;
  const status = searchParams.get('status')?.trim() || null;
  const provider = searchParams.get('provider')?.trim() || null;
  const templateCode = searchParams.get('templateCode')?.trim() || null;

  try {
    // 1. Estatísticas gerais dos envios
    const [statsRow] = await sql<{
      total: number;
      sent_count: number;
      failed_count: number;
      mocked_count: number;
      net4life_count: number;
      smtp_count: number;
      mock_count: number;
    }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'mocked')::int AS mocked_count,
        COUNT(*) FILTER (WHERE provider = 'net4life_api')::int AS net4life_count,
        COUNT(*) FILTER (WHERE provider = 'nodemailer_smtp')::int AS smtp_count,
        COUNT(*) FILTER (WHERE provider = 'mock')::int AS mock_count
      FROM email_dispatch_logs
    `;

    // 2. Status dos Provedores no Sistema
    const net4lifeEnabled = await isNet4LifeInfoEnabled();
    const net4lifeConfig = await getNet4LifeInfoConfig();
    const smtpHost = process.env.SMTP_HOST?.trim();
    const hasSmtpConfig = !!smtpHost && smtpHost !== '127.0.0.1' && smtpHost !== 'localhost';

    const systemStatus = {
      isDev: process.env.NODE_ENV !== 'production',
      net4life: {
        enabled: net4lifeEnabled,
        hasApiUrl: !!net4lifeConfig.apiUrl,
        hasApiToken: !!net4lifeConfig.apiToken,
        active: net4lifeEnabled && !!net4lifeConfig.apiUrl && !!net4lifeConfig.apiToken,
      },
      smtp: {
        configured: hasSmtpConfig,
        host: smtpHost || null,
        port: process.env.SMTP_PORT || null,
        user: process.env.SMTP_USER ? '***' : null,
      },
      activeProvider: (net4lifeEnabled && !!net4lifeConfig.apiUrl && !!net4lifeConfig.apiToken)
        ? 'net4life_api'
        : hasSmtpConfig
        ? 'nodemailer_smtp'
        : process.env.NODE_ENV !== 'production'
        ? 'mock'
        : 'nenhum',
    };

    // 3. Consulta de logs com filtros e paginação
    const searchPattern = search ? `%${search}%` : null;

    const logs = await sql<EmailDispatchLog[]>`
      SELECT
        id,
        template_code,
        recipient_email,
        recipient_name,
        subject,
        status,
        provider,
        error_message,
        metadata,
        created_at
      FROM email_dispatch_logs
      WHERE
        (${status}::text IS NULL OR status = ${status})
        AND (${provider}::text IS NULL OR provider = ${provider})
        AND (${templateCode}::text IS NULL OR template_code = ${templateCode})
        AND (
          ${searchPattern}::text IS NULL
          OR recipient_email ILIKE ${searchPattern}
          OR recipient_name ILIKE ${searchPattern}
          OR subject ILIKE ${searchPattern}
          OR template_code ILIKE ${searchPattern}
        )
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // 4. Contagem total filtrada para controle de paginação
    const [filteredCountRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM email_dispatch_logs
      WHERE
        (${status}::text IS NULL OR status = ${status})
        AND (${provider}::text IS NULL OR provider = ${provider})
        AND (${templateCode}::text IS NULL OR template_code = ${templateCode})
        AND (
          ${searchPattern}::text IS NULL
          OR recipient_email ILIKE ${searchPattern}
          OR recipient_name ILIKE ${searchPattern}
          OR subject ILIKE ${searchPattern}
          OR template_code ILIKE ${searchPattern}
        )
    `;

    return Response.json({
      ok: true,
      logs,
      totalFiltered: filteredCountRow?.count || 0,
      stats: {
        total: statsRow?.total || 0,
        sent: statsRow?.sent_count || 0,
        failed: statsRow?.failed_count || 0,
        mocked: statsRow?.mocked_count || 0,
        successRate: statsRow?.total && statsRow.total > 0
          ? Math.round(((statsRow.sent_count + statsRow.mocked_count) / statsRow.total) * 100)
          : 100,
        byProvider: {
          net4life: statsRow?.net4life_count || 0,
          smtp: statsRow?.smtp_count || 0,
          mock: statsRow?.mock_count || 0,
        },
      },
      systemStatus,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.emails.auditoria.failed');
    return Response.json({ error: 'Erro ao carregar auditoria de e-mails', details: err?.message }, { status: 500 });
  }
}
