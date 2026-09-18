'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  MailCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Server,
  Eye,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
  Terminal,
  Layers,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface EmailDispatchLog {
  id: string;
  template_code: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: 'sent' | 'failed' | 'mocked';
  provider: string;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface AuditoriaStats {
  total: number;
  sent: number;
  failed: number;
  mocked: number;
  successRate: number;
  byProvider: {
    net4life: number;
    smtp: number;
    mock: number;
  };
}

interface SystemStatus {
  isDev: boolean;
  net4life: {
    enabled: boolean;
    hasApiUrl: boolean;
    hasApiKey: boolean;
    active: boolean;
  };
  smtp: {
    configured: boolean;
    host: string | null;
    port: string | null;
    user: string | null;
  };
  activeProvider: string;
}

export default function AuditoriaEmailsPage() {
  const [logs, setLogs] = useState<EmailDispatchLog[]>([]);
  const [stats, setStats] = useState<AuditoriaStats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Modal de Inspeção Detalhada
  const [selectedLog, setSelectedLog] = useState<EmailDispatchLog | null>(null);

  // Modal de Disparo de Teste de Diagnóstico
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testSubject, setTestSubject] = useState('Diagnóstico de Conectividade SMTP / Net4Life');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Bloqueio seguro de scroll durante exibição do drawer/modal de inspeção ou teste
  useBodyScrollLock(!!selectedLog || testModalOpen);

  const [isPending, startTransition] = useTransition();

  async function loadAuditoriaData() {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (providerFilter) params.set('provider', providerFilter);

      const res = await fetch(`/api/admin/emails/auditoria?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setLogs(data.logs || []);
        setStats(data.stats || null);
        setSystemStatus(data.systemStatus || null);
        setTotalFiltered(data.totalFiltered || 0);
      } else {
        setError(data.error || 'Falha ao carregar registros de auditoria.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de comunicação ao carregar auditoria.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuditoriaData();
  }, [page, limit, statusFilter, providerFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadAuditoriaData();
  }

  async function handleSendDiagnostics() {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: testSubject,
          htmlContent: `
            <div style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px;">
              <h2 style="color: #0e4a5a; margin-top: 0;">Diagnóstico de Conectividade do DuoLife Hub</h2>
              <p>Este é um e-mail oficial de teste disparado pelo painel de <strong>Auditoria de Desenvolvimento</strong>.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                <p style="margin: 4px 0;"><strong>Finalidade:</strong> Verificação de rotas e entrega SMTP / Net4Life Info</p>
              </div>
              <p style="color: #64748b; font-size: 13px;">Se você recebeu esta mensagem, o pipeline de entrega está operacional.</p>
            </div>
          `,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTestResult({
          success: true,
          message: `E-mail de diagnóstico enviado com sucesso para ${data.sentTo} via ${data.provider}. (ID: ${data.messageId || 'ok'})`,
        });
        // Recarrega logs para refletir o novo disparo
        setTimeout(() => loadAuditoriaData(), 1000);
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Falha ao disparar e-mail de teste.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Erro de rede ao disparar teste.',
      });
    } finally {
      setTestSending(false);
    }
  }

  const totalPages = Math.ceil(totalFiltered / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header da Página */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" />
            Painel de Desenvolvimento & Auditoria
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
            Auditoria de Envio de E-mails & Gatilhos
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Rastreamento ponta a ponta de disparos transacionais, logs de entrega, status de provedores e inspeção de payloads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTestResult(null);
              setTestModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
          >
            <Send className="h-4 w-4 text-primary" />
            Disparo de Diagnóstico
          </button>

          <button
            type="button"
            onClick={loadAuditoriaData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Auditoria
          </button>
        </div>
      </div>

      {/* Cards de Métricas & Status dos Provedores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Geral */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Disparos Totais</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <MailCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats?.total ?? '—'}</span>
            <span className="text-xs text-gray-500">histórico completo</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats ? `${stats.sent} entregues | ${stats.mocked} simulados` : 'Carregando métricas...'}
          </div>
        </div>

        {/* Taxa de Sucesso */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Taxa de Sucesso</span>
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
            {stats?.failed ? `${stats.failed} falha(s) registrada(s)` : 'Nenhuma falha crítica no período'}
          </div>
        </div>

        {/* Falhas / Alertas */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Falhas / Alertas</span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              stats?.failed && stats.failed > 0 ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'
            }`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              stats?.failed && stats.failed > 0 ? 'text-rose-600' : 'text-gray-900'
            }`}>
              {stats?.failed ?? 0}
            </span>
            <span className="text-xs text-gray-500">disparos recusados</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Inspecione os logs para detalhes do erro
          </div>
        </div>

        {/* Provedor em Operação */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Provedor Ativo</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold capitalize bg-purple-100 text-purple-800">
              {systemStatus?.activeProvider === 'net4life_api' && 'Net4Life Info (API)'}
              {systemStatus?.activeProvider === 'nodemailer_smtp' && 'Nodemailer (SMTP)'}
              {systemStatus?.activeProvider === 'mock' && 'Simulação (Dev Mock)'}
              {systemStatus?.activeProvider === 'nenhum' && 'Nenhum Provedor'}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {systemStatus?.net4life.active
              ? 'Conectado à API oficial FluxoSend'
              : systemStatus?.smtp.configured
              ? `SMTP: ${systemStatus.smtp.host}`
              : 'Ambiente de desenvolvimento sem SMTP'}
          </div>
        </div>
      </div>

      {/* Alerta de Erro */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Erro na consulta de auditoria</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Input de Busca */}
          <div className="relative md:col-span-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por e-mail, nome, assunto ou código do template..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Filtro de Status */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por Status de Envio"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos os Status</option>
              <option value="sent">Enviado com Sucesso (sent)</option>
              <option value="failed">Falha de Envio (failed)</option>
              <option value="mocked">Simulado em Dev (mocked)</option>
            </select>
          </div>

          {/* Filtro de Provedor */}
          <div className="md:col-span-3">
            <select
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por Provedor de Disparo"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos os Provedores</option>
              <option value="net4life_api">API Net4Life Info</option>
              <option value="nodemailer_smtp">Nodemailer SMTP</option>
              <option value="mock">Simulador Local (Mock)</option>
            </select>
          </div>
        </form>

        {/* Resumo da consulta */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
          <span>
            Exibindo <strong>{logs.length}</strong> de <strong>{totalFiltered}</strong> registros encontrados
          </span>
          {(search || statusFilter || providerFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setProviderFilter('');
                setPage(1);
              }}
              className="text-primary hover:underline font-medium"
            >
              Limpar filtros ativos
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Auditoria (Enterprise Bounded Viewport) */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <TableScrollContainer minWidth="980px" maxHeight="max-h-[calc(100vh-340px)] min-h-[380px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Data & Hora</th>
                <th className="py-3 px-4">Destinatário</th>
                <th className="py-3 px-4">Assunto & Template</th>
                <th className="py-3 px-4">Provedor</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Inspeção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    Carregando registros de auditoria de e-mails...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <MailCheck className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    Nenhum disparo de e-mail localizado para os filtros informados.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const dataFormatada = new Date(log.created_at).toLocaleString('pt-BR');
                  const isCliente =
                    log.metadata?.cliente ||
                    log.metadata?.destinatario_tipo === 'CLIENTE' ||
                    log.template_code?.includes('cotacao') ||
                    log.template_code?.includes('fatura');
                  const isParceiro =
                    log.metadata?.parceiro ||
                    log.metadata?.destinatario_tipo === 'PARCEIRO' ||
                    log.recipient_email?.includes('parceiro');

                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      {/* Data & Hora */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-500">
                        {dataFormatada}
                      </td>

                      {/* Destinatário */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">
                          {log.recipient_name || 'Sem nome registrado'}
                        </div>
                        <div className="text-gray-500 font-mono text-[11px]">{log.recipient_email}</div>
                        {log.metadata?.variables?.parceiro_nome && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Parceiro: {log.metadata.variables.parceiro_nome}
                          </div>
                        )}
                      </td>

                      {/* Assunto & Template */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-gray-900 truncate" title={log.subject}>
                          {log.subject}
                        </div>
                        <div className="mt-0.5">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 font-mono">
                            {log.template_code || 'personalizado'}
                          </span>
                          {log.metadata?.eventType && (
                            <span className="ml-1.5 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              {log.metadata.eventType}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Provedor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-800">
                          <Server className="h-3 w-3 text-gray-500" />
                          {log.provider === 'net4life_api' && 'Net4Life API'}
                          {log.provider === 'nodemailer_smtp' && 'Nodemailer SMTP'}
                          {log.provider === 'mock' && 'Dev Mock'}
                          {log.provider !== 'net4life_api' && log.provider !== 'nodemailer_smtp' && log.provider !== 'mock' && log.provider}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {log.status === 'sent' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Enviado
                          </span>
                        )}
                        {log.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200" title={log.error_message || ''}>
                            <XCircle className="h-3 w-3" />
                            Falha
                          </span>
                        )}
                        {log.status === 'mocked' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
                            <Clock className="h-3 w-3" />
                            Simulado
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-primary transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Inspecionar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollContainer>

        {/* Paginação */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 text-xs">
          <div className="text-gray-500">
            Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalFiltered} registros no total)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Drawer / Modal de Inspeção Detalhada do Disparo */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Inspeção do Disparo de E-mail
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">Log ID: {selectedLog.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Alerta de Erro se Houver */}
              {selectedLog.error_message && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <div className="flex items-center gap-2 font-bold">
                    <XCircle className="h-4 w-4 text-rose-600" />
                    Motivo da Falha / Exceção
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-rose-900 bg-rose-100/50 p-3 rounded-lg border border-rose-200">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}

              {/* Informações Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-2">
                  <div className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider">
                    Dados do Destinatário
                  </div>
                  <div>
                    <span className="text-gray-500">Nome: </span>
                    <strong className="text-gray-900">{selectedLog.recipient_name || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">E-mail: </span>
                    <strong className="text-gray-900 font-mono">{selectedLog.recipient_email}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Status: </span>
                    <strong className="capitalize text-gray-900">{selectedLog.status}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-2">
                  <div className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider">
                    Transmissão & Provedor
                  </div>
                  <div>
                    <span className="text-gray-500">Template: </span>
                    <strong className="text-gray-900 font-mono">{selectedLog.template_code || 'manual'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Provedor: </span>
                    <strong className="text-gray-900">{selectedLog.provider}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Disparado em: </span>
                    <strong className="text-gray-900">
                      {new Date(selectedLog.created_at).toLocaleString('pt-BR')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Assunto Completo */}
              <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                <span className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider block mb-1">
                  Assunto Renderizado
                </span>
                <p className="font-semibold text-gray-900 text-sm">{selectedLog.subject}</p>
              </div>

              {/* Metadata / Variáveis do Template */}
              <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                <span className="text-gray-500 font-semibold uppercase text-[10px] tracking-wider block mb-2">
                  Metadados, Variáveis & Contexto da Automação
                </span>
                <pre className="max-h-60 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-[11px] text-emerald-400">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-end border-t border-gray-200 bg-gray-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Disparo de Teste / Diagnóstico */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-gray-900 text-base">Disparo de Diagnóstico de E-mail</h3>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Dispara uma mensagem de verificação para validar a saúde do provedor ativo (Net4Life Info ou Nodemailer SMTP).
              Por diretriz de segurança, o e-mail será enviado ao <strong>operador autenticado</strong>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Assunto da Mensagem de Teste
              </label>
              <input
                type="text"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {testResult && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  testResult.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                <p className="font-semibold">{testResult.success ? 'Sucesso!' : 'Falha no teste'}</p>
                <p className="mt-0.5">{testResult.message}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 text-xs"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSendDiagnostics}
                disabled={testSending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/90 text-xs disabled:opacity-50"
              >
                {testSending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Enviando teste...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Disparar Diagnóstico
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
