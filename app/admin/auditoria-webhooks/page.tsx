'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/toast';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCw,
  Eye,
  X,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Code,
  Layers,
  ShieldCheck,
  Terminal,
  RefreshCw,
  FileJson,
  Calendar,
  Key,
  Info,
} from 'lucide-react';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface WebhookLog {
  id: string;
  provider: 'asaas' | 'zapsign' | 'wix' | string;
  event_type: string;
  external_id: string | null;
  signature_valid: boolean | null;
  payload: any;
  processed: boolean;
  error_message: string | null;
  retry_count: number;
  last_retried_at: string | null;
  request_headers: Record<string, any> | null;
  created_at: string;
}

interface WebhookStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
  successRate: number;
  byProvider: {
    asaas: number;
    zapsign: number;
    wix: number;
  };
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0) return 'agora';
    if (diffInSeconds < 60) return 'agora há pouco';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `há ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `há ${diffInDays} ${diffInDays === 1 ? 'dia' : 'dias'}`;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function getProviderBadge(provider: string) {
  const p = (provider || '').toLowerCase();
  switch (p) {
    case 'asaas':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
          Asaas
        </span>
      );
    case 'zapsign':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
          ZapSign
        </span>
      );
    case 'wix':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
          Wix
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
          {provider || 'Indefinido'}
        </span>
      );
  }
}

export default function AuditoriaWebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Estados de Ação
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchReprocessing, setBatchReprocessing] = useState(false);

  // Modal de Inspeção
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [activeTab, setActiveTab] = useState<'payload' | 'headers' | 'metadata'>('payload');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedHeaders, setCopiedHeaders] = useState(false);

  // Trava de Scroll do Body quando modal estiver aberto
  useBodyScrollLock(!!selectedLog || batchModalOpen);

  // Listener para fechar modal com tecla ESC
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (batchModalOpen) {
          setBatchModalOpen(false);
        } else if (selectedLog) {
          setSelectedLog(null);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog, batchModalOpen]);

  // Carregar dados de auditoria
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (search.trim()) params.set('search', search.trim());
      if (providerFilter) params.set('provider', providerFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/webhooks/auditoria?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setLogs(data.logs || []);
        setStats(data.stats || null);
        setTotalFiltered(data.totalFiltered || 0);

        // Se o modal estiver aberto, atualiza o item selecionado se mudou
        if (selectedLog) {
          const updated = (data.logs || []).find((l: WebhookLog) => l.id === selectedLog.id);
          if (updated) setSelectedLog(updated);
        }
      } else {
        toast.error(data.error || 'Erro ao carregar auditoria de webhooks');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha de comunicação com o servidor');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, providerFilter, statusFilter, selectedLog]);

  useEffect(() => {
    loadData();
  }, [page, limit, providerFilter, statusFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  function handleClearFilters() {
    setSearch('');
    setProviderFilter('');
    setStatusFilter('');
    setPage(1);
  }

  // Reprocessar evento único
  async function handleReprocessSingle(id: string) {
    if (reprocessingId) return;
    setReprocessingId(id);
    try {
      const res = await fetch(`/api/admin/webhooks/${id}/reprocessar`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok && data.success) {
        toast.success(data.message || 'Webhook reprocessado com sucesso!');
        await loadData();
      } else {
        toast.error(data.message || data.error || 'Falha ao reprocessar webhook');
        await loadData();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao comunicar reprocessamento');
    } finally {
      setReprocessingId(null);
    }
  }

  // Reprocessar em lote
  async function handleReprocessBatch() {
    setBatchReprocessing(true);
    try {
      const res = await fetch('/api/admin/webhooks/reprocessar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.ok) {
        toast.success(
          `Reprocessamento concluído: ${data.succeeded} sucesso(s), ${data.failed} falha(s) de ${data.processed} processados.`
        );
        setBatchModalOpen(false);
        await loadData();
      } else {
        toast.error(data.error || 'Erro ao executar reprocessamento em lote');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro de rede no reprocessamento em lote');
    } finally {
      setBatchReprocessing(false);
    }
  }

  // Copiar Payload
  async function handleCopyPayload() {
    if (!selectedLog?.payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedLog.payload, null, 2));
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
      toast.info('Payload JSON copiado para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar o payload');
    }
  }

  // Copiar Headers
  async function handleCopyHeaders() {
    if (!selectedLog?.request_headers) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedLog.request_headers, null, 2));
      setCopiedHeaders(true);
      setTimeout(() => setCopiedHeaders(false), 2000);
      toast.info('Cabeçalhos HTTP copiados para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar os cabeçalhos');
    }
  }

  const totalPages = Math.ceil(totalFiltered / limit) || 1;
  const hasActiveFilters = Boolean(search || providerFilter || statusFilter);

  return (
    <div className="space-y-6">
      {/* 1. Header da Página */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4 text-[#00d4e0]" />
            Painel de Desenvolvimento & Auditoria
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
            <Webhook className="h-6 w-6 text-primary" />
            Auditoria de Webhooks
            <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-[#0e4a5a] border border-cyan-200">
              Tempo Real
            </span>
          </h1>
          <p className="mt-1 text-sm text-gray-600 max-w-3xl">
            Rastreamento em tempo real de requisições de webhooks recebidas (Asaas, ZapSign e Wix) com histórico de falhas e reprocessamento direto.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats && stats.failed > 0 && (
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800 shadow-xs hover:bg-rose-100 transition-colors"
            >
              <RotateCw className="h-4 w-4 text-rose-600" />
              Reprocessar Falhas ({stats.failed})
            </button>
          )}

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* 2. Cards de Métricas & KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Recebido */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total de Webhooks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Webhook className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats?.total ?? '—'}</span>
            <span className="text-xs text-gray-500">histórico completo</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats ? `${stats.success} sucesso | ${stats.failed} falha(s)` : 'Carregando métricas...'}
          </div>
        </div>

        {/* Processados com Sucesso */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Taxa de Sucesso
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">
              {stats ? `${stats.successRate}%` : '—'}
            </span>
            <span className="text-xs text-emerald-600 font-medium">eficiência de entrega</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats ? `${stats.success} eventos processados sem erro` : 'Aguardando sincronização...'}
          </div>
        </div>

        {/* Falhas / Erros Pendentes */}
        <div
          className={`rounded-xl border p-5 shadow-xs transition-colors ${
            stats?.failed && stats.failed > 0
              ? 'border-rose-200 bg-rose-50/40'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                stats?.failed && stats.failed > 0 ? 'text-rose-800' : 'text-gray-500'
              }`}
            >
              Falhas / Pendências
            </span>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                stats?.failed && stats.failed > 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                stats?.failed && stats.failed > 0 ? 'text-rose-700' : 'text-gray-900'
              }`}
            >
              {stats?.failed ?? 0}
            </span>
            <span
              className={`text-xs ${
                stats?.failed && stats.failed > 0 ? 'text-rose-600 font-semibold' : 'text-gray-500'
              }`}
            >
              {stats?.failed && stats.failed > 0
                ? 'erros pendentes de reprocessamento'
                : 'nenhuma falha pendente'}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats?.pending ? `${stats.pending} evento(s) aguardando processamento` : 'Pipeline em dia'}
          </div>
        </div>

        {/* Distribuição por Provedor */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Distribuição por Provedor
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200">
              Asaas: {stats?.byProvider.asaas ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
              ZapSign: {stats?.byProvider.zapsign ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              Wix: {stats?.byProvider.wix ?? 0}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Total somado dos 3 canais integrados
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros e Busca */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Input de Busca */}
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID externo, tipo de evento, payload ou erro..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
            />
          </div>

          {/* Filtro de Provedor */}
          <div className="md:col-span-3">
            <select
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por Provedor"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
            >
              <option value="">Todos os Provedores</option>
              <option value="asaas">Asaas (Cobranças & Cartão)</option>
              <option value="zapsign">ZapSign (Contratos & Assinaturas)</option>
              <option value="wix">Wix (Loja & E-commerce)</option>
            </select>
          </div>

          {/* Filtro de Status */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por Status"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
            >
              <option value="">Todos os Status</option>
              <option value="success">Sucesso (Processado)</option>
              <option value="failed">Falha (Com Erro)</option>
              <option value="pending">Pendente</option>
            </select>
          </div>

          {/* Filtro de Itens por Página */}
          <div className="md:col-span-2">
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Registros por página"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[40px]"
            >
              <option value="25">25 por página</option>
              <option value="50">50 por página</option>
              <option value="100">100 por página</option>
            </select>
          </div>
        </form>

        {/* Resumo da consulta & Botão de Limpar */}
        <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 gap-2">
          <span>
            Exibindo <strong>{logs.length}</strong> de <strong>{totalFiltered}</strong> registros encontrados
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-primary hover:underline font-semibold"
            >
              Limpar filtros ativos
            </button>
          )}
        </div>
      </div>

      {/* 4. Tabela de Webhooks com Scroll Seguro */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <TableScrollContainer minWidth="950px" maxHeight="max-h-[calc(100vh-340px)] min-h-[380px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Data & Hora</th>
                <th className="py-3 px-4">Provedor</th>
                <th className="py-3 px-4">Evento</th>
                <th className="py-3 px-4">Identificador / ID Externo</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Retentativas</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    Carregando registros de webhooks...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Webhook className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="font-semibold text-gray-700">Nenhum webhook localizado.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {hasActiveFilters
                        ? 'Tente remover os filtros ou ajustar os termos da busca.'
                        : 'Nenhuma requisição de webhook registrada até o momento.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const dateObj = new Date(log.created_at);
                  const dataFormatada = dateObj.toLocaleDateString('pt-BR');
                  const horaFormatada = dateObj.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const relativeTime = formatRelativeTime(log.created_at);
                  const isReprocessing = reprocessingId === log.id;
                  const isSuccess = log.processed && (!log.error_message || log.error_message === '');
                  const isFailed = Boolean(log.error_message && log.error_message.trim() !== '');

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Data & Hora */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-600">
                        <div className="font-semibold text-gray-900">
                          {dataFormatada} {horaFormatada}
                        </div>
                        <div className="text-[10px] text-gray-400 font-sans">{relativeTime}</div>
                      </td>

                      {/* Provedor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getProviderBadge(log.provider)}
                      </td>

                      {/* Evento */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900 font-mono text-[11px]">
                          {log.event_type}
                        </div>
                        {log.signature_valid === false && (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 mt-0.5 border border-rose-200">
                            Assinatura Inválida
                          </span>
                        )}
                      </td>

                      {/* Identificador / ID Externo */}
                      <td className="py-3 px-4 font-mono text-[11px] text-gray-600 max-w-[200px] truncate">
                        {log.external_id ? (
                          <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded font-mono text-[11px]" title={log.external_id}>
                            {log.external_id}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Não informado</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Sucesso
                          </span>
                        )}
                        {isFailed && (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 border border-rose-200 cursor-pointer"
                            title={log.error_message || 'Falha de processamento'}
                            onClick={() => setSelectedLog(log)}
                          >
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            Falha
                          </span>
                        )}
                        {!isSuccess && !isFailed && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Retentativas */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {log.retry_count > 0 ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                              {log.retry_count} {log.retry_count === 1 ? 'tentativa' : 'tentativas'}
                            </span>
                            {log.last_retried_at && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {formatRelativeTime(log.last_retried_at)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">0</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-primary transition-colors"
                            title="Inspecionar Payload e Headers"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Inspecionar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReprocessSingle(log.id)}
                            disabled={isReprocessing}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-50"
                            title="Reprocessar este evento"
                          >
                            <RotateCw
                              className={`h-3.5 w-3.5 ${isReprocessing ? 'animate-spin text-primary' : 'text-gray-500'}`}
                            />
                            Reprocessar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollContainer>

        {/* 5. Paginação */}
        <div className="flex flex-wrap items-center justify-between border-t border-gray-200 bg-white px-4 py-3 text-xs gap-3">
          <div className="text-gray-500">
            Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalFiltered} registros no total)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Modal de Inspeção Completo */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-gray-200 h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho do Modal */}
            <div className="border-b border-gray-200 bg-gray-50 px-6 pt-4 pb-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Webhook className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-base leading-tight">
                        Inspeção de Requisição Webhook
                      </h3>
                      {getProviderBadge(selectedLog.provider)}
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                      Evento: <span className="font-bold text-gray-800">{selectedLog.event_type}</span> | ID:{' '}
                      {selectedLog.external_id || selectedLog.id}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  aria-label="Fechar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Abas */}
              <div className="flex items-center gap-2 border-b border-transparent">
                <button
                  type="button"
                  onClick={() => setActiveTab('payload')}
                  className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === 'payload'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <FileJson className="h-4 w-4" />
                  Payload JSON
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('headers')}
                  className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === 'headers'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Terminal className="h-4 w-4" />
                  Cabeçalhos HTTP
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('metadata')}
                  className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === 'metadata'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Info className="h-4 w-4" />
                  Metadados & Rastreamento
                </button>
              </div>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Alerta de Falha / Erro se houver */}
              {selectedLog.error_message && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <XCircle className="h-4 w-4 text-rose-600" />
                      Falha Registrada no Processamento
                    </div>
                    {selectedLog.last_retried_at && (
                      <span className="text-[11px] text-rose-600 font-medium">
                        Última tentativa: {new Date(selectedLog.last_retried_at).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-rose-950 bg-rose-100/60 p-3 rounded-lg border border-rose-200 overflow-x-auto">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}

              {/* ABA 1: PAYLOAD JSON */}
              {activeTab === 'payload' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Corpo da requisição recebida (Payload):
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-primary transition-colors"
                    >
                      {copiedPayload ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Payload Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shadow-2xs">
                    <pre className="p-4 font-mono text-xs text-gray-900 select-all whitespace-pre-wrap max-h-[440px] overflow-auto leading-relaxed">
                      {selectedLog.payload && Object.keys(selectedLog.payload).length > 0
                        ? JSON.stringify(selectedLog.payload, null, 2)
                        : 'Nenhum payload registrado para este evento.'}
                    </pre>
                  </div>
                </div>
              )}

              {/* ABA 2: CABEÇALHOS HTTP */}
              {activeTab === 'headers' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Headers HTTP enviados pelo provedor:
                    </span>
                    {selectedLog.request_headers && (
                      <button
                        type="button"
                        onClick={handleCopyHeaders}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-primary transition-colors"
                      >
                        {copiedHeaders ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Headers Copiados!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar Headers</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {selectedLog.request_headers && Object.keys(selectedLog.request_headers).length > 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shadow-2xs">
                      <pre className="p-4 font-mono text-xs text-gray-900 select-all whitespace-pre-wrap max-h-[440px] overflow-auto leading-relaxed">
                        {JSON.stringify(selectedLog.request_headers, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
                      <Layers className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p className="font-semibold text-gray-700">Nenhum cabeçalho HTTP persistido</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Os cabeçalhos HTTP podem ter sido descartados ou não informados nesta requisição.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: METADADOS & RASTREAMENTO */}
              {activeTab === 'metadata' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <span className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider block">
                      Identificação & Origem
                    </span>
                    <div>
                      <span className="text-gray-500 block text-xs">ID Interno do Log:</span>
                      <strong className="text-gray-900 font-mono text-xs break-all">{selectedLog.id}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">ID Externo do Provedor:</span>
                      <strong className="text-gray-900 font-mono text-xs">
                        {selectedLog.external_id || 'Não informado'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">Provedor:</span>
                      <strong className="capitalize text-gray-900 text-xs">{selectedLog.provider}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">Tipo de Evento:</span>
                      <strong className="text-gray-900 font-mono text-xs">{selectedLog.event_type}</strong>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <span className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider block">
                      Processamento & Ciclo de Vida
                    </span>
                    <div>
                      <span className="text-gray-500 block text-xs">Recebido em:</span>
                      <strong className="text-gray-900 text-xs">
                        {new Date(selectedLog.created_at).toLocaleString('pt-BR')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">Status do Processamento:</span>
                      <strong className="text-gray-900 text-xs">
                        {selectedLog.processed ? 'Concluído' : 'Pendente'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">Assinatura de Segurança:</span>
                      <strong className="text-gray-900 text-xs">
                        {selectedLog.signature_valid === true
                          ? 'Válida (Autêntica)'
                          : selectedLog.signature_valid === false
                          ? 'Inválida (Alerta de Segurança)'
                          : 'Não aplicável / Não verificada'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs">Total de Retentativas:</span>
                      <strong className="text-gray-900 text-xs">{selectedLog.retry_count}</strong>
                    </div>
                    {selectedLog.last_retried_at && (
                      <div>
                        <span className="text-gray-500 block text-xs">Última Retentativa:</span>
                        <strong className="text-gray-900 text-xs">
                          {new Date(selectedLog.last_retried_at).toLocaleString('pt-BR')}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex flex-wrap items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3 gap-3">
              <div className="text-xs text-gray-500">
                Log registrado em <strong>{new Date(selectedLog.created_at).toLocaleString('pt-BR')}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="min-h-[44px] rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => handleReprocessSingle(selectedLog.id)}
                  disabled={reprocessingId === selectedLog.id}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <RotateCw
                    className={`h-4 w-4 ${reprocessingId === selectedLog.id ? 'animate-spin' : ''}`}
                  />
                  Reprocessar Este Evento Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal de Confirmação de Reprocessamento em Lote */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2 text-rose-700">
                <RotateCw className="h-5 w-5" />
                <h3 className="font-bold text-gray-900 text-base">Reprocessamento de Falhas em Lote</h3>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Você está prestes a reprocessar <strong>todos os webhooks que apresentaram falha ou estão pendentes</strong> no sistema ({stats?.failed ?? 0} eventos com erro detectados).
            </p>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Aviso de Operação:</p>
                <p className="mt-0.5 text-amber-800">
                  Os eventos serão reexecutados individualmente contra as regras de negócio de pagamentos, contratos e cotações. Os contadores de retentativa serão incrementados.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                disabled={batchReprocessing}
                className="min-h-[44px] rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReprocessBatch}
                disabled={batchReprocessing}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-700 text-xs disabled:opacity-50"
              >
                {batchReprocessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Reprocessando em lote...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-4 w-4" />
                    Confirmar Reprocessamento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
