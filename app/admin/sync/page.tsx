import { redirect } from 'next/navigation';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import WixPullClient from './_client';

export const dynamic = 'force-dynamic';

interface SyncRow {
  id: string;
  entity_type: string;
  entity_id: string;
  source_system: string;
  direction: string;
  event_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default async function AdminSyncPage() {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const [summary] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE status = 'error')   AS error_count,
      COUNT(*) FILTER (WHERE source_system = 'wix') AS wix_count,
      COUNT(*) FILTER (WHERE source_system = 'duolife-public-link') AS public_link_count
    FROM sync_log
  `;

  const [mirrorSummary] = await sql`
    SELECT
      COUNT(*) AS collections_count,
      COALESCE((SELECT COUNT(*) FROM wix_items), 0) AS items_count,
      MAX(last_synced_at) AS last_synced_at
    FROM wix_collections
  `;

  const logs = await sql<SyncRow[]>`
    SELECT id, entity_type, entity_id, source_system, direction, event_type, status, error_message, created_at
    FROM sync_log
    ORDER BY created_at DESC
    LIMIT 100
  `;

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <RefreshCw size={24} style={{ color: 'var(--primary)' }} />
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>Sync</h1>
          <p className="text-gray-500 text-sm mt-1">Pull do Wix, links públicos e integrações externas.</p>
        </div>
      </div>

      <WixPullClient
        collectionsCount={Number(mirrorSummary?.collections_count || 0)}
        itemsCount={Number(mirrorSummary?.items_count || 0)}
        lastSyncedAt={mirrorSummary?.last_synced_at || null}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sucessos</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{Number(summary?.success_count || 0)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Erros</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{Number(summary?.error_count || 0)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Eventos Wix</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{Number(summary?.wix_count || 0)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Links públicos</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{Number(summary?.public_link_count || 0)}</div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum evento de sync registrado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Origem</th>
                  <th className="px-5 py-3 font-semibold">Tipo</th>
                  <th className="px-5 py-3 font-semibold">Entidade</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="table-row">
                    <td className="px-5 py-4 text-gray-500">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-4 text-gray-600">{log.source_system}</td>
                    <td className="px-5 py-4 text-gray-600">{log.event_type}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {log.entity_type} · {log.entity_id}
                    </td>
                    <td className="px-5 py-4">
                      <span className="status-pill">{log.status}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {log.error_message ? (
                        <span className="inline-flex items-center gap-2 text-red-600">
                          <TriangleAlert size={14} />
                          {log.error_message}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
