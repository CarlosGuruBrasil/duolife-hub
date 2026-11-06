'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  DollarSign,
  ShieldCheck,
  FileText,
  Calendar,
  AlertCircle,
  Copy,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth';
import type { CanceladoIndevidoItem } from '@/lib/cancelamentos-indevidos-service';
import { formatCurrency, formatDate } from '@/lib/format';
import { toast } from '@/components/ui/toast';

interface CanceladosIndevidosViewProps {
  user: AuthUser;
}

interface ApiResponse {
  ok: boolean;
  kpis: {
    totalContratos: number;
    totalValorContratado: number;
    totalValorPago: number;
    totalSaldoFaltante: number;
    totalReativados: number;
    totalPendentes: number;
  };
  items: CanceladoIndevidoItem[];
}

export function CanceladosIndevidosView({ user }: CanceladosIndevidosViewProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'pendente' | 'reativado'>('todos');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal de resultado após reativação
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    linkBoleto?: string;
  } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cancelamentos-indevidos');
      if (!res.ok) throw new Error('Falha ao carregar dados');
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err: any) {
      toast.error('Erro ao carregar levantamento de cancelamentos indevidos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(filteredList: CanceladoIndevidoItem[]) {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((i) => i.cotacaoId)));
    }
  }

  async function handleReativar(cotacaoId: string) {
    setActionLoadingId(cotacaoId);
    try {
      const res = await fetch('/api/admin/cancelamentos-indevidos/reativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Falha ao reativar');
      }

      toast.success('Cobrança reativada e apólice restabelecida com sucesso!');
      setResultModal({
        isOpen: true,
        title: 'Faturas Restantes Reativadas!',
        message: json.message || 'Apólice restaurada e faturas residuais geradas com sucesso.',
        linkBoleto: json.linkBoleto || undefined,
      });

      // Recarrega a listagem
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reativar cobrança.');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReativarBatch() {
    if (selectedIds.size === 0) {
      toast.error('Selecione pelo menos um contrato para reativar.');
      return;
    }

    if (!confirm(`Deseja reativar o saldo faltante de ${selectedIds.size} contrato(s) selecionado(s)?`)) {
      return;
    }

    setBatchLoading(true);
    try {
      const res = await fetch('/api/admin/cancelamentos-indevidos/reativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoIds: Array.from(selectedIds) }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Falha no processamento em lote');
      }

      toast.success(
        `Lote processado! ${json.successCount} reativado(s) com sucesso${
          json.errorCount > 0 ? `, ${json.errorCount} falha(s).` : '.'
        }`
      );

      setSelectedIds(new Set());
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reativar lote.');
    } finally {
      setBatchLoading(false);
    }
  }

  // Filtragem da lista
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      // Filtro de status
      if (filterStatus !== 'todos' && item.statusReativacao !== filterStatus) {
        return false;
      }

      // Busca textual
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const nome = (item.clienteNome || '').toLowerCase();
      const cpf = (item.clienteCpfCnpj || '').replace(/\D/g, '');
      const policy = (item.policyNumber || '').toLowerCase();
      const cotId = item.cotacaoId.toLowerCase();

      return (
        nome.includes(q) ||
        cpf.includes(q.replace(/\D/g, '')) ||
        policy.includes(q) ||
        cotId.includes(q)
      );
    });
  }, [data, search, filterStatus]);

  return (
    <div className="space-y-6 pb-12">
      {/* Topo / Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
              <RotateCcw size={20} />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Cancelamentos Indevidos & Retomada de Faturas
              </h1>
              <p className="text-xs sm:text-sm text-gray-500">
                Levantamento analítico de segurados afetados pela rotina de cancelamento e ferramenta de reativação das parcelas residuais.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={handleReativarBatch}
              disabled={batchLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#0b3b48] transition-colors disabled:opacity-50 shadow-sm min-h-[44px]"
            >
              {batchLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              <span>Reativar Selecionados ({selectedIds.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner Explicativo da Regra */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 text-xs sm:text-sm space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-emerald-950">
          <ShieldCheck size={18} className="text-emerald-700 shrink-0" />
          <span>Regra de Retomada e Vencimento Sequencial:</span>
        </div>
        <p className="text-emerald-800 leading-relaxed">
          O vencimento das parcelas faltantes segue rigorosamente a cadência das parcelas pagas pelo segurado. 
          Ao clicar em <strong>&quot;Reativar Cobrança Restante&quot;</strong>, a apólice e a proposta são restabelecidas no banco com status <strong>Ativa / Aprovada</strong>, 
          as comissões são restauradas, e uma nova cobrança é gerada no Asaas <strong>exclusivamente para o saldo faltante</strong> com as datas projetadas, protegendo o contrato contra novo cancelamento indevido.
        </p>
      </div>

      {/* Cards de KPIs */}
      {data?.kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Contratos Identificados
            </span>
            <span className="text-2xl font-black text-gray-900 mt-1 block">
              {data.kpis.totalContratos}
            </span>
            <span className="text-[11px] text-gray-500 mt-0.5 block">
              Cancelados indevidamente
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Total Já Pago
            </span>
            <span className="text-2xl font-black text-emerald-700 mt-1 block">
              {formatCurrency(data.kpis.totalValorPago)}
            </span>
            <span className="text-[11px] text-gray-500 mt-0.5 block">
              Liquidados pelos clientes
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Total Faltante a Cobrar
            </span>
            <span className="text-2xl font-black text-amber-700 mt-1 block">
              {formatCurrency(data.kpis.totalSaldoFaltante)}
            </span>
            <span className="text-[11px] text-gray-500 mt-0.5 block">
              Saldo residual das parcelas
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Status da Retomada
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {data.kpis.totalReativados} Reativado(s)
              </span>
              <span className="text-sm font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                {data.kpis.totalPendentes} Pendente(s)
              </span>
            </div>
            <span className="text-[11px] text-gray-500 mt-1 block">
              Taxa de regularização
            </span>
          </div>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por segurado, CPF, apólice ou cotação..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 text-xs sm:text-sm bg-gray-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0e4a5a] transition-all min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-gray-600">Filtrar:</span>
          {(['todos', 'pendente', 'reativado'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] ${
                filterStatus === st
                  ? 'bg-[#0e4a5a] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {st === 'todos' ? 'Todos' : st === 'pendente' ? 'Pendentes' : 'Reativados'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Contratos e Parcelas */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <Loader2 size={32} className="animate-spin text-[#0e4a5a]" />
            <span className="text-xs font-semibold text-gray-600">
              Carregando levantamento de clientes e histórico financeiro...
            </span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-emerald-600 mb-2" />
            <p className="text-sm font-bold text-gray-800">Nenhum contrato encontrado</p>
            <p className="text-xs text-gray-500">
              Não constam registros cancelados indevidamente para os filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                      onChange={() => toggleSelectAll(filteredItems)}
                      className="rounded-sm border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a]"
                      title="Selecionar todos"
                    />
                  </th>
                  <th className="p-3">Segurado & Apólice</th>
                  <th className="p-3">Contrato / Prêmio</th>
                  <th className="p-3">Parcelas Pagas</th>
                  <th className="p-3">O que Falta Pagar</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Ação / Retomada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item) => {
                  const isExpanded = expandedIds.has(item.cotacaoId);
                  const isSelected = selectedIds.has(item.cotacaoId);
                  const isActionLoading = actionInProgressId(actionLoadingId, item.cotacaoId);

                  return (
                    <tr key={item.cotacaoId} className="hover:bg-gray-50/60 transition-colors">
                      <td colSpan={7} className="p-0">
                        {/* Linha Principal */}
                        <div className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          {/* Checkbox e Segurado */}
                          <div className="flex items-start gap-3 min-w-[260px]">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(item.cotacaoId)}
                              className="mt-1 rounded-sm border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a]"
                            />
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-gray-900 text-sm">
                                  {item.clienteNome}
                                </span>
                                {item.policyNumber && (
                                  <span className="text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded-md">
                                    {item.policyNumber}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>CPF/CNPJ: {item.clienteCpfCnpj || 'Não inf.'}</span>
                                <span>&bull;</span>
                                <Link
                                  href={`/admin/cotacoes/${item.cotacaoId}`}
                                  className="text-[#0e4a5a] font-semibold hover:underline inline-flex items-center gap-0.5"
                                  title="Ver cotação no admin"
                                >
                                  <span>#{item.cotacaoId.slice(0, 8).toUpperCase()}</span>
                                  <ExternalLink size={10} />
                                </Link>
                              </div>
                            </div>
                          </div>

                          {/* Prêmio Total */}
                          <div className="min-w-[130px]">
                            <span className="text-[11px] text-gray-500 block">Total Contratado</span>
                            <span className="font-extrabold text-gray-900 text-sm">
                              {formatCurrency(item.valorTotalContratado)}
                            </span>
                            <span className="text-[10px] text-gray-500 block">
                              em {item.totalParcelasContratadas}x
                            </span>
                          </div>

                          {/* Parcelas Pagas */}
                          <div className="min-w-[150px]">
                            <span className="text-[11px] text-gray-500 block">Já Pago</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-bold text-emerald-700 text-sm">
                                {formatCurrency(item.totalPago)}
                              </span>
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md border border-emerald-300">
                                {item.parcelasPagasCount} de {item.totalParcelasContratadas}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-500 block">
                              {item.parcelasPagas.length > 0
                                ? `Última paga: ${formatDate(item.parcelasPagas[item.parcelasPagas.length - 1].dueDate)}`
                                : 'Nenhuma parcela liquidada'}
                            </span>
                          </div>

                          {/* O que Falta Pagar */}
                          <div className="min-w-[180px]">
                            <span className="text-[11px] text-gray-500 block">Saldo Faltante</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-black text-amber-800 text-sm">
                                {formatCurrency(item.saldoFaltante)}
                              </span>
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-md border border-amber-300">
                                {item.qtdParcelasRestantes} restante(s)
                              </span>
                            </div>
                            {item.datasProjetadasRestantes.length > 0 && (
                              <span className="text-[10px] text-amber-900 font-medium block">
                                Próx. venc: <strong>{item.datasProjetadasRestantes[0].dueDateFormatted}</strong>
                              </span>
                            )}
                          </div>

                          {/* Status */}
                          <div className="min-w-[110px] text-center">
                            {item.statusReativacao === 'reativado' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                                <CheckCircle2 size={12} className="text-emerald-700" /> Reativado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                                <Clock size={12} className="text-amber-700" /> Pendente
                              </span>
                            )}
                          </div>

                          {/* Botões de Ação */}
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              onClick={() => handleReativar(item.cotacaoId)}
                              disabled={isActionLoading}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs min-h-[44px] ${
                                item.statusReativacao === 'reativado'
                                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                                  : 'bg-[#0e4a5a] hover:bg-[#0b3b48] text-white'
                              }`}
                            >
                              {isActionLoading ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RotateCcw size={14} />
                              )}
                              <span>
                                {item.statusReativacao === 'reativado'
                                  ? 'Regerar Novamente'
                                  : 'Reativar Cobrança Restante'}
                              </span>
                            </button>

                            <button
                              onClick={() => toggleExpand(item.cotacaoId)}
                              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes das parcelas'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        {/* Acordeão de Detalhamento das Parcelas */}
                        {isExpanded && (
                          <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Bloco 1: Parcelas Pagas */}
                              <div className="bg-white border border-emerald-200 rounded-xl p-3 space-y-2">
                                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block flex items-center gap-1.5">
                                  <CheckCircle2 size={14} className="text-emerald-700" />
                                  Parcelas Quitadas ({item.parcelasPagas.length})
                                </span>
                                {item.parcelasPagas.length === 0 ? (
                                  <p className="text-xs text-gray-500 italic">Nenhuma parcela paga registrada.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {item.parcelasPagas.map((p) => (
                                      <div
                                        key={p.id}
                                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-50/60 border border-emerald-100"
                                      >
                                        <span className="font-semibold text-gray-800">
                                          Parcela {p.numero} &bull; {formatCurrency(p.amount)}
                                        </span>
                                        <span className="text-emerald-800 font-medium text-[11px]">
                                          Venceu em: {formatDate(p.dueDate)}{' '}
                                          {p.paidAt ? `(Pago em ${formatDate(p.paidAt)})` : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Bloco 2: O que Falta Pagar (Parcelas Sequenciais Projetadas) */}
                              <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block flex items-center gap-1.5">
                                  <Calendar size={14} className="text-amber-700" />
                                  Vencimentos Sequenciais a Serem Cobrados ({item.datasProjetadasRestantes.length})
                                </span>
                                <div className="space-y-1.5">
                                  {item.datasProjetadasRestantes.map((proj) => (
                                    <div
                                      key={proj.numero}
                                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-amber-50/60 border border-amber-100"
                                    >
                                      <span className="font-semibold text-gray-800">
                                        Parcela {proj.numero} de {item.totalParcelasContratadas}
                                      </span>
                                      <span className="text-amber-950 font-bold text-[11px]">
                                        Novo Vencimento: {proj.dueDateFormatted}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Sucesso com Link de Fatura */}
      {resultModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-emerald-800">
              <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                <CheckCircle2 size={24} />
              </span>
              <h3 className="font-bold text-gray-900 text-base">{resultModal.title}</h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">{resultModal.message}</p>

            {resultModal.linkBoleto && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                  Link de Pagamento Gerado (Asaas):
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={resultModal.linkBoleto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#0e4a5a] hover:underline truncate flex-1"
                  >
                    {resultModal.linkBoleto}
                  </a>
                  <button
                    onClick={() => {
                      if (resultModal.linkBoleto) {
                        navigator.clipboard.writeText(resultModal.linkBoleto);
                        toast.success('Link copiado!');
                      }
                    }}
                    className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-600"
                    title="Copiar Link"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setResultModal(null)}
                className="px-4 py-2 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#0b3b48] min-h-[44px]"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function actionInProgressId(currentId: string | null, targetId: string) {
  return currentId === targetId;
}
