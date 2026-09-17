'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Database,
  Users,
  Target,
  Briefcase,
  Layers,
  Award,
  CheckSquare,
  Square,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  HelpCircle,
  FileSignature,
  FileCheck,
} from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { WixCollectionStatusInfo, WixPullResult, WixPullEntitiesSelection } from '@/lib/wix-pull';
import type { ZapSignSyncSummary } from '@/lib/zapsign-sync';

interface Props {
  collectionsCount: number;
  itemsCount: number;
  lastSyncedAt: string | null;
  wixEnabled: boolean;
  initialCollections?: WixCollectionStatusInfo[];
  initialZapSignStatus?: ZapSignSyncSummary;
}

export default function WixPullClient({
  collectionsCount: initialCollectionsCount,
  itemsCount: initialItemsCount,
  lastSyncedAt: initialLastSyncedAt,
  wixEnabled,
  initialCollections = [],
  initialZapSignStatus = { totalTokens: 0, signedTokens: 0, pendingTokens: 0 },
}: Props) {
  // Estado das Coleções
  const [collections, setCollections] = useState<WixCollectionStatusInfo[]>(initialCollections);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    initialCollections.map((c) => c.id)
  );

  // Estado das Entidades a Atualizar no Banco Local
  const [entities, setEntities] = useState<WixPullEntitiesSelection>({
    mirror: true,
    clients: true,
    leads: true,
    partners: true,
    products: true,
    sales: false,
  });

  // Filtros de Execução
  const [onlyNew, setOnlyNew] = useState(false);
  const [createdAfterMode, setCreatedAfterMode] = useState<'all' | 'custom'>('all');
  const [createdAfterDate, setCreatedAfterDate] = useState('');

  // Status de Execução
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<WixPullResult | null>(null);

  // Módulo de Vendas Rápido
  const [runningSales, setRunningSales] = useState(false);
  const [salesMessage, setSalesMessage] = useState('');
  const [salesResult, setSalesResult] = useState<{
    salesCreated?: number;
    salesUpdated?: number;
    quotesCreated?: number;
    quotesUpdated?: number;
    totalRevenue?: number;
  } | null>(null);

  // Módulo de Reconciliação ZapSign
  const [zapStatus, setZapStatus] = useState<ZapSignSyncSummary>(initialZapSignStatus);
  const [runningZapSign, setRunningZapSign] = useState(false);
  const [zapOnlyPending, setZapOnlyPending] = useState(true);
  const [zapMessage, setZapMessage] = useState('');
  const [zapResult, setZapResult] = useState<{
    totalTokensFound?: number;
    totalProcessed?: number;
    updatedToSigned?: number;
    stillPending?: number;
    notFoundOrError?: number;
    durationMs?: number;
  } | null>(null);

  // Alternar seleção de coleção
  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function selectAllCollections() {
    setSelectedCollections(collections.map((c) => c.id));
  }

  function deselectAllCollections() {
    setSelectedCollections([]);
  }

  // Alternar entidades
  function toggleEntity(key: keyof WixPullEntitiesSelection) {
    setEntities((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const activeEntitiesCount = Object.values(entities).filter(Boolean).length;

  async function refreshCollectionsStatus() {
    try {
      const res = await fetch('/api/admin/sync/wix/pull');
      const data = await res.json();
      if (data.ok && Array.isArray(data.collections)) {
        setCollections(data.collections);
      }
    } catch {}
  }

  async function runCustomPull(forceAll = false) {
    if (!wixEnabled) return;
    setRunning(true);
    setMessage(forceAll ? 'Executando sincronização geral do Wix...' : 'Sincronizando informações selecionadas do Wix...');
    setResult(null);

    try {
      const payload = forceAll
        ? {
            collections: undefined,
            entities: {
              mirror: true,
              clients: true,
              leads: true,
              partners: true,
              products: true,
              sales: false,
            },
            onlyNew: false,
            createdAfter: undefined,
          }
        : {
            collections: selectedCollections.length > 0 ? selectedCollections : undefined,
            entities,
            onlyNew,
            createdAfter: createdAfterMode === 'custom' && createdAfterDate ? `${createdAfterDate}T00:00:00.000Z` : undefined,
          };

      const response = await fetch('/api/admin/sync/wix/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error || 'Falha ao sincronizar Wix.');
        setRunning(false);
        return;
      }

      setResult(data.data || data);
      setMessage('Sincronização concluída com sucesso!');
      await refreshCollectionsStatus();
    } catch {
      setMessage('Falha de rede ao sincronizar Wix.');
    } finally {
      setRunning(false);
    }
  }

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

  async function runZapSignSync() {
    setRunningZapSign(true);
    setZapMessage('Consultando API da ZapSign e reconciliando contratos...');
    setZapResult(null);

    try {
      const response = await fetch('/api/admin/sync/zapsign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyPending: zapOnlyPending, limit: 500, concurrency: 4 }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setZapMessage(data.error || 'Falha ao reconciliar contratos com a ZapSign.');
        setRunningZapSign(false);
        return;
      }

      setZapResult(data.result);
      setZapMessage(
        `Reconciliação concluída! ${data.result.updatedToSigned} contrato(s) atualizado(s) para Assinado.`
      );

      // Atualiza contadores
      const statusRes = await fetch('/api/admin/sync/zapsign');
      const statusData = await statusRes.json();
      if (statusData.ok && statusData.status) {
        setZapStatus(statusData.status);
      }
    } catch {
      setZapMessage('Falha de rede ao conectar com a API da ZapSign.');
    } finally {
      setRunningZapSign(false);
    }
  }

  return (
    <div className="space-y-6 mb-8">
      {/* CARD PRINCIPAL: CENTRAL DE SINCRONIZAÇÃO WIX */}
      <div className="card space-y-6 bg-white border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Wix Data v2
              </span>
              <span className="text-xs text-gray-500">· Filtros Granulares e Módulos</span>
            </div>
            <h2 className="text-xl font-black text-gray-900 mt-1">Sincronização Customizável do Wix</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Escolha exatamente quais coleções puxar da nuvem Wix e quais tabelas atualizar no banco de dados local.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshCollectionsStatus}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors"
              title="Atualizar lista de coleções do banco e Wix"
            >
              <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
              Recarregar Coleções
            </button>
          </div>
        </div>

        {/* Resumo Rápido */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Coleções Mapeadas</div>
            <div className="mt-1 text-2xl font-black text-primary">
              {collections.length || initialCollectionsCount}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Itens Espelhados (wix_items)</div>
            <div className="mt-1 text-2xl font-black text-primary">
              {initialItemsCount}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Última Sincronização Geral</div>
            <div className="mt-1 text-sm font-bold text-gray-800">
              {initialLastSyncedAt ? formatDateTime(initialLastSyncedAt) : 'Ainda não executado'}
            </div>
          </div>
        </div>

        {/* PASSO 1: ESCOLHER QUAIS COLEÇÕES BAIXAR DO WIX */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-black flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                Coleções do Wix a Consultar
              </h3>
              <span className="text-xs text-gray-500">
                ({selectedCollections.length} de {collections.length} selecionadas)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllCollections}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Marcar Todas
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={deselectAllCollections}
                className="text-xs font-semibold text-gray-500 hover:underline"
              >
                Desmarcar Todas
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((col) => {
              const isSelected = selectedCollections.includes(col.id);
              return (
                <div
                  key={col.id}
                  onClick={() => toggleCollection(col.id)}
                  className={`border-2 rounded-xl p-3.5 cursor-pointer transition-all hover:shadow-xs select-none ${
                    isSelected
                      ? 'border-primary/80 bg-teal-50/40'
                      : 'border-gray-200 bg-white hover:border-gray-300 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 text-primary">
                        {isSelected ? (
                          <CheckSquare size={17} className="text-primary" />
                        ) : (
                          <Square size={17} className="text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 leading-tight">
                          {col.displayName || col.id}
                        </div>
                        <div className="text-[11px] font-mono text-gray-500 mt-0.5">
                          ID: {col.id}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      Itens locais: <strong className="text-gray-800">{col.itemsCount}</strong>
                    </span>
                    <span>
                      {col.lastSyncedAt ? formatDateTime(col.lastSyncedAt) : 'Sem sync'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PASSO 2: ESCOLHER QUAIS INFORMAÇÕES ATUALIZAR NO BANCO */}
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-black flex items-center justify-center">
              2
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Informações & Módulos a Atualizar no Banco Local
            </h3>
            <span className="text-xs text-gray-500">
              ({activeEntitiesCount} módulos ativos)
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Espelho Geral */}
            <div
              onClick={() => toggleEntity('mirror')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.mirror
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.mirror ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Database size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Espelho Bruto (wix_items)</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Grava réplica exata em JSON no banco de dados para consulta e auditoria.
                  </p>
                </div>
              </div>
            </div>

            {/* Clientes */}
            <div
              onClick={() => toggleEntity('clients')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.clients
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.clients ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Users size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Clientes Segurados</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Atualiza cadastro central (<code className="text-[11px]">insurance_clients</code>) com CPF, dados e contatos.
                  </p>
                </div>
              </div>
            </div>

            {/* Leads */}
            <div
              onClick={() => toggleEntity('leads')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.leads
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.leads ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Target size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Leads & Propostas</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Atualiza funil comercial na tabela <code className="text-[11px]">leads</code> a partir da coleção Import1.
                  </p>
                </div>
              </div>
            </div>

            {/* Parceiros / Vendedores */}
            <div
              onClick={() => toggleEntity('partners')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.partners
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.partners ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Briefcase size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Parceiros & Corretores</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Cadastra corretores e seus códigos de venda da coleção Usuarios em <code className="text-[11px]">partners</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Produtos / Planos */}
            <div
              onClick={() => toggleEntity('products')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.products
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.products ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Layers size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Produtos & Planos</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Sincroniza coberturas e serviços das coleções Planos e Seguros em <code className="text-[11px]">products</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Vendas & Apólices */}
            <div
              onClick={() => toggleEntity('sales')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-xs select-none ${
                entities.sales
                  ? 'border-primary/80 bg-teal-50/40'
                  : 'border-gray-200 bg-white hover:border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {entities.sales ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Award size={15} className="text-primary" />
                    <span className="text-sm font-bold text-gray-900">Vendas, Apólices & Comissões</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Gera apólices vigentes e cotações fechadas em <code className="text-[11px]">sales</code> (Import1).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PASSO 3: REGRAS E FILTROS DE ATUALIZAÇÃO */}
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-black flex items-center justify-center">
              3
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Filtros e Regras de Atualização
            </h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Filtro por Período */}
            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Calendar size={16} className="text-primary" />
                <span>Período de Criação no Wix</span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="radio"
                    name="periodMode"
                    checked={createdAfterMode === 'all'}
                    onChange={() => setCreatedAfterMode('all')}
                    className="accent-[#0e4a5a]"
                  />
                  <span>Todos os períodos históricos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="radio"
                    name="periodMode"
                    checked={createdAfterMode === 'custom'}
                    onChange={() => setCreatedAfterMode('custom')}
                    className="accent-[#0e4a5a]"
                  />
                  <span>Apenas itens criados a partir de:</span>
                </label>

                {createdAfterMode === 'custom' && (
                  <input
                    type="date"
                    value={createdAfterDate}
                    onChange={(e) => setCreatedAfterDate(e.target.value)}
                    className="mt-1 w-full text-xs font-medium px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />
                )}
              </div>
            </div>

            {/* Modo de Gravação */}
            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Filter size={16} className="text-primary" />
                <span>Modo de Sobrescrita</span>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={onlyNew}
                    onChange={(e) => setOnlyNew(e.target.checked)}
                    className="mt-0.5 accent-[#0e4a5a]"
                  />
                  <div>
                    <span className="text-gray-900">Apenas novos registros (não sobrescrever existentes)</span>
                    <p className="text-[11px] font-normal text-gray-500 mt-0.5">
                      Se ativado, clientes e leads que já constam no banco local não terão seus dados alterados.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* BARRA DE AÇÃO & BOTÕES DE SINCRONIZAÇÃO */}
        <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
              onClick={() => runCustomPull(false)}
              disabled={running || !wixEnabled || selectedCollections.length === 0}
            >
              {running ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Sincronizar Informações Selecionadas ({selectedCollections.length} coleções · {activeEntitiesCount} módulos)
                </>
              )}
            </button>

            <button
              type="button"
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              onClick={() => runCustomPull(true)}
              disabled={running || !wixEnabled}
              title="Executa o pull padrão de todas as coleções do Wix"
            >
              Sincronizar Tudo (Padrão Completo)
            </button>
          </div>

          <div className="text-xs text-gray-500">
            {message || (wixEnabled ? 'Pronto para sincronizar conforme filtros.' : 'Integração Wix desligada nas Configurações.')}
          </div>
        </div>

        {/* FEEDBACK DETALHADO DO RESULTADO */}
        {result && (
          <div className="mt-4 p-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>Sincronização Concluída com Sucesso!</span>
              </div>
              <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <Clock size={13} />
                {(result.durationMs / 1000).toFixed(2)}s decorridos
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Coleções</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.collectionsSynced ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Itens Espelhados</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.itemsSynced ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Clientes</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.clientsUpserted ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Leads</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.leadsUpserted ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Parceiros</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.partnersUpserted ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Produtos</div>
                <div className="mt-1 text-xl font-black text-gray-900">{result.productsUpserted ?? 0}</div>
              </div>
            </div>

            {result.salesCreated !== undefined && (result.salesCreated > 0 || result.salesUpdated! > 0) && (
              <div className="pt-2 border-t border-emerald-200 grid gap-3 grid-cols-2 sm:grid-cols-4">
                <div className="rounded-xl border border-teal-200 bg-white p-3">
                  <div className="text-[11px] uppercase tracking-wide text-teal-700 font-bold">Vendas Criadas</div>
                  <div className="mt-1 text-lg font-black text-teal-900">{result.salesCreated ?? 0}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Vendas Atualizadas</div>
                  <div className="mt-1 text-lg font-black text-gray-900">{result.salesUpdated ?? 0}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Cotações Geradas</div>
                  <div className="mt-1 text-lg font-black text-gray-900">{result.quotesCreated ?? 0}</div>
                </div>
                <div className="rounded-xl border border-teal-200 bg-white p-3">
                  <div className="text-[11px] uppercase tracking-wide text-teal-700 font-bold">Volume Emitido</div>
                  <div className="mt-1 text-lg font-black text-teal-900">
                    {(result.totalRevenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CARD SECUNDÁRIO: MIGRAÇÃO RÁPIDA DE VENDAS & APÓLICES (Wix Import1) */}
      <div className="card space-y-5 bg-white border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Migração Rápida de Vendas & Apólices (Wix Import1)</h2>
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
            {runningSales ? 'Sincronizando Vendas...' : 'Sincronizar Apenas Vendas do Wix'}
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

      {/* CARD TERCIÁRIO: RECONCILIAÇÃO DE CONTRATOS ZAPSIGN */}
      <div className="card space-y-5 bg-white border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSignature size={18} className="text-primary" />
              <h2 className="text-lg font-black text-gray-900">Reconciliação de Contratos ZapSign</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Consulta a API oficial da ZapSign para validar o status real de cada token, atualizar documentos para &quot;Assinado&quot; e capturar o PDF com o protocolo de assinatura.
            </p>
          </div>
        </div>

        {/* Contadores ZapSign */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total com Token ZapSign</div>
            <div className="mt-1 text-2xl font-black text-primary">{zapStatus.totalTokens}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">contratos identificados</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Assinados no Sistema</div>
            <div className="mt-1 text-2xl font-black text-emerald-800">{zapStatus.signedTokens}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">status &quot;signed&quot; confirmado</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pendentes de Validação</div>
            <div className="mt-1 text-2xl font-black text-amber-800">{zapStatus.pendingTokens}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">aguardando confirmação</div>
          </div>
        </div>

        {/* Controles de Disparo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={runZapSignSync}
              disabled={runningZapSign}
            >
              {runningZapSign ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Consultando ZapSign...</span>
                </>
              ) : (
                <>
                  <FileCheck size={16} />
                  <span>Sincronizar Assinaturas ZapSign</span>
                </>
              )}
            </button>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={zapOnlyPending}
                onChange={(e) => setZapOnlyPending(e.target.checked)}
                className="accent-[#0e4a5a]"
              />
              <span>Consultar apenas pendentes</span>
            </label>
          </div>

          <div className="text-xs text-gray-500">
            {zapMessage || 'Valida tokens via GET /docs/{token}/ com pool de conexões seguro.'}
          </div>
        </div>

        {/* Resultados ZapSign */}
        {zapResult && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Reconciliação ZapSign Concluída!</span>
              </div>
              <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <Clock size={13} />
                {((zapResult.durationMs || 0) / 1000).toFixed(2)}s decorridos
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Processados</div>
                <div className="mt-1 text-xl font-black text-gray-900">{zapResult.totalProcessed ?? 0}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-bold">Atualizados p/ Assinado</div>
                <div className="mt-1 text-xl font-black text-emerald-800">{zapResult.updatedToSigned ?? 0}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-amber-700 font-bold">Ainda Pendentes</div>
                <div className="mt-1 text-xl font-black text-amber-800">{zapResult.stillPending ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Erros / Não Achados</div>
                <div className="mt-1 text-xl font-black text-gray-900">{zapResult.notFoundOrError ?? 0}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
