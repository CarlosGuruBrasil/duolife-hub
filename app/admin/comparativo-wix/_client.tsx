'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Database,
  Globe,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  X,
  ExternalLink,
  Layers,
  Columns2,
  Calendar,
  Phone,
  Mail,
  FileText,
  User,
  ShieldCheck,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import type { WixComparisonResult, ComparedClientRow, MatchStatus, FieldDiff, WixSyncResult } from '@/lib/wix-compare';

interface Props {
  initialData: WixComparisonResult;
}

function formatDocument(value: string | null | undefined) {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return value;
  }
}

function formatPhone(value: string | null | undefined) {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value;
}

export default function WixComparisonClient({ initialData }: Props) {
  const [data, setData] = useState<WixComparisonResult>(initialData);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<WixSyncResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MatchStatus>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('unified');
  const [selectedRow, setSelectedRow] = useState<ComparedClientRow | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setRefreshError(null);
    try {
      const res = await fetch('/api/admin/comparativo-wix', {
        method: 'GET',
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setRefreshError(json.error || 'Falha ao atualizar dados do Wix.');
      }
    } catch (err) {
      setRefreshError('Erro de conexão ao buscar dados atualizados.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncWix() {
    if (!window.confirm('Tem certeza que deseja copiar os clientes faltantes do Wix para o banco local e atualizar todos os dados divergentes usando o Wix como fonte de verdade?')) {
      return;
    }

    setSyncing(true);
    setRefreshError(null);
    setSyncResult(null);

    try {
      const res = await fetch('/api/admin/comparativo-wix', {
        method: 'POST',
      });
      const json = await res.json();
      if (json.ok && json.sync) {
        setSyncResult(json.sync);
        if (json.data) {
          setData(json.data);
        }
      } else {
        setRefreshError(json.error || 'Falha ao executar sincronização do Wix.');
      }
    } catch (err) {
      setRefreshError('Erro de conexão durante a sincronização com o banco local.');
    } finally {
      setSyncing(false);
    }
  }

  function handleCopyJson(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const filteredRows = useMemo(() => {
    return data.rows
      .filter((row) => {
        // Filtro por status
        if (statusFilter !== 'all' && row.matchStatus !== statusFilter) {
          return false;
        }

        // Filtro por texto
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase().trim();
        const name = (row.primaryName || '').toLowerCase();
        const doc = (row.primaryDocument || '').replace(/\D/g, '');
        const email = (row.primaryEmail || '').toLowerCase();
        const phone = (row.primaryPhone || '').replace(/\D/g, '');
        const wixId = (row.wixRecord?.id || '').toLowerCase();
        const dbId = (row.dbRecord?.id || '').toLowerCase();

        return (
          name.includes(q) ||
          doc.includes(q.replace(/\D/g, '')) ||
          email.includes(q) ||
          phone.includes(q.replace(/\D/g, '')) ||
          wixId.includes(q) ||
          dbId.includes(q)
        );
      })
      .sort((a, b) => {
        if (sortOrder === 'name') {
          return a.primaryName.localeCompare(b.primaryName, 'pt-BR');
        }
        const timeA = a.latestDate ? new Date(a.latestDate).getTime() : 0;
        const timeB = b.latestDate ? new Date(b.latestDate).getTime() : 0;
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      });
  }, [data.rows, statusFilter, searchTerm, sortOrder]);

  const summary = data.summary;

  return (
    <div className="space-y-6">
      {/* 1. Header Hero Card no Padrão Apple HIG / DuoLife Design System */}
      <section className="bg-white rounded-2xl border border-gray-200/80 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-xs font-bold text-[#0e4a5a] mb-3">
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#00d4e0]" />
              <span>TESTE & AUDITORIA DE SINCRONIZAÇÃO</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
              Comparativo de Clientes (Banco vs. Wix Import1)
            </h1>
            <p className="text-gray-600 text-sm md:text-base mt-2 max-w-3xl">
              Visualização de todos os clientes em ordem cronológica de cadastro (dos mais novos aos mais antigos)
              no banco de dados local cruzados com os dados da coleção <strong>Import1</strong> do Wix.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleSyncWix}
              disabled={syncing || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-white ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando Banco...' : 'Copiar do Wix & Atualizar Banco'}
            </button>

            <button
              onClick={handleRefresh}
              disabled={loading || syncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#0b3a47] text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-[#00d4e0] ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Consultando Wix...' : 'Recarregar Comparativo'}
            </button>

            <Link
              href="/admin/sync"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm shadow-2xs transition-all"
            >
              <ExternalLink className="w-4 h-4 text-gray-500" />
              Sincronização Geral
            </Link>
          </div>
        </div>

        {/* Banner de Resultado da Sincronização */}
        {syncResult && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 animate-in fade-in duration-200">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">
                    Sincronização com o Wix Concluída com Sucesso!
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    <strong>{syncResult.importedCount}</strong> novos clientes importados •{' '}
                    <strong>{syncResult.updatedCount}</strong> clientes existentes atualizados com dados do Wix •{' '}
                    <strong>{syncResult.unchangedCount}</strong> sem alterações necessárias ({((syncResult.durationMs || 0) / 1000).toFixed(2)}s).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Status da Fonte Wix */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">Fonte de Dados Wix:</span>
            {summary.wixSource === 'live_api' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                API Wix em Tempo Real (Live)
              </span>
            )}
            {summary.wixSource === 'mirror_db' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Espelho Local (wix_items)
              </span>
            )}
            {summary.wixSource === 'unavailable' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 font-bold">
                Indisponível / Chaves Pendentes
              </span>
            )}
            {summary.wixErrorMessage && (
              <span className="text-red-500 italic">({summary.wixErrorMessage})</span>
            )}
          </div>

          <div className="text-gray-400">
            Última checagem: {formatDateTime(data.generatedAt)}
          </div>
        </div>

        {refreshError && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{refreshError}</span>
          </div>
        )}
      </section>

      {/* 2. Metric KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Banco */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <Database className="w-4 h-4 text-[#0e4a5a]" />
            <span>Banco Local</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-[#0e4a5a]">{summary.totalDb}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Clientes cadastrados</div>
        </div>

        {/* Total Wix Import1 */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <Globe className="w-4 h-4 text-[#00d4e0]" />
            <span>Wix Import1</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-gray-900">{summary.totalWix}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Registros na coleção</div>
        </div>

        {/* Sincronizados Exatos */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Idênticos</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600">{summary.syncedExact}</div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">Sem divergências</div>
        </div>

        {/* Divergências */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-amber-700 text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Divergentes</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-600">{summary.divergent}</div>
          <div className="text-[11px] text-amber-700/80 mt-0.5">Diferença em campos</div>
        </div>

        {/* Apenas Banco */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-cyan-800 text-xs font-semibold uppercase tracking-wider">
            <Database className="w-4 h-4 text-cyan-600" />
            <span>Só no Banco</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-cyan-700">{summary.onlyDb}</div>
          <div className="text-[11px] text-cyan-800/80 mt-0.5">Ausentes no Wix</div>
        </div>

        {/* Apenas Wix */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-purple-800 text-xs font-semibold uppercase tracking-wider">
            <Globe className="w-4 h-4 text-purple-600" />
            <span>Só no Wix</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-purple-700">{summary.onlyWix}</div>
          <div className="text-[11px] text-purple-800/80 mt-0.5">Não importados</div>
        </div>
      </div>

      {/* 3. Toolbar: Search, Filters, Sorting & View Toggle */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone ou ID..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d4e0] focus:border-transparent transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-[#0e4a5a] text-white shadow-2xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({data.rows.length})
          </button>
          <button
            onClick={() => setStatusFilter('synced')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'synced'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Idênticos ({summary.syncedExact})
          </button>
          <button
            onClick={() => setStatusFilter('divergent')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'divergent'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Divergências ({summary.divergent})
          </button>
          <button
            onClick={() => setStatusFilter('only_db')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'only_db'
                ? 'bg-cyan-700 text-white shadow-2xs'
                : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100 border border-cyan-200'
            }`}
          >
            Só Banco ({summary.onlyDb})
          </button>
          <button
            onClick={() => setStatusFilter('only_wix')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'only_wix'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            Só Wix ({summary.onlyWix})
          </button>
        </div>

        {/* View mode & Sort */}
        <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-gray-100">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'name')}
            className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00d4e0]"
          >
            <option value="newest">Mais recentes primeiro</option>
            <option value="oldest">Mais antigos primeiro</option>
            <option value="name">Nome (A - Z)</option>
          </select>

          <div className="flex rounded-xl bg-gray-100 p-0.5 border border-gray-200">
            <button
              onClick={() => setViewMode('unified')}
              title="Visão Unificada"
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'unified' ? 'bg-white text-[#0e4a5a] shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              title="Visão Lado a Lado"
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'side-by-side' ? 'bg-white text-[#0e4a5a] shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Columns2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Tabela de Comparativo */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
              <HelpCircle size={28} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Nenhum registro encontrado</h2>
            <p className="text-gray-500 text-sm mt-1 max-w-sm">
              Tente alterar os filtros ou o termo de busca pesquisado.
            </p>
          </div>
        ) : viewMode === 'unified' ? (
          /* MODO UNIFICADO */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-gray-50/90 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Status Match</th>
                  <th className="px-5 py-3.5">Cliente / Documento</th>
                  <th className="px-5 py-3.5">Contato</th>
                  <th className="px-5 py-3.5">Data Cadastro (Banco)</th>
                  <th className="px-5 py-3.5">Data Wix (Import1)</th>
                  <th className="px-5 py-3.5">Status Cliente</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setSelectedRow(row)}
                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                  >
                    {/* Status Match Pill */}
                    <td className="px-5 py-4">
                      {row.matchStatus === 'synced' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sincronizado
                        </span>
                      )}
                      {row.matchStatus === 'divergent' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {row.divergences.length} divergência{row.divergences.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {row.matchStatus === 'only_db' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                          <Database className="w-3.5 h-3.5 text-cyan-600" /> Só no Banco
                        </span>
                      )}
                      {row.matchStatus === 'only_wix' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          <Globe className="w-3.5 h-3.5 text-purple-600" /> Só no Wix
                        </span>
                      )}
                    </td>

                    {/* Cliente / Documento */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{row.primaryName}</span>
                        {row.wixSubmissionsCount && row.wixSubmissionsCount > 1 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-50 text-[#0e4a5a] border border-cyan-200" title="Cliente com múltiplos envios/históricos na coleção Import1 do Wix">
                            {row.wixSubmissionsCount} registros Wix
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">
                        {formatDocument(row.primaryDocument)}
                      </div>
                    </td>

                    {/* Contato */}
                    <td className="px-5 py-4 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span>{row.primaryEmail || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500 mt-1">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatPhone(row.primaryPhone)}</span>
                      </div>
                    </td>

                    {/* Data Cadastro Banco */}
                    <td className="px-5 py-4 text-xs">
                      {row.dbRecord ? (
                        <div className="flex items-center gap-1.5 text-gray-800 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-[#0e4a5a]" />
                          <span>{formatDateTime(row.dbRecord.createdAt)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Ausente no banco</span>
                      )}
                    </td>

                    {/* Data Wix */}
                    <td className="px-5 py-4 text-xs">
                      {row.wixRecord ? (
                        <div className="flex items-center gap-1.5 text-gray-800 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-[#00d4e0]" />
                          <span>{formatDateTime(row.wixRecord.createdDate || row.wixRecord.updatedDate)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Ausente no Wix</span>
                      )}
                    </td>

                    {/* Status Cliente */}
                    <td className="px-5 py-4 text-xs">
                      <div className="font-semibold text-gray-700">
                        {row.dbRecord?.statusCliente || row.wixRecord?.statusCliente || row.dbRecord?.status || row.wixRecord?.status || '-'}
                      </div>
                      {row.dbRecord?.partnerNames && (
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[160px]">
                          {row.dbRecord.partnerNames}
                        </div>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(row);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-[#0e4a5a] hover:text-white text-gray-700 text-xs font-bold transition-colors"
                      >
                        Inspecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* MODO LADO A LADO */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-left text-sm">
              <thead className="bg-gray-50/90 border-b border-gray-200 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5 text-gray-500 w-36">Match</th>
                  <th colSpan={3} className="px-5 py-3.5 bg-cyan-50/60 text-[#0e4a5a] border-r border-gray-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Database className="w-4 h-4 text-[#0e4a5a]" /> BANCO DE DADOS LOCAL (ORDEM DE CADASTRO)
                    </span>
                  </th>
                  <th colSpan={3} className="px-5 py-3.5 bg-teal-50/60 text-[#0e4a5a]">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Globe className="w-4 h-4 text-[#00d4e0]" /> WIX COLEÇÃO IMPORT1
                    </span>
                  </th>
                  <th className="px-5 py-3.5 text-right"></th>
                </tr>
                <tr className="bg-gray-50/50 text-[11px] text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2">Cliente & CPF</th>
                  <th className="px-5 py-2">Contato Banco</th>
                  <th className="px-5 py-2 border-r border-gray-200">Cadastro Banco</th>
                  <th className="px-5 py-2">Nome & CPF Wix</th>
                  <th className="px-5 py-2">Contato Wix</th>
                  <th className="px-5 py-2">Cadastro Wix</th>
                  <th className="px-5 py-2 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setSelectedRow(row)}
                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                  >
                    {/* Status Match */}
                    <td className="px-5 py-4">
                      {row.matchStatus === 'synced' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Idêntico
                        </span>
                      )}
                      {row.matchStatus === 'divergent' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> Diff ({row.divergences.length})
                        </span>
                      )}
                      {row.matchStatus === 'only_db' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                          <Database className="w-3 h-3 text-cyan-600" /> Só Banco
                        </span>
                      )}
                      {row.matchStatus === 'only_wix' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          <Globe className="w-3 h-3 text-purple-600" /> Só Wix
                        </span>
                      )}
                    </td>

                    {/* DB: Cliente */}
                    <td className="px-5 py-4">
                      {row.dbRecord ? (
                        <div>
                          <div className="font-bold text-gray-900">{row.dbRecord.fullName}</div>
                          <div className="text-xs font-mono text-gray-500">{formatDocument(row.dbRecord.documentNumber)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Não cadastrado</span>
                      )}
                    </td>

                    {/* DB: Contato */}
                    <td className="px-5 py-4 text-xs text-gray-600">
                      {row.dbRecord ? (
                        <div>
                          <div>{row.dbRecord.email || '-'}</div>
                          <div className="text-gray-400 text-[11px]">{formatPhone(row.dbRecord.phone)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* DB: Cadastro */}
                    <td className="px-5 py-4 text-xs text-gray-700 border-r border-gray-200">
                      {row.dbRecord ? (
                        <span className="font-medium">{formatDateTime(row.dbRecord.createdAt)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Wix: Cliente */}
                    <td className="px-5 py-4">
                      {row.wixRecord ? (
                        <div>
                          <div className="font-bold text-gray-900">{row.wixRecord.name || '(Sem nome)'}</div>
                          <div className="text-xs font-mono text-gray-500">{formatDocument(row.wixRecord.documentNumber)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Não encontrado no Wix</span>
                      )}
                    </td>

                    {/* Wix: Contato */}
                    <td className="px-5 py-4 text-xs text-gray-600">
                      {row.wixRecord ? (
                        <div>
                          <div>{row.wixRecord.email || '-'}</div>
                          <div className="text-gray-400 text-[11px]">{formatPhone(row.wixRecord.phone)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Wix: Cadastro */}
                    <td className="px-5 py-4 text-xs text-gray-700">
                      {row.wixRecord ? (
                        <span className="font-medium">{formatDateTime(row.wixRecord.createdDate || row.wixRecord.updatedDate)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(row);
                        }}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-[#0e4a5a] hover:text-white text-gray-600 transition-colors"
                        title="Ver detalhes completos"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Modal / Drawer de Inspeção Detalhada */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Detalhes do Comparativo
                  </span>
                  {selectedRow.matchStatus === 'synced' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Sincronizado
                    </span>
                  )}
                  {selectedRow.matchStatus === 'divergent' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Com Divergências
                    </span>
                  )}
                  {selectedRow.matchStatus === 'only_db' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">
                      Apenas no Banco Local
                    </span>
                  )}
                  {selectedRow.matchStatus === 'only_wix' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                      Apenas no Wix Import1
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-gray-900">{selectedRow.primaryName}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Documento: {formatDocument(selectedRow.primaryDocument)}
                </p>
              </div>

              <button
                onClick={() => setSelectedRow(null)}
                className="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Divergências em destaque se houver */}
              {selectedRow.divergences.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Divergências Identificadas ({selectedRow.divergences.length})</span>
                  </div>
                  <div className="space-y-2">
                    {selectedRow.divergences.map((diff, idx) => (
                      <div key={idx} className="bg-white/80 p-3 rounded-xl border border-amber-200/60 text-xs">
                        <div className="font-bold text-gray-800 mb-1">{diff.label}</div>
                        <div className="grid grid-cols-2 gap-2 text-gray-700">
                          <div className="p-2 rounded bg-cyan-50/50 border border-cyan-100">
                            <span className="font-semibold text-cyan-900 block mb-0.5">Banco Local:</span>
                            <span className="font-mono">{diff.dbValue || '(vazio)'}</span>
                          </div>
                          <div className="p-2 rounded bg-teal-50/50 border border-teal-100">
                            <span className="font-semibold text-teal-900 block mb-0.5">Wix Import1:</span>
                            <span className="font-mono">{diff.wixValue || '(vazio)'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabela Comparativa Campo a Campo */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Comparação Campo a Campo
                </h4>
                <div className="rounded-2xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-600">
                      <tr>
                        <th className="px-4 py-2.5 w-1/4">Campo</th>
                        <th className="px-4 py-2.5 w-3/8 bg-cyan-50/40 text-cyan-950">Banco Local</th>
                        <th className="px-4 py-2.5 w-3/8 bg-teal-50/40 text-teal-950">Wix Import1</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">ID do Registro</td>
                        <td className="px-4 py-2.5 font-mono text-gray-600 truncate max-w-[180px]">
                          {selectedRow.dbRecord?.id || '-'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-600 truncate max-w-[180px]">
                          {selectedRow.wixRecord?.id || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">Nome</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.dbRecord?.fullName || '-'}</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.wixRecord?.name || '-'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">CPF / Documento</td>
                        <td className="px-4 py-2.5 font-mono text-gray-800">
                          {formatDocument(selectedRow.dbRecord?.documentNumber)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-800">
                          {formatDocument(selectedRow.wixRecord?.documentNumber)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">E-mail</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.dbRecord?.email || '-'}</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.wixRecord?.email || '-'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">Telefone / Celular</td>
                        <td className="px-4 py-2.5 text-gray-800">{formatPhone(selectedRow.dbRecord?.phone)}</td>
                        <td className="px-4 py-2.5 text-gray-800">{formatPhone(selectedRow.wixRecord?.phone)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">Data de Cadastro</td>
                        <td className="px-4 py-2.5 font-medium text-[#0e4a5a]">
                          {formatDateTime(selectedRow.dbRecord?.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#00d4e0]">
                          {formatDateTime(selectedRow.wixRecord?.createdDate || selectedRow.wixRecord?.updatedDate)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">Status</td>
                        <td className="px-4 py-2.5 text-gray-800">
                          {selectedRow.dbRecord?.statusCliente || selectedRow.dbRecord?.status || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-800">
                          {selectedRow.wixRecord?.statusCliente || selectedRow.wixRecord?.status || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-bold text-gray-700">Parceiro / Código</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.dbRecord?.partnerNames || '-'}</td>
                        <td className="px-4 py-2.5 text-gray-800">{selectedRow.wixRecord?.partnerCode || '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Histórico de Múltiplos Envios no Wix se houver */}
              {selectedRow.allWixRecords && selectedRow.allWixRecords.length > 1 && (
                <div className="p-4 rounded-2xl bg-cyan-50/70 border border-cyan-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#0e4a5a] uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-[#00d4e0]" />
                      Histórico de Registros no Wix Import1 ({selectedRow.allWixRecords.length} envios)
                    </span>
                    <span className="text-[11px] text-[#0e4a5a] font-semibold">
                      Mesmo CPF com múltiplos envios no Wix
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedRow.allWixRecords.map((wItem, wIdx) => (
                      <div key={wIdx} className="bg-white p-3 rounded-xl border border-cyan-100 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                            <span>{wItem.name || 'Sem nome'}</span>
                            {wIdx === 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                                Mais recente (Principal)
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 text-[11px] font-mono mt-0.5">
                            ID Wix: {wItem.id} • Tel: {formatPhone(wItem.phone)} • Email: {wItem.email || '-'}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-[#0e4a5a]">
                            {wItem.statusCliente || wItem.status || 'Sem status'}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {formatDateTime(wItem.createdDate || wItem.updatedDate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payloads Brutos em JSON */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* JSON DB */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-[#0e4a5a]" /> Metadados Banco Local
                    </span>
                    {selectedRow.dbRecord && (
                      <button
                        onClick={() =>
                          handleCopyJson(
                            JSON.stringify(selectedRow.dbRecord, null, 2),
                            'db-json'
                          )
                        }
                        className="text-[11px] text-gray-500 hover:text-gray-900 flex items-center gap-1"
                      >
                        {copiedKey === 'db-json' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copiar JSON
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <pre className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-48">
                    {selectedRow.dbRecord
                      ? JSON.stringify(selectedRow.dbRecord, null, 2)
                      : '// Registro ausente no banco de dados local'}
                  </pre>
                </div>

                {/* JSON Wix */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-[#00d4e0]" /> Payload Bruto Wix Import1
                    </span>
                    {selectedRow.wixRecord && (
                      <button
                        onClick={() =>
                          handleCopyJson(
                            JSON.stringify(selectedRow.wixRecord, null, 2),
                            'wix-json'
                          )
                        }
                        className="text-[11px] text-gray-500 hover:text-gray-900 flex items-center gap-1"
                      >
                        {copiedKey === 'wix-json' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copiar JSON
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <pre className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-48">
                    {selectedRow.wixRecord
                      ? JSON.stringify(selectedRow.wixRecord, null, 2)
                      : '// Registro ausente na coleção Import1 do Wix'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="text-xs text-gray-500">
                {selectedRow.dbRecord?.id && (
                  <Link
                    href={`/admin/clientes/${selectedRow.dbRecord.id}`}
                    className="text-[#0e4a5a] font-bold hover:underline inline-flex items-center gap-1"
                  >
                    Abrir página do cliente na carteira <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold text-xs transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
