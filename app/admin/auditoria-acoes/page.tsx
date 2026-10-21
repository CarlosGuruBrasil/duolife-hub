'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '@/components/ui/toast';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
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
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  RotateCcw,
  ArrowRight,
  Terminal,
  Globe,
  User,
  Monitor,
  ExternalLink,
} from 'lucide-react';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'changed' | 'removed';
}

interface ActionAuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_role: string;
  ip_address: string | null;
  user_agent: string | null;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  description: string;
  old_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  diff: FieldDiff[] | null;
  status: 'success' | 'failure' | 'warning';
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface AuditoriaStats {
  totalRegistered: number;
  total24h: number;
  totalErrors24h: number;
  totalWarnings24h: number;
  activeUsers24h: number;
  successRate24h: number;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0 || diffInSeconds < 60) return 'agora há pouco';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `há ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'ontem';
    if (diffInDays < 7) return `há ${diffInDays} dias`;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function formatFullDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getRoleLabel(role?: string): { label: string; badgeClass: string } {
  const r = (role || '').toLowerCase();
  if (r.includes('dev')) {
    return {
      label: 'Desenvolvedor',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    };
  }
  if (r.includes('admin')) {
    return {
      label: 'Administrador',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    };
  }
  if (r.includes('staff') || r.includes('operacao')) {
    return {
      label: 'Operação',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (r.includes('partner') || r.includes('corretor')) {
    return {
      label: 'Parceiro',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (r === 'system' || r.includes('sistema')) {
    return {
      label: 'Sistema',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  }
  return {
    label: role || 'Usuário',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
  };
}

function getModuleBadge(moduleName: string) {
  const m = (moduleName || '').toLowerCase();
  switch (m) {
    case 'usuarios':
      return {
        label: 'Usuários',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    case 'corretoras':
      return {
        label: 'Corretoras',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'parceiros':
      return {
        label: 'Parceiros',
        color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
      };
    case 'vendas':
      return {
        label: 'Vendas',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'cotacoes':
      return {
        label: 'Cotações',
        color: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'produtos':
      return {
        label: 'Produtos',
        color: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    case 'chaves_api':
      return {
        label: 'Chaves API',
        color: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    case 'seguranca':
      return {
        label: 'Segurança',
        color: 'bg-red-50 text-red-700 border-red-200',
      };
    case 'configuracoes':
      return {
        label: 'Configurações',
        color: 'bg-slate-100 text-slate-800 border-slate-300',
      };
    case 'portal':
      return {
        label: 'Portal',
        color: 'bg-teal-50 text-teal-800 border-teal-200',
      };
    default:
      return {
        label: moduleName || 'Geral',
        color: 'bg-gray-100 text-gray-800 border-gray-200',
      };
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Sucesso
        </span>
      );
    case 'failure':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
          Falha
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          Alerta
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
          {status}
        </span>
      );
  }
}

function formatJsonValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

export default function AuditoriaAcoesPage() {
  const [logs, setLogs] = useState<ActionAuditLog[]>([]);
  const [stats, setStats] = useState<AuditoriaStats | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filtros
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [limit, setLimit] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Modal de Inspeção e Diff
  const [selectedLog, setSelectedLog] = useState<ActionAuditLog | null>(null);
  const [activeTab, setActiveTab] = useState<'diff' | 'old_state' | 'new_state' | 'metadata'>('diff');
  const [copiedOldState, setCopiedOldState] = useState(false);
  const [copiedNewState, setCopiedNewState] = useState(false);
  const [copiedMetadata, setCopiedMetadata] = useState(false);
  const [copiedFullJson, setCopiedFullJson] = useState(false);

  // Trava scroll da página quando modal de detalhes estiver aberto
  useBodyScrollLock(!!selectedLog);

  // Debounce da busca textual
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Listener para fechar modal com tecla ESC
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && selectedLog) {
        setSelectedLog(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog]);

  // Calcula parâmetros de data baseado no seletor de período
  const dateParams = useMemo(() => {
    const now = new Date();
    if (periodFilter === '24h') {
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString() };
    }
    if (periodFilter === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString() };
    }
    if (periodFilter === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString() };
    }
    return {};
  }, [periodFilter]);

  // Carrega dados da auditoria
  const loadLogs = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const query = new URLSearchParams();
        query.set('limit', String(limit));
        query.set('page', String(page));
        if (moduleFilter !== 'all') query.set('module', moduleFilter);
        if (statusFilter !== 'all') query.set('status', statusFilter);
        if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());
        if (dateParams.startDate) query.set('startDate', dateParams.startDate);

        const res = await fetch(`/api/admin/auditoria-acoes?${query.toString()}`);
        if (!res.ok) {
          throw new Error('Falha ao obter dados da auditoria de ações');
        }

        const data = await res.json();
        if (data.ok) {
          setLogs(data.logs || []);
          setTotalCount(data.total || 0);
          setTotalPages(data.totalPages || 1);
          if (data.stats) {
            setStats(data.stats);
          }
        } else {
          toast.error(data.error || 'Erro ao carregar auditoria');
        }
      } catch (err: any) {
        console.error('Erro ao buscar auditoria de ações:', err);
        toast.error('Erro ao conectar ao serviço de auditoria');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, page, moduleFilter, statusFilter, debouncedSearch, dateParams.startDate]
  );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Ação de download CSV direto
  const handleExportCsv = () => {
    const query = new URLSearchParams();
    if (moduleFilter !== 'all') query.set('module', moduleFilter);
    if (statusFilter !== 'all') query.set('status', statusFilter);
    if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());
    if (dateParams.startDate) query.set('startDate', dateParams.startDate);

    toast.info('Iniciando exportação CSV da auditoria de ações...');
    window.location.href = `/api/admin/auditoria-acoes/export?${query.toString()}`;
  };

  // Limpa todos os filtros
  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setModuleFilter('all');
    setStatusFilter('all');
    setPeriodFilter('all');
    setPage(1);
  };

  // Copia JSON para clipboard com feedback
  const copyToClipboard = async (text: string, type: 'old' | 'new' | 'meta' | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'old') {
        setCopiedOldState(true);
        setTimeout(() => setCopiedOldState(false), 2000);
      } else if (type === 'new') {
        setCopiedNewState(true);
        setTimeout(() => setCopiedNewState(false), 2000);
      } else if (type === 'meta') {
        setCopiedMetadata(true);
        setTimeout(() => setCopiedMetadata(false), 2000);
      } else if (type === 'all') {
        setCopiedFullJson(true);
        setTimeout(() => setCopiedFullJson(false), 2000);
      }
      toast.success('JSON copiado para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho de Página */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Auditoria de Ações
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              LGPD & Sanitização Ativa
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-cyan-50 text-[#0e4a5a] border border-cyan-200">
              <Activity className="h-3.5 w-3.5 text-[#00d4e0]" />
              Auditoria em Tempo Real
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Rastreabilidade de mutações, operações administrativas, auditoria de segurança e histórico detalhado de alterações (Diff).
          </p>
        </div>

        {/* Ações do Topo */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadLogs(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-xs transition-all hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
            title="Atualizar lista de ações"
          >
            <RefreshCw className={`h-4 w-4 text-[#0e4a5a] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-xs transition-all hover:bg-emerald-100"
            title="Exportar registros filtrados para CSV"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Quatro Cards de Métricas (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Ações Registradas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Total Registrado
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#0e4a5a] border border-teal-200">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-gray-900">
              {stats?.totalRegistered !== undefined
                ? Number(stats.totalRegistered).toLocaleString('pt-BR')
                : totalCount.toLocaleString('pt-BR')}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Operações de negócio e mutações
            </p>
          </div>
        </div>

        {/* Card 2: Ações nas Últimas 24 Horas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Ações (24h)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-gray-900">
              {stats?.total24h !== undefined
                ? Number(stats.total24h).toLocaleString('pt-BR')
                : '—'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Eventos nas últimas 24 horas
            </p>
          </div>
        </div>

        {/* Card 3: Taxa de Sucesso */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Taxa de Sucesso
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-gray-900">
              {stats?.successRate24h !== undefined ? `${stats.successRate24h}%` : '100%'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {stats?.totalErrors24h ? `${stats.totalErrors24h} falha(s) em 24h` : '100% de estabilidade'}
            </p>
          </div>
        </div>

        {/* Card 4: Usuários Ativos / Alertas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Usuários Ativos (24h)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <User className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-gray-900">
              {stats?.activeUsers24h !== undefined
                ? Number(stats.activeUsers24h).toLocaleString('pt-BR')
                : '—'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {stats?.totalWarnings24h ? `${stats.totalWarnings24h} alertas gerados` : 'Autores distintos ativos'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca por Texto */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuário, e-mail, ação, alvo..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:border-[#0e4a5a] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e4a5a]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Select de Módulo */}
          <div className="md:col-span-3">
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-[#0e4a5a] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e4a5a]"
            >
              <option value="all">Todos os Módulos</option>
              <option value="usuarios">Usuários</option>
              <option value="corretoras">Corretoras</option>
              <option value="parceiros">Parceiros</option>
              <option value="vendas">Vendas</option>
              <option value="cotacoes">Cotações</option>
              <option value="produtos">Produtos</option>
              <option value="chaves_api">Chaves API</option>
              <option value="seguranca">Segurança</option>
              <option value="configuracoes">Configurações</option>
              <option value="portal">Portal</option>
            </select>
          </div>

          {/* Select de Status */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-[#0e4a5a] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e4a5a]"
            >
              <option value="all">Todos os Status</option>
              <option value="success">Sucesso</option>
              <option value="failure">Falha</option>
              <option value="warning">Alerta</option>
            </select>
          </div>

          {/* Select de Período */}
          <div className="md:col-span-2">
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-[#0e4a5a] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0e4a5a]"
            >
              <option value="all">Todo o Período</option>
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </div>

          {/* Botão Limpar Filtros */}
          <div className="md:col-span-1 flex items-center justify-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-xs font-bold text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
              title="Redefinir filtros para o padrão"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="md:hidden">Limpar</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Tabela de Registros com TableScrollContainer */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <TableScrollContainer maxHeight="max-h-[calc(100vh-360px)] min-h-[380px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-xs border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-[160px]">Data / Hora</th>
                <th className="py-3 px-4 w-[240px]">Usuário / Autor</th>
                <th className="py-3 px-4 w-[220px]">Módulo & Ação</th>
                <th className="py-3 px-4 w-[200px]">Alvo da Ação</th>
                <th className="py-3 px-4 w-[120px] text-center">Status</th>
                <th className="py-3 px-4 w-[130px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-[#0e4a5a]" />
                      <span className="text-xs font-semibold text-gray-600">
                        Carregando registros de auditoria...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Activity className="h-8 w-8 text-gray-500" />
                      <span className="text-sm font-bold text-gray-800">
                        Nenhum registro encontrado
                      </span>
                      <p className="text-xs text-gray-500">
                        Nenhuma ação de auditoria corresponde aos filtros atuais. Tente buscar por outros termos ou limpar os filtros.
                      </p>
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="mt-2 text-xs font-bold text-[#0e4a5a] hover:underline"
                      >
                        Limpar filtros de busca
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const roleInfo = getRoleLabel(log.user_role);
                  const moduleInfo = getModuleBadge(log.module);
                  const diffCount = Array.isArray(log.diff) ? log.diff.length : 0;
                  const initials =
                    typeof log.user_name === 'string' && log.user_name.trim()
                      ? log.user_name
                          .trim()
                          .split(' ')
                          .filter(Boolean)
                          .map((p) => p[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()
                      : 'US';

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-teal-50/30 transition-colors"
                    >
                      {/* Data / Hora */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-gray-900 leading-tight">
                          {formatRelativeTime(log.created_at)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-normal mt-0.5" title={log.created_at}>
                          {formatFullDateTime(log.created_at)}
                        </div>
                      </td>

                      {/* Usuário / Autor */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0e4a5a] text-[10px] font-extrabold text-[#00d4e0] shadow-xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate max-w-[180px]">
                              {log.user_name}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[180px]">
                              {log.user_email}
                            </div>
                            <div className="mt-1">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold border ${roleInfo.badgeClass}`}
                              >
                                {roleInfo.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Módulo & Ação */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold border ${moduleInfo.color}`}
                          >
                            {moduleInfo.label}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-gray-800">
                            {log.action}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2" title={log.description}>
                          {log.description}
                        </div>
                      </td>

                      {/* Alvo da Ação */}
                      <td className="py-3 px-4 align-top">
                        {log.target_type ? (
                          <div>
                            <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 uppercase">
                              {log.target_type}
                            </span>
                            <div className="mt-1 font-semibold text-gray-900 truncate max-w-[180px]" title={log.target_name || log.target_id || ''}>
                              {log.target_name || log.target_id || '—'}
                            </div>
                            {log.target_id && log.target_name && (
                              <div className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]">
                                ID: {log.target_id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 align-top text-center">
                        {getStatusBadge(log.status)}
                        {log.status === 'failure' && log.error_message && (
                          <div className="text-[10px] text-red-600 font-mono mt-1 truncate max-w-[100px]" title={log.error_message}>
                            {log.error_message}
                          </div>
                        )}
                      </td>

                      {/* Ações (Inspecionar/Diff) */}
                      <td className="py-3 px-4 align-top text-right">
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLog(log);
                              setActiveTab('diff');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-[#0e4a5a] shadow-xs transition-all hover:bg-teal-50 hover:border-teal-300"
                            title="Ver detalhes da mutação e diff comparativo"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#00d4e0]" />
                            <span>Inspecionar</span>
                          </button>
                          {diffCount > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {diffCount} {diffCount === 1 ? 'campo alterado' : 'campos alterados'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollContainer>

        {/* Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-200 bg-gray-50/60 text-xs">
          <div className="text-gray-600">
            Mostrando <span className="font-bold text-gray-900">{logs.length}</span> de{' '}
            <span className="font-bold text-gray-900">{totalCount}</span> ações registradas
          </div>

          <div className="flex items-center gap-3">
            {/* Itens por Página */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Exibir:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0e4a5a]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Navegador de Página */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                title="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-semibold text-gray-800">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                title="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modal / Slide-over de Inspeção Detalhada com Diff Visual (Opção 3) */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="flex items-start justify-between p-5 border-b border-gray-200 bg-gray-50/80">
              <div className="min-w-0 pr-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold border ${getModuleBadge(selectedLog.module).color}`}
                  >
                    {getModuleBadge(selectedLog.module).label}
                  </span>
                  <span className="font-mono text-xs font-bold text-gray-800">
                    {selectedLog.action}
                  </span>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <h2 className="text-lg font-black text-gray-900 leading-snug break-words">
                  {selectedLog.description}
                </h2>
                <div className="text-xs text-gray-500 mt-0.5">
                  Registrado em {formatFullDateTime(selectedLog.created_at)} ({formatRelativeTime(selectedLog.created_at)})
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                title="Fechar janela (ESC)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Painel de Metadados do Autor (Barra Superior de Contexto) */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Autor */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Autor
                  </span>
                  <div className="font-bold text-gray-900 mt-1 truncate">
                    {selectedLog.user_name}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {selectedLog.user_email}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold border ${getRoleLabel(selectedLog.user_role).badgeClass}`}
                    >
                      {getRoleLabel(selectedLog.user_role).label}
                    </span>
                  </div>
                </div>

                {/* IP & Conexão */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Endereço IP
                  </span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-gray-800 mt-1">
                    <Globe className="h-3.5 w-3.5 text-gray-400" />
                    <span>{selectedLog.ip_address || '127.0.0.1 (Local)'}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 truncate" title={selectedLog.user_agent || ''}>
                    {selectedLog.user_agent || 'User-Agent não fornecido'}
                  </div>
                </div>

                {/* Alvo */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Alvo da Operação
                  </span>
                  <div className="font-bold text-gray-900 mt-1 truncate">
                    {selectedLog.target_name || selectedLog.target_id || 'Global'}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">
                    {selectedLog.target_type ? `Tipo: ${selectedLog.target_type}` : 'Sem alvo específico'}
                  </div>
                </div>

                {/* ID do Log */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    ID do Registro
                  </span>
                  <div className="font-mono text-[11px] text-gray-800 font-bold truncate mt-1">
                    {selectedLog.id}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedLog.id);
                      toast.success('ID copiado com sucesso');
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#0e4a5a] hover:underline"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copiar ID</span>
                  </button>
                </div>
              </div>

              {/* Mensagem de Erro se status for failure */}
              {selectedLog.status === 'failure' && selectedLog.error_message && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <XCircle className="h-4 w-4 text-rose-600" />
                    <span>Falha na Execução da Ação</span>
                  </div>
                  <pre className="font-mono text-[11px] whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}
            </div>

            {/* Barra de Abas do Modal */}
            <div className="flex items-center gap-2 px-5 border-b border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setActiveTab('diff')}
                className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'diff'
                    ? 'border-[#0e4a5a] text-[#0e4a5a]'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Comparativo (Diff)</span>
                {Array.isArray(selectedLog.diff) && selectedLog.diff.length > 0 && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px]">
                    {selectedLog.diff.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('old_state')}
                className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'old_state'
                    ? 'border-[#0e4a5a] text-[#0e4a5a]'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>Estado Anterior (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('new_state')}
                className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'new_state'
                    ? 'border-[#0e4a5a] text-[#0e4a5a]'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>Novo Estado (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('metadata')}
                className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'metadata'
                    ? 'border-[#0e4a5a] text-[#0e4a5a]'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Metadados</span>
              </button>
            </div>

            {/* Conteúdo das Abas (Corpo com rolagem independente) */}
            <div className="flex-1 overflow-y-auto p-5 bg-gray-50/50">
              {/* Aba 1: Comparativo (Diff Visual) */}
              {activeTab === 'diff' && (
                <div>
                  {Array.isArray(selectedLog.diff) && selectedLog.diff.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-gray-500">
                        {selectedLog.diff.length} {selectedLog.diff.length === 1 ? 'campo alterado' : 'campos alterados'} nesta mutação:
                      </div>

                      <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-xs">
                        {selectedLog.diff.map((item, idx) => (
                          <div key={idx} className="p-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                                {item.field}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                  item.type === 'changed'
                                    ? 'bg-amber-100 text-amber-800'
                                    : item.type === 'added'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {item.type === 'changed'
                                  ? 'Modificado'
                                  : item.type === 'added'
                                  ? 'Adicionado'
                                  : 'Removido'}
                              </span>
                            </div>

                            {/* Conteúdo do Diff */}
                            {item.type === 'changed' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                                {/* Antes */}
                                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                                    Antes
                                  </div>
                                  <pre className="font-mono text-xs text-rose-900 break-words whitespace-pre-wrap line-through">
                                    {formatJsonValue(item.oldValue)}
                                  </pre>
                                </div>

                                {/* Depois */}
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                                    Depois
                                  </div>
                                  <pre className="font-mono text-xs text-emerald-900 font-bold break-words whitespace-pre-wrap">
                                    {formatJsonValue(item.newValue)}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {item.type === 'added' && (
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                                  Novo Valor Inserido
                                </div>
                                <pre className="font-mono text-xs text-emerald-900 font-bold break-words whitespace-pre-wrap">
                                  {formatJsonValue(item.newValue)}
                                </pre>
                              </div>
                            )}

                            {item.type === 'removed' && (
                              <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                                  Valor Anterior Removido
                                </div>
                                <pre className="font-mono text-xs text-rose-900 break-words whitespace-pre-wrap line-through">
                                  {formatJsonValue(item.oldValue)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                      <Layers className="h-10 w-10 text-gray-500 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-gray-800">
                        Nenhum diff estrutural detectado
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                        Esta ação foi registrada com sucesso, mas não gerou alteração direta entre estados de entidade ou é um evento exclusivamente pontual.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Aba 2: Estado Anterior (JSON) */}
              {activeTab === 'old_state' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">
                      Cópia do snapshot antes da execução:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(selectedLog.old_state, null, 2) || '{}',
                          'old'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      {copiedOldState ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-gray-500" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-x-auto shadow-xs">
                    <pre className="font-mono text-xs text-gray-800 leading-relaxed">
                      {selectedLog.old_state
                        ? JSON.stringify(selectedLog.old_state, null, 2)
                        : '// Nenhum estado anterior registrado (ação de criação inicial ou sem dados anteriores).'}
                    </pre>
                  </div>
                </div>
              )}

              {/* Aba 3: Novo Estado (JSON) */}
              {activeTab === 'new_state' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">
                      Cópia do snapshot após a execução:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(selectedLog.new_state, null, 2) || '{}',
                          'new'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      {copiedNewState ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-gray-500" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-x-auto shadow-xs">
                    <pre className="font-mono text-xs text-gray-800 leading-relaxed">
                      {selectedLog.new_state
                        ? JSON.stringify(selectedLog.new_state, null, 2)
                        : '// Nenhum novo estado registrado (ação de exclusão permanente ou sem novos dados).'}
                    </pre>
                  </div>
                </div>
              )}

              {/* Aba 4: Metadados */}
              {activeTab === 'metadata' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">
                      Metadados da requisição e contexto de auditoria:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(selectedLog.metadata, null, 2) || '{}',
                          'meta'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      {copiedMetadata ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-gray-500" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-x-auto shadow-xs">
                    <pre className="font-mono text-xs text-gray-800 leading-relaxed">
                      {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0
                        ? JSON.stringify(selectedLog.metadata, null, 2)
                        : '// Nenhum metadado extra registrado.'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50/80">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(JSON.stringify(selectedLog, null, 2), 'all')
                }
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50"
              >
                {copiedFullJson ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Registro Completo Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-gray-500" />
                    <span>Copiar Registro Completo</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-[#0e4a5a] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#093540] transition-colors"
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
