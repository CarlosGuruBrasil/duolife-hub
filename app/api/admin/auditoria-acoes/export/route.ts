import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { ensureSchema } from '@/lib/schema';
import { listActionAuditLogs, type ActionAuditLog } from '@/lib/action-audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function formatarDataHora(val: string | Date | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarDetalhesAlterados(log: ActionAuditLog): string {
  if (Array.isArray(log.diff) && log.diff.length > 0) {
    return log.diff
      .map((d) => {
        const oldVal = d.oldValue !== null && d.oldValue !== undefined ? JSON.stringify(d.oldValue) : '(vazio)';
        const newVal = d.newValue !== null && d.newValue !== undefined ? JSON.stringify(d.newValue) : '(removido)';
        return `${d.field}: ${oldVal} -> ${newVal}`;
      })
      .join(' | ');
  }

  if (log.error_message) {
    return `Erro: ${log.error_message}`;
  }

  if (log.new_state && typeof log.new_state === 'object' && Object.keys(log.new_state).length > 0) {
    try {
      return JSON.stringify(log.new_state);
    } catch {
      return '[Objeto]';
    }
  }

  return '-';
}

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsDev(user.role)) {
    return Response.json(
      { error: 'Acesso restrito a desenvolvedores' },
      { status: 403 }
    );
  }

  await ensureSchema();

  const searchParams = req.nextUrl.searchParams;
  const search = (searchParams.get('search') || searchParams.get('q'))?.trim() || undefined;

  const moduleParam = searchParams.get('module')?.trim();
  const module = moduleParam && moduleParam !== 'all' ? moduleParam : undefined;

  const actionParam = searchParams.get('action')?.trim();
  const action = actionParam && actionParam !== 'all' ? actionParam : undefined;

  const statusParam = searchParams.get('status')?.trim();
  const status = statusParam && statusParam !== 'all' ? statusParam : undefined;

  const userId = searchParams.get('userId')?.trim() || undefined;
  const startDate = searchParams.get('startDate')?.trim() || undefined;
  const endDate = searchParams.get('endDate')?.trim() || undefined;

  try {
    const { logs } = await listActionAuditLogs({
      search,
      module,
      action,
      status,
      userId,
      startDate,
      endDate,
      limit: 2000,
      offset: 0,
    });

    const headers = [
      'Data/Hora',
      'Usuário',
      'E-mail',
      'Papel',
      'Módulo',
      'Ação',
      'Alvo',
      'Status',
      'Descrição',
      'IP',
      'Detalhes Alterados',
    ];

    const rows = logs.map((log) => {
      const dataHora = formatarDataHora(log.created_at);
      const usuario = log.user_name || 'Sistema';
      const email = log.user_email || '';
      const papel = log.user_role || '';
      const modulo = log.module || '';
      const acao = log.action || '';
      const alvo = [log.target_name, log.target_id].filter(Boolean).join(' - ') || log.target_type || '';
      const statusLog = log.status || '';
      const descricao = log.description || '';
      const ip = log.ip_address || '';
      const detalhes = formatarDetalhesAlterados(log);

      return [
        escapeCsv(dataHora),
        escapeCsv(usuario),
        escapeCsv(email),
        escapeCsv(papel),
        escapeCsv(modulo),
        escapeCsv(acao),
        escapeCsv(alvo),
        escapeCsv(statusLog),
        escapeCsv(descricao),
        escapeCsv(ip),
        escapeCsv(detalhes),
      ].join(';');
    });

    // Cabeçalho UTF-8 com BOM (\uFEFF) para correta acentuação no Microsoft Excel em português
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(';'), ...rows].join('\r\n');
    const filename = `auditoria-acoes-duolife-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.auditoria-acoes.export_failed');
    return Response.json(
      { error: 'Erro ao exportar auditoria de ações para CSV', details: err?.message },
      { status: 500 }
    );
  }
}
