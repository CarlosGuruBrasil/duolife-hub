'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';

interface Props {
  collectionsCount: number;
  itemsCount: number;
  lastSyncedAt: string | null;
  wixEnabled: boolean;
}

export default function WixPullClient({ collectionsCount, itemsCount, lastSyncedAt, wixEnabled }: Props) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{
    collectionsSynced?: number;
    itemsSynced?: number;
    leadsUpserted?: number;
    clientsUpserted?: number;
    partnersUpserted?: number;
  } | null>(null);

  async function runPull() {
    if (!wixEnabled) return;
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

  const [runningSales, setRunningSales] = useState(false);
  const [salesMessage, setSalesMessage] = useState('');
  const [salesResult, setSalesResult] = useState<{
    salesCreated?: number;
    salesUpdated?: number;
    quotesCreated?: number;
    quotesUpdated?: number;
    totalRevenue?: number;
  } | null>(null);

  async function runSalesSync() {
    setRunningSales(true);
    setSalesMessage('Migrando e sincronizando vendas do Wix Import1...');
    setSalesResult(null);

    try {
      const response = await fetch('/api/admin/sync/wix/sales', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setSalesMessage(data.error || 'Falha ao sincronizar vendas do Wix.');
        setRunningSales(false);
        return;
      }

      setSalesResult(data.data);
      setSalesMessage('Sincronização de vendas concluída com sucesso!');
    } catch {
      setSalesMessage('Falha de rede ao sincronizar vendas.');
    } finally {
      setRunningSales(false);
    }
  }

  return (
    <div className="space-y-6 mb-6">
      {/* Card de Espelho de Coleções */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-black text-gray-900">Espelho Geral de Coleções (Wix Data)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sincroniza estrutura bruta e dados de leads/clientes.</p>
          </div>
        </div>

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
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Última sincronização</div>
            <div className="mt-2 text-sm font-bold" style={{ color: 'var(--primary)' }}>
              {lastSyncedAt ? formatDateTime(lastSyncedAt) : 'Ainda não executado'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={runPull}
            disabled={running || !wixEnabled}
          >
            {running ? 'Sincronizando...' : wixEnabled ? 'Sincronizar Espelho Wix' : 'Wix desligado'}
          </button>
          <span className="text-sm text-gray-500">
            {message || (wixEnabled ? 'Importação de coleções do Wix para o banco local.' : 'Ligue a integração em Configurações para importar.')}
          </span>
        </div>

        {result ? (
          <div className="grid gap-3 md:grid-cols-5">
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
              <div className="text-xs uppercase tracking-wide text-gray-500">Clientes</div>
              <div className="mt-2 text-xl font-black">{result.clientsUpserted ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Parceiros</div>
              <div className="mt-2 text-xl font-black">{result.partnersUpserted ?? 0}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card de Migração de Vendas & Apólices (Wix Import1) */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-black text-gray-900">Migração de Vendas & Apólices (Wix Import1)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Converte todos os negócios fechados e pagos do Wix Import1 em apólices ativas oficiais, cotações emitidas e comissões da NET4Life.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={runSalesSync}
            disabled={runningSales}
          >
            {runningSales ? 'Sincronizando Vendas...' : 'Sincronizar Vendas do Wix'}
          </button>
          <span className="text-sm text-gray-500">
            {salesMessage || 'Processa as propostas da Import1 e popula o módulo de Vendas (/admin/vendas) de forma idempotente.'}
          </span>
        </div>

        {salesResult ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
              <div className="text-xs uppercase tracking-wide text-teal-700 font-bold">Vendas Criadas</div>
              <div className="mt-2 text-2xl font-black text-teal-900">{salesResult.salesCreated ?? 0}</div>
              <div className="text-[11px] text-teal-600 mt-1">novas apólices ativas</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Vendas Atualizadas</div>
              <div className="mt-2 text-2xl font-black text-gray-900">{salesResult.salesUpdated ?? 0}</div>
              <div className="text-[11px] text-gray-400 mt-1">dados sincronizados</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Cotações Geradas</div>
              <div className="mt-2 text-2xl font-black text-gray-900">{salesResult.quotesCreated ?? 0}</div>
              <div className="text-[11px] text-gray-400 mt-1">histórico registrado</div>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
              <div className="text-xs uppercase tracking-wide text-teal-700 font-bold">Volume Total (Prêmio)</div>
              <div className="mt-2 text-xl font-black text-teal-900">
                {(salesResult.totalRevenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <div className="text-[11px] text-teal-600 mt-1">prêmio emitido</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
