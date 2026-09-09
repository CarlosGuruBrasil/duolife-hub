'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building, ShieldCheck, Mail, Phone, MapPin, Users, Briefcase, ExternalLink, Globe, Save, CheckCircle } from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';

interface CorretoraDetail {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string | null;
  susep: string | null;
  email: string;
  phone: string | null;
  address: Record<string, string>;
  status: string;
  created_at: string;
  whiteLabel: WhiteLabelConfig;
}

interface PartnerItem {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  person_type: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  total_parceiros: number;
  total_cotacoes: number;
  total_vendas: number;
  volume_vendas: number;
}

export default function AdminCorretoraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [corretora, setCorretora] = useState<CorretoraDetail | null>(null);
  const [parceiros, setParceiros] = useState<PartnerItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Form de edição
  const [form, setForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    susep: '',
    email: '',
    phone: '',
    primaryColor: '#004172',
    secondaryColor: '#00a0af',
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/corretoras/${id}`);
      const data = await res.json();
      if (data.corretora) {
        setCorretora(data.corretora);
        setParceiros(data.parceiros || []);
        setStats(data.stats || null);
        setForm({
          razao_social: data.corretora.razao_social || '',
          nome_fantasia: data.corretora.nome_fantasia || '',
          susep: data.corretora.susep || '',
          email: data.corretora.email || '',
          phone: data.corretora.phone || '',
          primaryColor: data.corretora.whiteLabel?.primaryColor || '#004172',
          secondaryColor: data.corretora.whiteLabel?.secondaryColor || '#00a0af',
        });
      }
    } catch {
      setCorretora(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/corretoras/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razao_social: form.razao_social,
          nome_fantasia: form.nome_fantasia,
          susep: form.susep,
          email: form.email,
          phone: form.phone,
          whiteLabel: {
            primaryColor: form.primaryColor,
            secondaryColor: form.secondaryColor,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ tipo: 'erro', texto: data.error || 'Erro ao salvar alterações' });
        return;
      }

      setMessage({ tipo: 'ok', texto: 'Configurações da corretora atualizadas com sucesso!' });
      load();
    } catch {
      setMessage({ tipo: 'erro', texto: 'Erro de conexão ao salvar' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-sm text-gray-500">Carregando detalhes da corretora...</div>;
  }

  if (!corretora) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-gray-600">Corretora não encontrada.</p>
        <Link href="/admin/corretoras" className="text-primary underline text-sm">Voltar para listagem</Link>
      </div>
    );
  }

  const isNet4Life = corretora.id === 'corretora_net4life_001';

  return (
    <div className="space-y-6">
      {/* Botão Voltar */}
      <div>
        <Link
          href="/admin/corretoras"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          <ArrowLeft size={14} /> Voltar para Corretoras
        </Link>
      </div>

      {/* Cartão de Identidade Principal */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {corretora.whiteLabel?.logoUrl ? (
              <div className="w-24 h-16 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center p-2 shrink-0">
                <img src={corretora.whiteLabel.logoUrl} alt={corretora.nome_fantasia} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                {corretora.nome_fantasia.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{corretora.nome_fantasia}</h1>
                {isNet4Life && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    <ShieldCheck size={13} /> Corretora Matriz #1
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{corretora.razao_social}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                <span>CNPJ: <strong className="font-mono">{corretora.cnpj || '-'}</strong></span>
                {corretora.susep && (
                  <span>SUSEP: <strong className="font-mono text-primary">{corretora.susep}</strong></span>
                )}
                <span className="flex items-center gap-1"><Mail size={12} className="text-gray-400" /> {corretora.email}</span>
                {corretora.phone && (
                  <span className="flex items-center gap-1"><Phone size={12} className="text-gray-400" /> {corretora.phone}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parceiros Credenciados</span>
            <Users size={18} className="text-primary" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_parceiros ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Corretores e escritórios vinculados</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cotações Geradas</span>
            <Briefcase size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_cotacoes ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Propostas e rascunhos na rede</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Apólices Emitidas</span>
            <ShieldCheck size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_vendas ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Contratos vigentes fechados</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume em Prêmios</span>
            <Globe size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(stats?.volume_vendas || 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">Produção total gerada</div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium ${
            message.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.texto}
        </div>
      )}

      {/* Seções em 2 colunas: Parceiros Vinculados & Configurações da Corretora */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Parceiros (2 colunas de largura) */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Parceiros Credenciados ({parceiros.length})
            </h2>
            <Link
              href="/admin/parceiros"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Ver todos os parceiros <ExternalLink size={12} />
            </Link>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase sticky top-0">
                <tr>
                  <th className="py-3 px-4">Nome / Razão Social</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parceiros.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{p.nome_fantasia || p.razao_social}</div>
                      {p.nome_fantasia && p.nome_fantasia !== p.razao_social && (
                        <div className="text-xs text-gray-500">{p.razao_social}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-gray-500">
                      {p.person_type === 'pf' ? 'Corretor PF' : 'Corretora PJ'}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">{p.email}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                        Ativo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/parceiros/${p.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Ver Parceiro
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 2: Ajustes Cadastrais & White Label (1 coluna) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">Configurações & Cores</h3>
            <p className="text-xs text-gray-500">Ajuste os dados cadastrais e as cores institucionais</p>
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome Fantasia</label>
              <input
                type="text"
                required
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Razão Social</label>
              <input
                type="text"
                required
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Registro SUSEP</label>
              <input
                type="text"
                value={form.susep}
                onChange={(e) => setForm({ ...form, susep: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail Institucional</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Telefone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cor Primária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-xs text-gray-700">{form.primaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cor Secundária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-xs text-gray-700">{form.secondaryColor}</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={saving}
                className="admin-btn-primary w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
