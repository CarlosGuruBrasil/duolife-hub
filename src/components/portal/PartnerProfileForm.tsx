'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink, Link2, Palette, Building, Share2 } from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';

interface SaleLinkInfo {
  token: string;
  url: string;
  directUrl: string;
  refUrl: string;
  code: string;
}

interface PartnerProfileFormProps {
  partner: {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    email: string;
    phone: string | null;
    address: {
      city?: string;
      state?: string;
      street?: string;
    } | null;
  };
  whiteLabel: WhiteLabelConfig;
  saleLink: SaleLinkInfo;
  canEdit: boolean;
}

interface FormState {
  nomeFantasia: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  street: string;

  // White Label & Referral
  wixCode: string;
  slug: string;
  companyName: string;
  companySlogan: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  publicTitle: string;
  publicDescription: string;
}

export default function PartnerProfileForm({
  partner,
  whiteLabel,
  saleLink,
  canEdit,
}: PartnerProfileFormProps) {
  const [form, setForm] = useState<FormState>({
    nomeFantasia: partner.nome_fantasia || '',
    email: partner.email,
    phone: partner.phone || '',
    city: partner.address?.city || '',
    state: partner.address?.state || '',
    street: partner.address?.street || '',

    wixCode: whiteLabel.wixCode || '',
    slug: whiteLabel.slug || '',
    companyName: whiteLabel.companyName || partner.nome_fantasia || '',
    companySlogan: whiteLabel.companySlogan || '',
    companyPhone: whiteLabel.companyPhone || partner.phone || '',
    companyEmail: whiteLabel.companyEmail || partner.email || '',
    companyWebsite: whiteLabel.companyWebsite || '',
    logoUrl: whiteLabel.logoUrl || '',
    primaryColor: whiteLabel.primaryColor || '#0e4a5a',
    secondaryColor: whiteLabel.secondaryColor || '#7fa8b2',
    accentColor: whiteLabel.accentColor || '#00d4e0',
    publicTitle: whiteLabel.publicTitle || '',
    publicDescription: whiteLabel.publicDescription || '',
  });

  const [activeTab, setActiveTab] = useState<'links' | 'cadastral' | 'whitelabel'>('links');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function copyToClipboard(text: string, isDirect: boolean) {
    try {
      await navigator.clipboard.writeText(text);
      if (isDirect) {
        setCopiedDirect(true);
        setTimeout(() => setCopiedDirect(false), 2500);
      } else {
        setCopiedRef(true);
        setTimeout(() => setCopiedRef(false), 2500);
      }
    } catch {}
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      const res = await fetch('/api/parceiros/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Não foi possível salvar as configurações.');
        return;
      }

      setStatus('saved');
      setMessage('Configurações e perfil atualizados com sucesso.');
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  }

  const currentRefCode = form.wixCode || whiteLabel.wixCode || saleLink.code || saleLink.token;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://duolife.com.br';
  const dynamicDirectUrl = `${baseUrl}/contratar/${saleLink.token}`;
  const dynamicRefUrl = `${baseUrl}/?ref=${encodeURIComponent(currentRefCode)}`;

  return (
    <div className="space-y-6">
      {/* CARD DESTACADO: SEUS LINKS DE VENDA */}
      <div className="card bg-gradient-to-br from-white to-gray-50 border border-gray-200 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e4a5a]/10 flex items-center justify-center text-[#0e4a5a]">
              <Share2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Seus Links de Vendas & Divulgação</h2>
              <p className="text-xs text-gray-500">
                Divulgue estes links para seus clientes. Todas as contratações serão automaticamente vinculadas à sua corretora.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 self-start md:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Código Ativo: <span className="font-mono">{currentRefCode}</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 pt-5">
          {/* Link 1: Direto de Contratação */}
          <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a]">
                1. Link de Contratação Direta (White-Label)
              </span>
              <a
                href={dynamicDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#0e4a5a] hover:underline inline-flex items-center gap-1 font-medium"
              >
                Testar <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-xs text-gray-500">
              Abre diretamente a proposta digital com a identidade visual da sua corretora.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={dynamicDirectUrl}
                className="form-input text-xs font-mono bg-gray-50 text-gray-700 py-2 select-all flex-1"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(dynamicDirectUrl, true)}
                className="btn btn-primary py-2 px-3 text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedDirect ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                {copiedDirect ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Link 2: Indicação Institucional (?ref=...) */}
          <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                2. Link Institucional com Indicação (?ref)
              </span>
              <a
                href={dynamicRefUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-800 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Testar <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-xs text-gray-500">
              Direciona para a página principal da DuoLife, gravando sua corretora na sessão do cliente.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={dynamicRefUrl}
                className="form-input text-xs font-mono bg-gray-50 text-gray-700 py-2 select-all flex-1"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(dynamicRefUrl, false)}
                className="btn btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedRef ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
                {copiedRef ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO DE ABAS DO FORMULÁRIO */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('links')}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'links'
              ? 'border-[#0e4a5a] text-[#0e4a5a]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Link2 size={16} />
          <span>Código & Links</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cadastral')}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'cadastral'
              ? 'border-[#0e4a5a] text-[#0e4a5a]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building size={16} />
          <span>Dados da Corretora</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('whitelabel')}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'whitelabel'
              ? 'border-[#0e4a5a] text-[#0e4a5a]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Palette size={16} />
          <span>Identidade White Label</span>
        </button>
      </div>

      {/* FORMULÁRIO DE EDIÇÃO */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* ABA 1: CÓDIGO E LINKS */}
        {activeTab === 'links' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-[#0e4a5a]">Código de Referência e Parâmetros</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Defina o código de indicação que sua equipe e clientes usarão na URL para atribuir as vendas à sua conta.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="field-label">Código de Indicação (Ref Code / Wix Code)</span>
                <input
                  value={form.wixCode}
                  onChange={(e) => updateField('wixCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  placeholder="EX: GURU, ALPHA-SEG"
                  className="form-input uppercase font-mono"
                  disabled={!canEdit}
                  maxLength={20}
                />
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Usado em <code className="text-gray-700">?ref={form.wixCode || 'SEU_CODIGO'}</code>
                </span>
              </label>

              <label className="block">
                <span className="field-label">Slug Amigável da Corretora</span>
                <input
                  value={form.slug}
                  onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="ex: corretora-alpha"
                  className="form-input font-mono"
                  disabled={!canEdit}
                />
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Identificador opcional em letras minúsculas.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ABA 2: DADOS CADASTRAIS */}
        {activeTab === 'cadastral' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-[#0e4a5a]">Dados de Contato e Operação</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Informações cadastrais utilizadas para comunicação operacional e financeira.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="field-label">Nome Fantasia</span>
                <input
                  required
                  value={form.nomeFantasia}
                  onChange={(e) => updateField('nomeFantasia', e.target.value)}
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block">
                <span className="field-label">E-mail Operacional/Financeiro</span>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block">
                <span className="field-label">Telefone / WhatsApp Comercial</span>
                <input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block">
                <span className="field-label">Website Oficial</span>
                <input
                  type="url"
                  value={form.companyWebsite}
                  onChange={(e) => updateField('companyWebsite', e.target.value)}
                  placeholder="https://suacorretora.com.br"
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block">
                <span className="field-label">Endereço (Rua, Número)</span>
                <input
                  value={form.street}
                  onChange={(e) => updateField('street', e.target.value)}
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block col-span-2">
                  <span className="field-label">Cidade</span>
                  <input
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="form-input"
                    disabled={!canEdit}
                  />
                </label>

                <label className="block">
                  <span className="field-label">UF</span>
                  <input
                    maxLength={2}
                    value={form.state}
                    onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                    className="form-input uppercase"
                    disabled={!canEdit}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: WHITE LABEL */}
        {activeTab === 'whitelabel' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-[#0e4a5a]">Personalização Visual da Página de Vendas</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Defina como sua marca será apresentada aos segurados na página pública de contratação.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="field-label">Slogan ou Subtítulo</span>
                <input
                  value={form.companySlogan}
                  onChange={(e) => updateField('companySlogan', e.target.value)}
                  placeholder="Ex: Assessoria e Proteção Profissional"
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block">
                <span className="field-label">URL do Logotipo da Corretora</span>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => updateField('logoUrl', e.target.value)}
                  placeholder="https://.../logo.png"
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              {/* Cores */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Cor Primária</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      disabled={!canEdit}
                      className="w-10 h-10 rounded border border-gray-300 p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="form-input font-mono text-xs uppercase"
                      disabled={!canEdit}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="field-label">Cor de Destaque</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      disabled={!canEdit}
                      className="w-10 h-10 rounded border border-gray-300 p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      className="form-input font-mono text-xs uppercase"
                      disabled={!canEdit}
                    />
                  </div>
                </label>
              </div>

              <label className="block">
                <span className="field-label">Título da Página de Contratação</span>
                <input
                  value={form.publicTitle}
                  onChange={(e) => updateField('publicTitle', e.target.value)}
                  placeholder="Ex: Contratação de Seguro RC Profissional"
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="field-label">Mensagem / Apresentação aos Segurados</span>
                <textarea
                  rows={3}
                  value={form.publicDescription}
                  onChange={(e) => updateField('publicDescription', e.target.value)}
                  placeholder="Apresente sua corretora e orientações para o preenchimento da proposta..."
                  className="form-input"
                  disabled={!canEdit}
                />
              </label>
            </div>
          </div>
        )}

        {message && (
          <div
            className={`p-4 rounded-xl text-sm border ${
              status === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {message}
          </div>
        )}

        {!canEdit && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl">
            Apenas o gestor ou diretor da corretora pode alterar estes dados cadastrais e de personalização.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={status === 'saving' || !canEdit}
            className="btn-primary justify-center px-6 py-2.5 text-sm"
          >
            {status === 'saving' ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
