'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserX,
  Plus,
  Search,
  Mail,
  Phone,
  Shield,
  Briefcase,
  DollarSign,
  Send,
  KeyRound,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  X,
  Building2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { AuthUser } from '@/lib/auth';
import { toast } from '@/components/ui/toast';

interface Vendedor {
  partner_id: string;
  razao_social: string;
  nome_fantasia: string;
  cpf: string | null;
  cnpj: string | null;
  person_type: string;
  email: string;
  phone: string | null;
  partner_status: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  user_active: boolean;
  last_login_at: string | null;
  manager_user_id: string | null;
  manager_name: string | null;
  total_vendas: number;
  volume_vendas: number;
  total_cotacoes: number;
}

interface Manager {
  id: string;
  name: string;
  role: string;
}

interface Stats {
  totalVendedores: number;
  ativos: number;
  inativos: number;
  totalCotacoes: number;
  totalVendas: number;
  volumeTotal: number;
}

interface CorretoraInfo {
  id: string;
  nome_fantasia: string;
  razao_social: string;
}

export default function EquipeClient({ user }: { user: AuthUser }) {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [corretora, setCorretora] = useState<CorretoraInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal de Cadastro
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cpfCnpj: '',
    personType: 'pf' as 'pf' | 'pj',
    role: 'broker' as 'broker' | 'manager',
    password: '',
    sendInviteEmail: true,
  });

  // Modal de Redefinição de Senha
  const [passwordModalSeller, setPasswordModalSeller] = useState<Vendedor | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Bloqueio seguro de scroll durante exibição de modais de equipe
  useBodyScrollLock(showModal || !!passwordModalSeller);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/equipe');
      const data = await res.json();
      if (res.ok) {
        setVendedores(data.vendedores || []);
        setManagers(data.managers || []);
        setCorretora(data.corretora || null);
        setStats(data.stats || null);
      } else {
        toast.error(data.error || 'Erro ao carregar vendedores');
      }
    } catch {
      toast.error('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Filtragem local
  const filteredVendedores = vendedores.filter((v) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      v.razao_social.toLowerCase().includes(search) ||
      v.email.toLowerCase().includes(search) ||
      (v.phone && v.phone.includes(search)) ||
      (v.cpf && v.cpf.includes(search)) ||
      (v.cnpj && v.cnpj.includes(search));

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return v.user_active === true;
    if (statusFilter === 'inactive') return v.user_active === false;
    return true;
  });

  // Alternar status ativo/inativo
  async function handleToggleStatus(vendedor: Vendedor) {
    const novoStatus = !vendedor.user_active;
    setActionLoadingId(vendedor.partner_id);
    try {
      const res = await fetch(`/api/portal/equipe/${vendedor.partner_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: novoStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Vendedor ${vendedor.razao_social} ${novoStatus ? 'ativado' : 'desativado'} com sucesso.`);
        loadData();
      } else {
        toast.error(data.error || 'Erro ao atualizar status');
      }
    } catch {
      toast.error('Falha de comunicação');
    } finally {
      setActionLoadingId(null);
    }
  }

  // Reenviar convite por e-mail com senha provisória
  async function handleResendInvite(vendedor: Vendedor) {
    if (!confirm(`Deseja reenviar os dados de acesso para ${vendedor.email}? Uma nova senha provisória será gerada e enviada.`)) {
      return;
    }

    setActionLoadingId(vendedor.partner_id);
    try {
      const res = await fetch(`/api/portal/equipe/${vendedor.partner_id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Convite de acesso enviado para ${vendedor.email} com sucesso!`);
      } else {
        toast.error(data.error || 'Falha ao reenviar convite');
      }
    } catch {
      toast.error('Falha ao disparar convite');
    } finally {
      setActionLoadingId(null);
    }
  }

  // Submeter cadastro de novo vendedor
  async function handleCreateVendedor(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/portal/equipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(`Vendedor "${formData.name}" cadastrado com sucesso! ${
          data.emailSent ? 'Convite enviado por e-mail.' : `Senha gerada: ${data.passwordGenerated}`
        }`);
        setShowModal(false);
        setFormData({
          name: '',
          email: '',
          phone: '',
          cpfCnpj: '',
          personType: 'pf',
          role: 'broker',
          password: '',
          sendInviteEmail: true,
        });
        loadData();
      } else {
        toast.error(data.error || 'Erro ao cadastrar vendedor');
      }
    } catch {
      toast.error('Erro de conexão com o servidor');
    } finally {
      setSubmitting(false);
    }
  }

  // Redefinir senha do vendedor
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordModalSeller) return;
    setPasswordSubmitting(true);

    try {
      const res = await fetch(`/api/portal/equipe/${passwordModalSeller.partner_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPasswordInput }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Senha de ${passwordModalSeller.razao_social} redefinida com sucesso!`);
        setPasswordModalSeller(null);
        setNewPasswordInput('');
      } else {
        toast.error(data.error || 'Erro ao redefinir senha');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho / Hero Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full w-fit">
            <Building2 className="h-3.5 w-3.5" />
            {corretora?.nome_fantasia || 'Gestão da Corretora'}
          </div>
          <h1 className="text-2xl font-black text-gray-900 mt-2">Minha Equipe de Vendedores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastre novos corretores, acompanhe o desempenho individual e gerencie os acessos da sua corretora.
          </p>
        </div>

        <button
          onClick={() => {
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 bg-[#0e4a5a] text-white hover:bg-[#072a33] px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all hover:scale-[1.01]"
        >
          <Plus className="h-4 w-4 text-[#00d4e0]" />
          Cadastrar Novo Vendedor
        </button>
      </div>

      {/* 2. Cards de Indicadores da Equipe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Equipe Total</span>
            <div className="p-2 rounded-xl bg-cyan-50 text-[#0e4a5a]">
              <Users className="h-5 w-5 text-[#00d4e0]" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{stats?.totalVendedores ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">
            <span className="text-emerald-600 font-bold">{stats?.ativos ?? 0} ativos</span> · {stats?.inativos ?? 0} inativos
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cotações da Equipe</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{stats?.totalCotacoes ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Propostas geradas no total</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Apólices Emitidas</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Shield className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">{stats?.totalVendas ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Contratos vigentes fechados</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Volume Vendido</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-900">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.volumeTotal || 0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Prêmio total gerado</div>
        </div>
      </div>

      {/* 4. Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-gray-200 p-3.5 rounded-2xl shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0e4a5a] focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#0e4a5a] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({vendedores.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Ativos ({stats?.ativos ?? 0})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'inactive'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Inativos ({stats?.inativos ?? 0})
          </button>
        </div>
      </div>

      {/* 5. Tabela de Vendedores */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-16 text-center text-gray-500 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#0e4a5a]" />
            <p className="text-sm">Carregando corretores da sua equipe...</p>
          </div>
        ) : filteredVendedores.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Users className="h-10 w-10 text-gray-300 mx-auto" />
            <h3 className="text-base font-bold text-gray-800">Nenhum vendedor encontrado</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              {searchTerm
                ? 'Nenhum resultado corresponde à sua pesquisa. Tente buscar com outros termos.'
                : 'Você ainda não cadastrou nenhum vendedor na sua corretora.'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-2 inline-flex items-center gap-1.5 bg-[#0e4a5a] text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                <Plus className="h-4 w-4" /> Cadastrar Primeiro Vendedor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Corretor / Vendedor</th>
                  <th className="py-3.5 px-4">Contato & Documento</th>
                  <th className="py-3.5 px-4">Papel & Gestor</th>
                  <th className="py-3.5 px-4 text-center">Produção</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVendedores.map((v) => {
                  const isActionLoading = actionLoadingId === v.partner_id;

                  return (
                    <tr key={v.partner_id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Corretor / Vendedor */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-[#0e4a5a] shrink-0">
                            {v.razao_social.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 leading-tight">
                              {v.razao_social}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {v.person_type === 'pj' ? 'Pessoa Jurídica' : 'Corretor PF'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contato & Documento */}
                      <td className="py-4 px-4 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-900 font-medium">
                          <Mail className="h-3.5 w-3.5 text-gray-400" />
                          <span>{v.email}</span>
                        </div>
                        {v.phone && (
                          <div className="flex items-center gap-1.5 text-gray-500 mt-0.5">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            <span>{v.phone}</span>
                          </div>
                        )}
                        {(v.cpf || v.cnpj) && (
                          <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                            Doc: {v.cpf || v.cnpj}
                          </div>
                        )}
                      </td>

                      {/* Papel & Gestor */}
                      <td className="py-4 px-4 text-xs">
                        <span className="inline-block px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-700 text-[11px]">
                          {v.user_role === 'manager' ? 'Gestor Comercial' : 'Vendedor'}
                        </span>
                        {v.manager_name && (
                          <div className="text-[11px] text-gray-500 mt-1">
                            Líder: <strong className="text-gray-700">{v.manager_name}</strong>
                          </div>
                        )}
                      </td>

                      {/* Produção */}
                      <td className="py-4 px-4 text-center">
                        <div className="text-xs font-bold text-gray-900">
                          {v.total_vendas} apólices
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {v.total_cotacoes} cotações
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(v)}
                          disabled={isActionLoading}
                          title={v.user_active ? 'Clique para desativar' : 'Clique para ativar'}
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${
                            v.user_active
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {v.user_active ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Ativo
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-red-600" /> Inativo
                            </>
                          )}
                        </button>
                      </td>

                      {/* Ações Rápidas */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResendInvite(v)}
                            disabled={isActionLoading}
                            title="Reenviar dados de acesso por e-mail"
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                          >
                            <Send className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              setPasswordModalSeller(v);
                              setNewPasswordInput('');
                            }}
                            title="Redefinir senha do vendedor"
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Cadastrar Novo Vendedor */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#0e4a5a]" />
                <h3 className="text-base font-black text-gray-900">Cadastrar Novo Vendedor</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVendedor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Nome Completo / Razão Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João Silva ou Silva Seguros"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    E-mail Comercial (Login) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="vendedor@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    CPF ou CNPJ
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={formData.cpfCnpj}
                    onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Papel na Equipe
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'broker' | 'manager' })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                  >
                    <option value="broker">Vendedor (Corretor)</option>
                    <option value="manager">Gestor Comercial</option>
                  </select>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={formData.sendInviteEmail}
                    onChange={(e) => setFormData({ ...formData, sendInviteEmail: e.target.checked })}
                    className="rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a]"
                  />
                  <span>Enviar dados de acesso por e-mail automaticamente</span>
                </label>
                <p className="text-[11px] text-gray-500 pl-5">
                  O corretor receberá uma senha provisória e instruções para login no Portal DuoLife Hub.
                </p>

                {!formData.sendInviteEmail && (
                  <div className="pt-2 pl-5">
                    <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">
                      Definir Senha Manualmente (Mínimo 6 dígitos)
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0e4a5a] text-white hover:bg-[#072a33] px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {submitting ? 'Cadastrando...' : 'Confirmar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Redefinir Senha */}
      {passwordModalSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#0e4a5a]" />
                <h3 className="text-base font-black text-gray-900">Redefinir Senha</h3>
              </div>
              <button
                onClick={() => setPasswordModalSeller(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Digite a nova senha para o vendedor <strong>{passwordModalSeller.razao_social}</strong> ({passwordModalSeller.email}):
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Nova Senha *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0e4a5a] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalSeller(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="bg-[#0e4a5a] text-white hover:bg-[#072a33] px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {passwordSubmitting ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
