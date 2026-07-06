'use client';

import { useState } from 'react';

interface Props {
  collectionsCount: number;
  itemsCount: number;
  lastSyncedAt: string | null;
}

export default function WixPullClient({ collectionsCount, itemsCount, lastSyncedAt }: Props) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{
    collectionsSynced?: number;
    itemsSynced?: number;
    leadsUpserted?: number;
    partnersUpserted?: number;
  } | null>(null);

  async function runPull() {
    setRunning(true);
    setMessage('Executando pull do Wix...');
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync/wix/pull', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Falha ao sincronizar Wix.');
        setRunning(false);
        return;
      }

      setResult(data);
      setMessage('Sincronização concluída.');
    } catch {
      setMessage('Falha de rede ao sincronizar Wix.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card mb-6 space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Coleções espelhadas</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{collectionsCount}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Itens espelhados</div>
          <div className="mt-2 text-2xl font-black" style={{ color: 'var(--primary)' }}>{itemsCount}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Último sync</div>
          <div className="mt-2 text-sm font-bold" style={{ color: 'var(--primary)' }}>
            {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('pt-BR') : 'Ainda não executado'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={runPull}
          disabled={running}
        >
          {running ? 'Sincronizando...' : 'Puxar do Wix agora'}
        </button>
        <span className="text-sm text-gray-500">{message || 'Pull somente leitura do Wix para o banco local.'}</span>
      </div>

      {result ? (
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Coleções</div>
            <div className="mt-2 text-xl font-black">{result.collectionsSynced ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Itens</div>
            <div className="mt-2 text-xl font-black">{result.itemsSynced ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Leads</div>
            <div className="mt-2 text-xl font-black">{result.leadsUpserted ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Parceiros</div>
            <div className="mt-2 text-xl font-black">{result.partnersUpserted ?? 0}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

