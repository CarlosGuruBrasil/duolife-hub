'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Building, ShieldCheck, Mail, Phone, MapPin, Users, Briefcase,
  ExternalLink, Globe, Save, CheckCircle, Upload, Trash2, Image as ImageIcon,
  Landmark, FileText, FileCheck, Download
} from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { toast } from '@/components/ui/toast';
import { BANCOS_BRASILEIROS } from '../page';
import { maskCnpj, maskPhone, maskCpfCnpj } from '@/components/modals/masks';

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
  logo_base64?: string | null;
  logo_mime_type?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pix_tipo_chave?: string | null;
  pix_chave?: string | null;
  contrato_social_mime_type?: string | null;
  contrato_social_nome_arquivo?: string | null;
  contrato_social_uploaded_at?: string | null;
  has_contrato_social?: boolean;
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

  // Form de edição
  const [form, setForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    susep: '',
    email: '',
    phone: '',
    banco: '',
    agencia: '',
    conta: '',
    pix_tipo_chave: 'cnpj',
    pix_chave: '',
    primaryColor: '#004172',
    secondaryColor: '#002B4D',
  });

  const [bancoCustom, setBancoCustom] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64ToSave, setLogoBase64ToSave] = useState<string | null | undefined>(undefined);
  const [logoMimeTypeToSave, setLogoMimeTypeToSave] = useState<string | null | undefined>(undefined);
  const [contratoFileToSave, setContratoFileToSave] = useState<{ base64: string; mime: string; name: string } | null | undefined>(undefined);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/corretoras/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCorretora(data.corretora);
      setParceiros(data.parceiros ?? []);
      setStats(data.stats ?? null);

      const isKnownBank = BANCOS_BRASILEIROS.includes(data.corretora.banco || '');
      setForm({
        razao_social: data.corretora.razao_social,
        nome_fantasia: data.corretora.nome_fantasia || '',
        susep: data.corretora.susep || '',
        email: data.corretora.email,
        phone: data.corretora.phone || '',
        banco: data.corretora.banco ? (isKnownBank ? data.corretora.banco : 'Outro (informar código/nome)') : '',
        agencia: data.corretora.agencia || '',
        conta: data.corretora.conta || '',
        pix_tipo_chave: data.corretora.pix_tipo_chave || 'cnpj',
        pix_chave: data.corretora.pix_chave || '',
        primaryColor: data.corretora.whiteLabel?.primaryColor || '#004172',
        secondaryColor: data.corretora.whiteLabel?.secondaryColor || '#002B4D',
      });
      setBancoCustom(data.corretora.banco && !isKnownBank ? data.corretora.banco : '');

      const initialLogo = data.corretora.logo_base64 && data.corretora.logo_mime_type
        ? `data:${data.corretora.logo_mime_type};base64,${data.corretora.logo_base64}`
        : (data.corretora.whiteLabel?.logoUrl || null);
      setLogoPreview(initialLogo);
      setLogoBase64ToSave(undefined);
      setLogoMimeTypeToSave(undefined);
      setContratoFileToSave(undefined);
    } catch {
      setCorretora(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

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
      setLogoBase64ToSave(result);
      setLogoMimeTypeToSave(file.type);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    setLogoBase64ToSave(null);
    setLogoMimeTypeToSave(null);
  }

  function handleContratoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error('O Contrato Social excede o limite máximo permitido de 10MB.');
      e.target.value = '';
      return;
    }

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf');
    if (!allowedTypes.includes(file.type) && !isPdfByName) {
      toast.error('Selecione um arquivo de Contrato Social em PDF ou Imagem (PNG, JPEG).');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setContratoFileToSave({
        base64: result,
        mime: file.type || 'application/pdf',
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveContrato() {
    setContratoFileToSave(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const bancoFinal = form.banco === 'Outro (informar código/nome)' ? bancoCustom.trim() : form.banco.trim();

      const payload: Record<string, unknown> = {
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia,
        susep: form.susep,
        email: form.email,
        phone: form.phone,
        banco: bancoFinal,
        agencia: form.agencia.trim(),
        conta: form.conta.trim(),
        pix_tipo_chave: form.pix_tipo_chave,
        pix_chave: form.pix_chave.trim(),
        whiteLabel: {
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
        },
      };

      if (logoBase64ToSave !== undefined) {
        payload.logo_base64 = logoBase64ToSave;
        payload.logo_mime_type = logoMimeTypeToSave;
      }

      if (contratoFileToSave !== undefined) {
        payload.contrato_social_base64 = contratoFileToSave ? contratoFileToSave.base64 : null;
        payload.contrato_social_mime_type = contratoFileToSave ? contratoFileToSave.mime : null;
        payload.contrato_social_nome_arquivo = contratoFileToSave ? contratoFileToSave.name : null;
      }

      const res = await fetch(`/api/admin/corretoras/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar alterações');
        return;
      }

      toast.success('Configurações da corretora atualizadas com sucesso!');
      load();
    } catch {
      toast.error('Erro de conexão ao salvar');
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
            {(corretora.logo_base64 && corretora.logo_mime_type) || corretora.whiteLabel?.logoUrl || isNet4Life ? (
              <div className="w-24 h-16 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center p-2 shrink-0">
                <img
                  src={
                    (corretora.logo_base64 && corretora.logo_mime_type)
                      ? `data:${corretora.logo_mime_type};base64,${corretora.logo_base64}`
                      : (isNet4Life ? '/images/corretoras/net4life-logo.png' : corretora.whiteLabel.logoUrl)
                  }
                  alt={corretora.nome_fantasia}
                  className="max-w-full max-h-full object-contain"
                />
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
                {corretora.banco && (
                  <span className="flex items-center gap-1 text-gray-800 font-medium">
                    <Landmark size={12} className="text-primary" /> {corretora.banco} (Ag {corretora.agencia} • Cc {corretora.conta})
                  </span>
                )}
                {corretora.pix_chave && (
                  <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                    PIX ({corretora.pix_tipo_chave}): {corretora.pix_chave}
                  </span>
                )}
                {corretora.has_contrato_social ? (
                  <a
                    href={`/api/admin/corretoras/${corretora.id}/contrato-social`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition-colors"
                    title="Abrir Contrato Social em nova aba"
                  >
                    <FileCheck size={12} /> Ver Contrato Social
                  </a>
                ) : (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    Sem Contrato Anexado
                  </span>
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

            {/* Seção: Dados Bancários & PIX */}
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 uppercase flex items-center gap-1.5">
                  <Landmark size={14} className="text-primary" /> Dados Bancários
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Banco</label>
                <select
                  value={form.banco}
                  onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">Selecione o banco...</option>
                  {BANCOS_BRASILEIROS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {form.banco === 'Outro (informar código/nome)' && (
                  <input
                    type="text"
                    value={bancoCustom}
                    onChange={(e) => setBancoCustom(e.target.value)}
                    placeholder="Ex: 655 - Banco Votorantim"
                    className="w-full mt-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Agência com Dígito</label>
                  <input
                    type="text"
                    value={form.agencia}
                    onChange={(e) => setForm({ ...form, agencia: e.target.value })}
                    placeholder="0001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Conta Corrente</label>
                  <input
                    type="text"
                    value={form.conta}
                    onChange={(e) => setForm({ ...form, conta: e.target.value })}
                    placeholder="12345-6"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Tipo de Chave PIX</label>
                  <select
                    value={form.pix_tipo_chave}
                    onChange={(e) => setForm({ ...form, pix_tipo_chave: e.target.value, pix_chave: '' })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone / Celular</option>
                    <option value="cpf">CPF</option>
                    <option value="aleatoria">Aleatória (EVP)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Chave PIX</label>
                  <input
                    type="text"
                    value={form.pix_chave}
                    onChange={(e) => {
                      const val = e.target.value;
                      let formatted = val;
                      if (form.pix_tipo_chave === 'cnpj') formatted = maskCnpj(val);
                      else if (form.pix_tipo_chave === 'cpf') formatted = maskCpfCnpj(val);
                      else if (form.pix_tipo_chave === 'telefone') formatted = maskPhone(val);
                      setForm({ ...form, pix_chave: formatted });
                    }}
                    placeholder="Chave PIX"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Seção Contrato Social */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 uppercase flex items-center gap-1.5">
                  <FileText size={14} className="text-primary" /> Contrato Social
                </label>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  PDF ou Imagem (Máx 10MB)
                </span>
              </div>

              <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                {corretora.has_contrato_social && (
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <FileCheck size={14} className="text-emerald-600 shrink-0" />
                      <span className="truncate text-gray-700" title={corretora.contrato_social_nome_arquivo || 'Contrato Social'}>
                        {corretora.contrato_social_nome_arquivo || 'Contrato_Social.pdf'}
                      </span>
                    </div>
                    <a
                      href={`/api/admin/corretoras/${id}/contrato-social`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline shrink-0 ml-2"
                    >
                      <Download size={11} /> Baixar
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-md text-xs font-semibold text-gray-700 transition-colors">
                    <Upload size={13} className="text-primary" />
                    {corretora.has_contrato_social ? 'Substituir Contrato' : 'Anexar Contrato'}
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      onChange={handleContratoChange}
                      className="hidden"
                    />
                  </label>
                  {contratoFileToSave && (
                    <span className="text-[11px] text-emerald-700 font-medium truncate">
                      ✓ {contratoFileToSave.name}
                    </span>
                  )}
                  {contratoFileToSave === null && (
                    <span className="text-[11px] text-red-600 font-medium">
                      (Será removido ao salvar)
                    </span>
                  )}
                  {corretora.has_contrato_social && contratoFileToSave !== null && (
                    <button
                      type="button"
                      onClick={handleRemoveContrato}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-600 hover:text-red-700 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 size={11} /> Remover
                    </button>
                  )}
                </div>
                {contratoFileToSave !== undefined && (
                  <p className="text-[10px] text-amber-700 font-medium">
                    * Alteração de documento pendente. Clique em "Salvar Alterações".
                  </p>
                )}
              </div>
            </div>

            {/* Seção Logotipo da Corretora (PDF e Portal) */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 uppercase">
                  Logotipo da Corretora
                </label>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  Máx 2MB
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Utilizado no cabeçalho do Contrato/Proposta em PDF. Se não houver logo, o PDF exibirá apenas o nome da corretora em texto.
              </p>

              <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <div className="w-24 h-14 rounded-md bg-white border border-gray-200 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-xs">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logotipo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-center px-1">
                      <ImageIcon size={16} className="mx-auto text-gray-300" />
                      <span className="text-[9px] text-gray-400 font-medium">Sem Logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-md text-xs font-semibold text-gray-700 transition-colors">
                      <Upload size={13} className="text-primary" /> {logoPreview ? 'Trocar Logo' : 'Enviar Logo'}
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
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </div>
                  {logoBase64ToSave !== undefined && (
                    <p className="text-[10px] text-amber-700 font-medium">
                      * Alteração pendente. Clique em "Salvar Alterações" para gravar.
                    </p>
                  )}
                </div>
              </div>
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
