'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle, Clock, XCircle, Plus, UserPlus } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { toast } from '@/components/ui/toast';

interface Parceiro {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  person_type: string;
  email: string;
  phone: string | null;
  status: string;
  corretora_id: string | null;
  corretora_nome: string | null;
  created_at: string;
}

interface CorretoraOption {
  id: string;
  razao_social: string;
  nome_fantasia: string;
}

const FORM_VAZIO = {
  person_type: 'pj' as 'pj' | 'pf',
  razao_social: '',
  nome_fantasia: '',
  documento: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  status: 'active' as 'active' | 'pending',
  corretora_id: 'corretora_net4life_001',
  director_name: '',
  director_email: '',
};

function formatarDocumento(p: Parceiro): string {
  const doc = p.person_type === 'pf' ? p.cpf : p.cnpj;
  if (!doc) return '-';
  const n = doc.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:    { label: 'Ativo',     color: '#417572', icon: CheckCircle },
  pending:   { label: 'Pendente',  color: '#b45309', icon: Clock },
  suspended: { label: 'Suspenso',  color: '#b91c1c', icon: XCircle },
};

function AdminParceirosInner() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [corretoras, setCorretoras] = useState<CorretoraOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [canManageStatus, setCanManageStatus] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    try {
      const [resParceiros, resCorretoras] = await Promise.all([
        fetch(`/api/admin/parceiros${qs}`),
        fetch('/api/admin/corretoras'),
      ]);
      const data = await resParceiros.json();
      const dataCorretoras = await resCorretoras.json();
      setParceiros(data.parceiros ?? []);
      setCanManageStatus(Boolean(data.canManageStatus));
      setCorretoras((dataCorretoras.corretoras ?? []).map((c: any) => ({
        id: c.id,
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia,
      })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  function setField<K extends keyof typeof FORM_VAZIO>(key: K, value: (typeof FORM_VAZIO)[K]) {
    setForm((atual) => ({ ...atual, [key]: value }));
  }

  async function criarParceiro(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/parceiros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const texto = Array.isArray(data.issues) && data.issues.length > 1
          ? data.issues.join(' · ')
          : (data.error || 'Não foi possível cadastrar.');
        toast.error(texto);
        return;
      }
      const textoOk = data.inviteSent
        ? `${data.partner.razao_social} cadastrada. Convite enviado para ${data.director.email}.`
        : `${data.partner.razao_social} cadastrada, mas o convite não saiu. Reenvie na tela do parceiro.`;
      toast.success(textoOk);
      setForm(FORM_VAZIO);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const action = status === 'suspended' ? 'suspender' : 'ativar';
    if (!window.confirm(`Deseja ${action} este parceiro?`)) return;

    setUpdating(id);
    try {
      const response = await fetch('/api/admin/parceiros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parceiro_id: id, status }),
      });
      if (!response.ok) {
        toast.error('Não foi possível atualizar o parceiro. Tente novamente.');
        return;
      }
      toast.success(`Parceiro ${action === 'suspender' ? 'suspenso' : 'ativado'} com sucesso!`);
      await load();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">REDE & CORRETORAS</span>
          <h1 className="admin-page-title">Parceiros</h1>
          <p className="admin-page-copy">
            {statusFilter ? `Filtro: ${STATUS_LABELS[statusFilter]?.label ?? statusFilter}` : 'Gestão de parceiros e corretores habilitados.'}
          </p>
        </div>
        {canManageStatus && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-black rounded-xl shadow-xs hover:bg-[#00b8c4] transition-all text-xs uppercase tracking-wider shrink-0"
          >
            <Plus size={16} strokeWidth={2.5} /> {showForm ? 'Fechar' : 'Novo Parceiro'}
          </button>
        )}
      </section>

      {showForm && canManageStatus && (
        <form onSubmit={criarParceiro} className="card space-y-5">
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--primary)' }}>Cadastrar parceiro</h2>
            <p className="text-sm text-gray-500 mt-1">
              O parceiro e o acesso do diretor nascem juntos. O diretor recebe um convite por e-mail
              e define a própria senha — a DuoLife não digita senha de parceiro.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['pj', 'pf'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setField('person_type', tipo)}
                className="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all border"
                style={form.person_type === tipo
                  ? { background: '#072a33', color: '#00d4e0', borderColor: '#072a33' }
                  : { background: 'var(--bg-gray)', color: '#4a6771', borderColor: 'var(--border)' }}
              >
                {tipo === 'pj' ? 'Corretora / PJ' : 'Corretor independente (PF)'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Corretora Mãe Vinculada</span>
              <select
                className="form-input mt-1.5 w-full bg-white text-gray-900 border-gray-200"
                value={form.corretora_id}
                onChange={(e) => setField('corretora_id', e.target.value)}
              >
                {corretoras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social} {c.id === 'corretora_net4life_001' ? '(Matriz #1)' : ''}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500 mt-1 block">
                Corretora à qual este parceiro/corretor pertence. Herda as regras de produto e comissionamento.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                {form.person_type === 'pj' ? 'Razão social' : 'Nome completo'}
              </span>
              <input
                className="form-input mt-1.5 w-full"
                required
                value={form.razao_social}
                onChange={(e) => setField('razao_social', e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                {form.person_type === 'pj' ? 'CNPJ' : 'CPF'}
              </span>
              <input
                className="form-input mt-1.5 w-full"
                required
                inputMode="numeric"
                placeholder={form.person_type === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                value={form.documento}
                onChange={(e) => setField('documento', e.target.value)}
              />
            </label>

            {form.person_type === 'pj' && (
              <label className="block">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nome fantasia</span>
                <input
                  className="form-input mt-1.5 w-full"
                  value={form.nome_fantasia}
                  onChange={(e) => setField('nome_fantasia', e.target.value)}
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-mail da operação</span>
              <input
                type="email"
                className="form-input mt-1.5 w-full"
                required
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefone</span>
              <input
                className="form-input mt-1.5 w-full"
                required
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Cidade</span>
                <input
                  className="form-input mt-1.5 w-full"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">UF</span>
                <input
                  className="form-input mt-1.5 w-full"
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setField('state', e.target.value.toUpperCase())}
                />
              </label>
            </div>
          </div>

          <div className="border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--primary)' }}>
              <UserPlus size={15} /> Diretor responsável
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              É a conta que comanda a operação: enxerga tudo do parceiro e cria a própria equipe.
              {form.person_type === 'pf' && ' No corretor independente, é ele mesmo.'}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nome do diretor</span>
                <input
                  className="form-input mt-1.5 w-full"
                  required
                  value={form.director_name}
                  onChange={(e) => setField('director_name', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-mail de acesso</span>
                <input
                  type="email"
                  className="form-input mt-1.5 w-full"
                  required
                  value={form.director_email}
                  onChange={(e) => setField('director_email', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={form.status === 'active'}
                onChange={(e) => setField('status', e.target.checked ? 'active' : 'pending')}
              />
              Liberar acesso imediatamente
            </label>
            <span className="text-xs text-gray-400">Sem isso, o parceiro nasce pendente e não consegue entrar.</span>
            <button type="submit" disabled={saving} className="btn-primary ml-auto disabled:opacity-50">
              {saving ? 'Cadastrando...' : 'Cadastrar e convidar diretor'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : parceiros.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum parceiro encontrado.</div>
        ) : (
          <TableScrollContainer minWidth="920px">
            <table className="w-full min-w-[920px] text-sm border-separate border-spacing-0">
            <thead className="table-sticky-head bg-gray-50/95 text-xs font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="text-left px-6 py-3.5 table-sticky-col-head rounded-tl-2xl">Empresa</th>
                <th className="text-left px-6 py-3.5 border-b border-gray-200">Corretora</th>
                <th className="text-left px-6 py-3.5 border-b border-gray-200">CNPJ / CPF</th>
                <th className="text-left px-6 py-3.5 border-b border-gray-200">E-mail</th>
                <th className="text-left px-6 py-3.5 border-b border-gray-200">Status</th>
                <th className="text-left px-6 py-3.5 border-b border-gray-200">Cadastro</th>
                <th className="px-6 py-3.5 border-b border-gray-200 rounded-tr-2xl text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {parceiros.map((p) => {
                const s = STATUS_LABELS[p.status] ?? { label: p.status, color: '#666', icon: Clock };
                const Icon = s.icon;
                return (
                  <tr key={p.id} className="group hover:bg-gray-50/75 transition-colors">
                    <td className="px-6 py-4 table-sticky-col-cell">
                      <div className="font-semibold text-gray-900">{p.razao_social}</div>
                      {p.nome_fantasia && p.nome_fantasia !== p.razao_social && (
                        <div className="text-xs text-gray-500 mt-0.5">{p.nome_fantasia}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100">
                      {p.corretora_id ? (
                        <Link
                          href={`/admin/corretoras/${p.corretora_id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 transition-colors"
                          title="Ver corretora mãe"
                        >
                          <Building2 size={12} className="text-teal-600" />
                          {p.corretora_nome || 'NET4Life'}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-600">
                          <Building2 size={12} className="text-gray-400" />
                          NET4Life
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 border-b border-gray-100">{formatarDocumento(p)}</td>
                    <td className="px-6 py-4 text-gray-600 border-b border-gray-100">{p.email}</td>
                    <td className="px-6 py-4 border-b border-gray-100">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: `${s.color}18`, color: s.color }}>
                        <Icon size={12} /> {s.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs border-b border-gray-100">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <div className="flex gap-2 justify-end">
                        <Link
                          href={`/admin/parceiros/${p.id}`}
                          className="btn-outline text-xs px-3 py-1.5 min-h-0"
                        >
                          Gerenciar
                        </Link>
                        {canManageStatus && p.status !== 'active' && (
                          <button
                            onClick={() => updateStatus(p.id, 'active')}
                            disabled={updating === p.id}
                            className="btn-primary text-xs px-3 py-1.5 min-h-0"
                          >
                            Ativar
                          </button>
                        )}
                        {canManageStatus && p.status !== 'suspended' && (
                          <button
                            onClick={() => updateStatus(p.id, 'suspended')}
                            disabled={updating === p.id}
                            className="btn-outline text-xs px-3 py-1.5 min-h-0"
                            style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                          >
                            Suspender
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </TableScrollContainer>
        )}
      </div>
    </div>
  );
}

export default function AdminParceiros() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando...</div>}>
      <AdminParceirosInner />
    </Suspense>
  );
}
