'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building, CheckCircle, Clock, XCircle, Plus, Users, Briefcase, ExternalLink, ShieldCheck, Phone, Mail, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { WhiteLabelConfig } from '@/lib/white-label';

interface Corretora {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string | null;
  susep: string | null;
  email: string;
  phone: string | null;
  address: Record<string, unknown>;
  status: string;
  created_at: string;
  partners_count: number;
  cotacoes_count: number;
  sales_count: number;
  whiteLabel: WhiteLabelConfig;
}

const FORM_VAZIO = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  susep: '',
  email: '',
  phone: '',
  street: '',
  neighborhood: '',
  city: '',
  state: '',
  slug: '',
  primaryColor: '#004172',
  secondaryColor: '#00a0af',
  logoUrl: '',
};

function formatarCnpj(cnpj: string | null): string {
  if (!cnpj) return '-';
  const n = cnpj.replace(/\D/g, '');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return cnpj;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:    { label: 'Ativa',     color: '#417572', icon: CheckCircle },
  pending:   { label: 'Pendente',  color: '#b45309', icon: Clock },
  suspended: { label: 'Suspensa',  color: '#b91c1c', icon: XCircle },
};

export default function AdminCorretorasPage() {
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/corretoras');
      const data = await res.json();
      setCorretoras(data.corretoras ?? []);
      setCanManage(Boolean(data.canManage));
    } catch {
      setCorretoras([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/corretoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({ tipo: 'erro', texto: data.error || 'Erro ao cadastrar corretora' });
        return;
      }

      setFeedback({ tipo: 'ok', texto: `Corretora "${data.corretora.nome_fantasia}" cadastrada com sucesso!` });
      setForm(FORM_VAZIO);
      setShowForm(false);
      load();
    } catch {
      setFeedback({ tipo: 'erro', texto: 'Erro de conexão ao cadastrar corretora' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo / Hero */}
      <div className="admin-hero-card flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="admin-eyebrow">REDE & CORRETORAS MASTER</span>
          <h1 className="page-title text-2xl font-bold text-gray-900 mt-1">Corretoras da Plataforma</h1>
          <p className="admin-hero-copy text-sm text-gray-600 mt-1">
            Gestão de empresas corretoras que utilizam o DuoLife Hub para distribuir seguros e gerenciar seus parceiros.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowForm(!showForm); setFeedback(null); }}
            className="admin-btn-primary flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} strokeWidth={2.5} />
            {showForm ? 'Fechar Cadastro' : 'Nova Corretora'}
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium ${
            feedback.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.texto}
        </div>
      )}

      {/* Formulário de Cadastro Expansível */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Building size={18} className="text-primary" />
              Cadastrar Nova Corretora Master
            </h2>
            <span className="text-xs text-gray-500">Preencha os dados institucionais e regulatórios</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Razão Social *</label>
              <input
                type="text"
                required
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                placeholder="Ex: Alfa Corretora de Seguros Ltda"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome Fantasia *</label>
              <input
                type="text"
                required
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                placeholder="Ex: Alfa Seguros"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">CNPJ *</label>
              <input
                type="text"
                required
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Registro SUSEP</label>
              <input
                type="text"
                value={form.susep}
                onChange={(e) => setForm({ ...form, susep: e.target.value })}
                placeholder="Ex: 202018702"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail Institucional *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contato@corretora.com.br"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Telefone / WhatsApp *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(00) 00000-0000"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Logradouro / Endereço</label>
              <input
                type="text"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                placeholder="Rua, Número, Sala"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cidade</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Florianópolis"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">UF</label>
              <input
                type="text"
                maxLength={2}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                placeholder="SC"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="admin-btn-primary px-5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            >
              {saving ? 'Cadastrando...' : 'Confirmar Cadastro'}
            </button>
          </div>
        </form>
      )}

      {/* Tabela de Corretoras */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">Carregando corretoras...</div>
        ) : corretoras.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Nenhuma corretora cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Corretora</th>
                  <th className="py-3.5 px-4">CNPJ & SUSEP</th>
                  <th className="py-3.5 px-4">Contatos</th>
                  <th className="py-3.5 px-4 text-center">Parceiros</th>
                  <th className="py-3.5 px-4 text-center">Cotações</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {corretoras.map((c) => {
                  const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.active;
                  const Icon = statusInfo.icon;
                  const isNet4Life = c.id === 'corretora_net4life_001';

                  return (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {c.whiteLabel?.logoUrl ? (
                            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center p-1 overflow-hidden shrink-0">
                              <img src={c.whiteLabel.logoUrl} alt={c.nome_fantasia} className="max-w-full max-h-full object-contain" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                              {c.nome_fantasia.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                              {c.nome_fantasia}
                              {isNet4Life && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
                                  <ShieldCheck size={11} /> Matriz #1
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{c.razao_social}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-gray-600">
                        <div>{formatarCnpj(c.cnpj)}</div>
                        {c.susep && (
                          <div className="text-[11px] text-gray-500 mt-0.5">SUSEP: <span className="font-medium text-gray-700">{c.susep}</span></div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-600">
                        <div className="flex items-center gap-1 text-gray-900">
                          <Mail size={12} className="text-gray-400" /> {c.email}
                        </div>
                        {c.phone && (
                          <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                            <Phone size={12} className="text-gray-400" /> {c.phone}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Users size={12} className="text-gray-500" />
                          {c.partners_count}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Briefcase size={12} className="text-gray-500" />
                          {c.cotacoes_count}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${statusInfo.color}15`,
                            color: statusInfo.color,
                          }}
                        >
                          <Icon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/admin/corretoras/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Gerenciar <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
