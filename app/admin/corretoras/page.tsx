'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building, CheckCircle, Clock, XCircle, Plus, Users, Briefcase, ExternalLink, ShieldCheck, Phone, Mail, MapPin, Copy, Check, Eye, EyeOff, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { maskCnpj, maskPhone } from '@/components/modals/masks';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { toast } from '@/components/ui/toast';

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
  logo_base64?: string | null;
  logo_mime_type?: string | null;
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
  logo_base64: '',
  logo_mime_type: '',
  admin_name: '',
  admin_email: '',
  admin_password: '',
  send_invite_email: true,
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
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      toast.error('O logotipo excede o limite máximo permitido de 2MB.');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem válido (PNG, JPEG ou WEBP).');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoPreview(result);
      setForm((prev) => ({
        ...prev,
        logo_base64: result,
        logo_mime_type: file.type,
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    setForm((prev) => ({
      ...prev,
      logo_base64: '',
      logo_mime_type: '',
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCopied(false);

    const payload = {
      ...form,
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia.trim(),
      cnpj: form.cnpj.trim(),
      susep: form.susep.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim(),
      street: form.street.trim() || undefined,
      neighborhood: form.neighborhood.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      slug: form.slug.trim() || undefined,
      primaryColor: form.primaryColor.trim() || undefined,
      secondaryColor: form.secondaryColor.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
      logo_base64: form.logo_base64.trim() || undefined,
      logo_mime_type: form.logo_mime_type.trim() || undefined,
      admin_name: form.admin_name.trim() || undefined,
      admin_email: form.admin_email.trim() || undefined,
      admin_password: form.admin_password.trim() || undefined,
      send_invite_email: form.send_invite_email,
    };

    try {
      const res = await fetch('/api/admin/corretoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Erro ao cadastrar corretora');
        return;
      }

      const emailLogin = data.adminUser?.email || data.corretora.email;
      const senhaProvisoria = data.temporaryPassword;

      if (senhaProvisoria && emailLogin) {
        toast.success(`Corretora "${data.corretora.nome_fantasia}" cadastrada com sucesso!`, {
          description: (
            <div className="mt-1 flex flex-col gap-1 text-xs">
              <div>Login: <strong>{emailLogin}</strong></div>
              <div>Senha provisória: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-900">{senhaProvisoria}</code></div>
            </div>
          ),
          action: {
            label: 'Copiar Credenciais',
            onClick: () => handleCopyCredentials(emailLogin, senhaProvisoria),
          },
        });
      } else {
        toast.success(`Corretora "${data.corretora.nome_fantasia}" cadastrada com sucesso!`);
      }

      setForm(FORM_VAZIO);
      setLogoPreview(null);
      setShowPassword(false);
      setShowForm(false);
      load();
    } catch {
      toast.error('Erro de conexão ao cadastrar corretora');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyCredentials(email: string, pass: string) {
    navigator.clipboard.writeText(`Acesso Corretora DuoLife Hub\nLogin: ${email}\nSenha: ${pass}`);
    setCopied(true);
    toast.success('Credenciais de acesso copiadas para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
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
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            {showForm ? 'Fechar Cadastro' : 'Nova Corretora'}
          </button>
        )}
      </div>

      {/* Formulário de Cadastro Expansível */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Building size={18} className="text-primary" />
              Cadastrar Nova Corretora Master
            </h2>
            <span className="text-xs text-gray-500">Preencha os dados institucionais, regulatórios e de acesso</span>
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
                onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                maxLength={18}
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
                onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
                maxLength={15}
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

          {/* Seção: Logotipo e Identidade Visual (PDF e Portal) */}
          <div className="border-t border-gray-200/80 pt-4 mt-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                <ImageIcon size={16} className="text-primary" /> Logotipo da Corretora (PDF e Proposta)
              </h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Máximo 2MB • PNG ou JPEG
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              O logotipo cadastrado será renderizado automaticamente no topo do Contrato/Proposta em PDF. Se nenhum logotipo for enviado, o PDF exibirá apenas o nome da corretora em texto.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
              <div className="w-36 h-20 rounded-lg bg-white border border-gray-200 flex items-center justify-center p-1.5 overflow-hidden shrink-0 shadow-xs">
                {logoPreview ? (
                  <img src={logoPreview} alt="Prévia do Logotipo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center px-2">
                    <ImageIcon size={20} className="mx-auto text-gray-300 mb-0.5" />
                    <span className="text-[10px] text-gray-400 font-medium">Sem Logotipo</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-xs font-semibold text-gray-700 shadow-xs transition-colors">
                    <Upload size={14} className="text-primary" /> Enviar Logotipo (máx 2MB)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </label>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} /> Remover Imagem
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  O arquivo é salvo de forma definitiva e segura diretamente no banco de dados da plataforma.
                </p>
              </div>
            </div>
          </div>

          {/* Seção: Acesso do Administrador Master da Corretora */}
          <div className="border-t border-gray-200/80 pt-4 mt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 mb-1">
              <ShieldCheck size={16} className="text-emerald-600" /> Acesso do Administrador Master da Corretora
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Credenciais para o gestor da corretora fazer login no portal e gerenciar seus próprios vendedores e cotações.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome do Administrador</label>
                <input
                  type="text"
                  value={form.admin_name}
                  onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                  placeholder="Se vazio, usa o Nome Fantasia"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail de Login do Gestor</label>
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  placeholder="Se vazio, usa o e-mail institucional"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Senha Inicial / Provisória</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.admin_password}
                    onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                    placeholder="Vazio = gera senha aleatória"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 focus:outline-none cursor-pointer transition-colors"
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="send_invite_email"
                checked={form.send_invite_email}
                onChange={(e) => setForm({ ...form, send_invite_email: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
              />
              <label htmlFor="send_invite_email" className="text-xs font-medium text-gray-700 cursor-pointer">
                Enviar e-mail automático com dados de acesso e link do portal para o administrador
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setLogoPreview(null);
              }}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
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
          <TableScrollContainer minWidth="960px">
            <table className="w-full min-w-[960px] text-left text-sm text-gray-700 border-separate border-spacing-0">
              <thead className="table-sticky-head bg-gray-50/95 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 table-sticky-col-head rounded-tl-xl">Corretora</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">CNPJ & SUSEP</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">Contatos</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Parceiros</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Cotações</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Status</th>
                  <th className="py-3.5 px-4 text-right border-b border-gray-200 rounded-tr-xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {corretoras.map((c) => {
                  const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.active;
                  const Icon = statusInfo.icon;
                  const isNet4Life = c.id === 'corretora_net4life_001';
                  const iconSrc = (c.logo_base64 && c.logo_mime_type)
                    ? `data:${c.logo_mime_type};base64,${c.logo_base64}`
                    : (c.whiteLabel?.iconUrl || (isNet4Life ? '/images/corretoras/net4life-icon.png' : c.whiteLabel?.logoUrl));

                  return (
                    <tr key={c.id} className="group hover:bg-gray-50/75 transition-colors">
                      <td className="py-4 px-4 table-sticky-col-cell">
                        <div className="flex items-center gap-3">
                          {iconSrc ? (
                            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center p-1 overflow-hidden shrink-0">
                              <img src={iconSrc} alt={c.nome_fantasia} className="max-w-full max-h-full object-contain" />
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
                      <td className="py-4 px-4 font-mono text-xs text-gray-600 border-b border-gray-100">
                        <div>{formatarCnpj(c.cnpj)}</div>
                        {c.susep && (
                          <div className="text-[11px] text-gray-500 mt-0.5">SUSEP: <span className="font-medium text-gray-700">{c.susep}</span></div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-600 border-b border-gray-100">
                        <div className="flex items-center gap-1 text-gray-900">
                          <Mail size={12} className="text-gray-400" /> {c.email}
                        </div>
                        {c.phone && (
                          <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                            <Phone size={12} className="text-gray-400" /> {c.phone}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center border-b border-gray-100">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Users size={12} className="text-gray-500" />
                          {c.partners_count}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center border-b border-gray-100">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Briefcase size={12} className="text-gray-500" />
                          {c.cotacoes_count}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center border-b border-gray-100">
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
                      <td className="py-4 px-4 text-right border-b border-gray-100">
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
          </TableScrollContainer>
        )}
      </div>
    </div>
  );
}
