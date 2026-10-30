'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Check, ExternalLink, Link2, Palette, Building, Share2, Tag, Power, PowerOff, Loader2, Eye, Users, TrendingUp, CheckCircle2, Upload, Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { toast } from '@/components/ui/toast';
import GerarLinkClienteButton from '@/components/portal/GerarLinkClienteButton';

const COLOR_PRESETS = [
  {
    name: 'DuoLife Clássico',
    primary: '#0e4a5a',
    secondary: '#7fa8b2',
    accent: '#00d4e0',
  },
  {
    name: 'Esmeralda Prestige',
    primary: '#064e3b',
    secondary: '#34d399',
    accent: '#10b981',
  },
  {
    name: 'Azul Royal',
    primary: '#1e3a8a',
    secondary: '#60a5fa',
    accent: '#3b82f6',
  },
  {
    name: 'Grafite & Âmbar',
    primary: '#18181b',
    secondary: '#a1a1aa',
    accent: '#f59e0b',
  },
  {
    name: 'Ruby Elegance',
    primary: '#4c0519',
    secondary: '#fb7185',
    accent: '#e11d48',
  },
];

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
  products?: Array<{ id: string; name: string; code?: string | null }>;
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
  products,
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
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  // Links exclusivos com desconto pré-aplicado
  const [customLinks, setCustomLinks] = useState<any[]>([]);
  const [loadingCustomLinks, setLoadingCustomLinks] = useState(false);
  const [copiedCustomToken, setCopiedCustomToken] = useState<string | null>(null);
  const [togglingLinkId, setTogglingLinkId] = useState<string | null>(null);

  const fetchCustomLinks = async () => {
    setLoadingCustomLinks(true);
    try {
      const res = await fetch('/api/portal/links');
      const data = await res.json();
      if (data.ok && Array.isArray(data.links)) {
        setCustomLinks(data.links);
      }
    } catch {
      // silent
    } finally {
      setLoadingCustomLinks(false);
    }
  };

  useEffect(() => {
    fetchCustomLinks();
  }, []);

  const copyCustomLink = async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCustomToken(token);
      toast.success('Link exclusivo copiado!');
      setTimeout(() => setCopiedCustomToken(null), 2500);
    } catch {
      toast.error('Erro ao copiar link.');
    }
  };

  const handleToggleLinkStatus = async (linkId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setTogglingLinkId(linkId);
    try {
      const res = await fetch(`/api/portal/links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erro ao alterar status do link');
        return;
      }
      setCustomLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, status: nextStatus } : l))
      );
      toast.success(
        nextStatus === 'active' ? 'Link reativado com sucesso!' : 'Link desativado com sucesso!'
      );
    } catch {
      toast.error('Erro de conexão ao alterar status do link');
    } finally {
      setTogglingLinkId(null);
    }
  };

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(Boolean(form.logoUrl && !form.logoUrl.startsWith('/uploads/')));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('O logotipo não pode exceder 2MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error('Formato inválido. Envie imagens PNG, JPG, SVG ou WEBP');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch('/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erro ao realizar upload do logotipo');
        return;
      }

      updateField('logoUrl', data.logoUrl);
      toast.success('Logotipo atualizado com sucesso!');
    } catch {
      toast.error('Falha de conexão ao enviar logotipo');
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    updateField('logoUrl', '');
    toast.info('Logotipo removido. Lembre-se de salvar as alterações para confirmar.');
  };

  const handleApplyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setForm((prev) => ({
      ...prev,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      accentColor: preset.accent,
    }));
    toast.success(`Paleta "${preset.name}" aplicada!`);
  };

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
      toast.success('Link copiado para a área de transferência!');
    } catch {}
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');

    try {
      const res = await fetch('/api/parceiros/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        toast.error(data.error || 'Não foi possível salvar as configurações.');
        return;
      }

      setStatus('saved');
      toast.success('Configurações e perfil atualizados com sucesso.');
    } catch {
      setStatus('error');
      toast.error('Erro de conexão. Tente novamente.');
    }
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentRefCode = form.wixCode || whiteLabel.wixCode || saleLink.code || saleLink.token;
  const serverBaseUrl = saleLink.directUrl ? saleLink.directUrl.split('/contratar/')[0] : 'https://duolife.com.br';
  const baseUrl = mounted && typeof window !== 'undefined' ? window.location.origin : serverBaseUrl;
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

        {/* Seção 3: Links Exclusivos com Desconto Pré-Aplicado */}
        <div className="pt-6 border-t border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Tag size={16} className="text-emerald-600" />
                <span>Links Exclusivos para Clientes (com Desconto Pré-Aplicado)</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Gere links personalizados para campanhas ou clientes específicos onde o desconto comercial já é aplicado previamente.
              </p>
            </div>
            <GerarLinkClienteButton
              products={products || [{ id: 'prod-rc-001', name: 'RC Profissional Advogados' }]}
              onLinkCreated={fetchCustomLinks}
              buttonText="Gerar Novo Link Exclusivo"
              variant="outline"
            />
          </div>

          {loadingCustomLinks && customLinks.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500 bg-white rounded-xl border border-gray-200">
              Carregando links exclusivos...
            </div>
          ) : customLinks.length === 0 ? (
            <div className="p-5 text-center text-xs text-gray-500 bg-white rounded-xl border border-dashed border-gray-300 space-y-1.5">
              <p className="font-semibold text-gray-700">Você ainda não gerou nenhum link exclusivo com desconto.</p>
              <p className="text-[11px] text-gray-500">
                Clique no botão &quot;Gerar Novo Link Exclusivo&quot; para definir o desconto comercial pré-aplicado e compartilhar com clientes.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {customLinks.map((cl) => {
                const isCopied = copiedCustomToken === cl.token;
                const isInactive = cl.status === 'inactive';
                const isExpired = Boolean(cl.isExpired || (cl.expires_at && new Date(cl.expires_at) < new Date()));
                const isToggling = togglingLinkId === cl.id;

                return (
                  <div
                    key={cl.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 shadow-2xs ${
                      isInactive
                        ? 'border-gray-200 bg-gray-50/70 opacity-90'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-bold text-xs truncate ${isInactive ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {cl.label || cl.product_name || 'Link de Autocadastro'}
                          </span>

                          {/* Badge de Desconto */}
                          {cl.discount_percent > 0 ? (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                              -{cl.discount_percent}% OFF
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 shrink-0">
                              Tabela Normal
                            </span>
                          )}

                          {/* Badge de Status de Ativação */}
                          {isInactive ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                              Inativo
                            </span>
                          ) : isExpired ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              Expirado
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              Ativo
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {cl.product_name || 'RC Profissional'} • {cl.total_cotacoes || 0} cotaç{cl.total_cotacoes === 1 ? 'ão' : 'ões'}
                          {cl.expires_at ? ` • Validade: ${new Date(cl.expires_at).toLocaleDateString('pt-BR')}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isInactive && (
                          <a
                            href={cl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#0e4a5a] hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            Abrir <ExternalLink size={11} />
                          </a>
                        )}

                        {/* Botão de Ação: Desativar / Reativar */}
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleLinkStatus(cl.id, cl.status)}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                            isInactive
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                          }`}
                          title={isInactive ? 'Reativar link para clientes' : 'Desativar link de vendas'}
                        >
                          {isToggling ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : isInactive ? (
                            <Power size={11} />
                          ) : (
                            <PowerOff size={11} />
                          )}
                          <span>{isInactive ? 'Reativar' : 'Desativar'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={cl.url}
                        className={`form-input text-xs font-mono py-1.5 px-2 select-all flex-1 ${
                          isInactive ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-gray-50 text-gray-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => copyCustomLink(cl.url, cl.token)}
                        disabled={isInactive}
                        className="btn btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                        title={isInactive ? 'Link inativo' : 'Copiar URL exclusiva'}
                      >
                        {isCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>

                    {/* Régua de Métricas do Funil de Vendas */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px] text-gray-600 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1" title="Visualizações Totais do Link">
                          <Eye size={12} className="text-gray-400" />
                          <strong className="text-gray-900">{cl.views_count ?? 0}</strong> cliques
                        </span>
                        <span className="inline-flex items-center gap-1" title="Visitantes Únicos (IPs distintos)">
                          <Users size={12} className="text-gray-400" />
                          <strong className="text-gray-900">{cl.unique_views_count ?? 0}</strong> únicos
                        </span>
                        <span className="inline-flex items-center gap-1" title="Cotações / Propostas Iniciadas">
                          <strong className="text-gray-900">{cl.total_cotacoes ?? 0}</strong> propostas
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-700" title="Vendas Pagas / Emitidas">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <strong className="text-emerald-800">{cl.total_vendas ?? 0}</strong> vendas
                        </span>
                      </div>

                      {/* Badge de Conversão Final */}
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${
                            (cl.conversion_rate_venda ?? 0) > 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                          title={`Taxa de Conversão: ${(cl.conversion_rate_venda ?? 0)}% dos cliques viraram apólices pagas`}
                        >
                          <TrendingUp size={11} className={(cl.conversion_rate_venda ?? 0) > 0 ? 'text-emerald-600' : 'text-gray-400'} />
                          {cl.conversion_rate_venda ?? 0}% conv.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-bold text-[#0e4a5a]">Personalização Visual da Página de Vendas</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Defina como sua marca será apresentada aos segurados na página pública de contratação e nos links exclusivos.
              </p>
            </div>

            {/* SEÇÃO 1: LOGOTIPO DA CORRETORA */}
            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <ImageIcon size={16} className="text-[#0e4a5a]" />
                    <span>Logotipo da Corretora</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Envie o logo da sua empresa em PNG, JPG, SVG ou WEBP (máximo 2MB).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                    onChange={handleLogoFileSelect}
                    className="hidden"
                    disabled={!canEdit || isUploadingLogo}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canEdit || isUploadingLogo}
                    className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingLogo ? (
                      <Loader2 size={14} className="animate-spin text-[#0e4a5a]" />
                    ) : (
                      <Upload size={14} className="text-[#0e4a5a]" />
                    )}
                    <span>{isUploadingLogo ? 'Enviando...' : form.logoUrl ? 'Substituir Imagem' : 'Escolher Logotipo'}</span>
                  </button>

                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={!canEdit || isUploadingLogo}
                      className="text-xs font-semibold px-2.5 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                      title="Remover logotipo"
                    >
                      <Trash2 size={13} />
                      <span>Remover Logotipo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Preview do Logotipo */}
              {form.logoUrl ? (
                <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-3">
                  <div className="h-16 w-36 bg-gray-50 border border-gray-100 rounded-md flex items-center justify-center p-2 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt="Logotipo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">Logotipo Ativo</p>
                    <p className="text-[11px] text-gray-500 font-mono truncate">{form.logoUrl}</p>
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-[#0e4a5a] hover:underline mt-1 block"
                    >
                      {showUrlInput ? 'Ocultar URL manual' : 'Editar URL manualmente'}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => canEdit && !isUploadingLogo && fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-white transition-all ${
                    canEdit && !isUploadingLogo ? 'cursor-pointer hover:border-[#0e4a5a] hover:bg-gray-50' : ''
                  }`}
                >
                  <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-xs font-medium text-gray-700">
                    Nenhum logotipo selecionado
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Clique aqui ou no botão acima para carregar o arquivo de imagem do seu computador
                  </p>
                </div>
              )}

              {/* Campo manual de URL externa (caso prefira link direto) */}
              {(showUrlInput || !form.logoUrl) && (
                <div className="pt-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-gray-600">Ou cole a URL direta da imagem:</span>
                    <input
                      type="url"
                      value={form.logoUrl}
                      onChange={(e) => updateField('logoUrl', e.target.value)}
                      placeholder="https://suacorretora.com.br/logo.png"
                      className="form-input text-xs font-mono mt-1"
                      disabled={!canEdit}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: PALETAS DE CORES */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#0e4a5a]" />
                  <span>Paletas Rápidas Corporativas (1-Clique)</span>
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Selecione um dos esquemas de cores pré-definidos para aplicar automaticamente na sua marca.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {COLOR_PRESETS.map((preset) => {
                  const isCurrent =
                    form.primaryColor.toLowerCase() === preset.primary.toLowerCase() &&
                    form.secondaryColor.toLowerCase() === preset.secondary.toLowerCase() &&
                    form.accentColor.toLowerCase() === preset.accent.toLowerCase();

                  return (
                    <button
                      key={preset.name}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                        isCurrent
                          ? 'border-[#0e4a5a] bg-teal-50/40 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: preset.primary }}
                          title={`Primária: ${preset.primary}`}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: preset.secondary }}
                          title={`Secundária: ${preset.secondary}`}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: preset.accent }}
                          title={`Destaque: ${preset.accent}`}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-800 line-clamp-1">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Seletores Manuais de Cor */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <label className="block bg-gray-50/50 border border-gray-200 rounded-xl p-3">
                  <span className="text-xs font-bold text-gray-900 block">Cor Primária</span>
                  <span className="text-[11px] text-gray-500 block mb-2">Títulos, botões e cabeçalhos</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      disabled={!canEdit}
                      className="w-10 h-10 rounded-lg border border-gray-300 p-0.5 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={form.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="form-input font-mono text-xs uppercase"
                      disabled={!canEdit}
                    />
                  </div>
                </label>

                <label className="block bg-gray-50/50 border border-gray-200 rounded-xl p-3">
                  <span className="text-xs font-bold text-gray-900 block">Cor Secundária</span>
                  <span className="text-[11px] text-gray-500 block mb-2">Bordas e detalhes de apoio</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.secondaryColor}
                      onChange={(e) => updateField('secondaryColor', e.target.value)}
                      disabled={!canEdit}
                      className="w-10 h-10 rounded-lg border border-gray-300 p-0.5 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={form.secondaryColor}
                      onChange={(e) => updateField('secondaryColor', e.target.value)}
                      className="form-input font-mono text-xs uppercase"
                      disabled={!canEdit}
                    />
                  </div>
                </label>

                <label className="block bg-gray-50/50 border border-gray-200 rounded-xl p-3">
                  <span className="text-xs font-bold text-gray-900 block">Cor de Destaque</span>
                  <span className="text-[11px] text-gray-500 block mb-2">Badges, descontos e CTAs</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      disabled={!canEdit}
                      className="w-10 h-10 rounded-lg border border-gray-300 p-0.5 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={form.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      className="form-input font-mono text-xs uppercase"
                      disabled={!canEdit}
                    />
                  </div>
                </label>
              </div>
            </div>

            {/* SEÇÃO 3: TEXTOS INSTITUCIONAIS */}
            <div className="space-y-4 pt-2">
              <h4 className="text-sm font-bold text-gray-900">Textos da Página de Vendas</h4>

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

            {/* SEÇÃO 4: SIMULADOR EM TEMPO REAL (LIVE PREVIEW) */}
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Palette size={16} className="text-[#0e4a5a]" />
                    <span>Prévia ao Vivo da Página de Contratação</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Veja como seus clientes visualizarão sua marca ao abrir os links exclusivos de autocadastro.
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  Tempo Real
                </span>
              </div>

              {/* Mockup da Página Pública */}
              <div className="border border-gray-300 rounded-2xl overflow-hidden bg-gray-50 shadow-xs">
                {/* Cabeçalho do Mockup */}
                <div
                  className="bg-white border-b px-5 py-4 flex items-center justify-between gap-4 transition-all"
                  style={{ borderTop: `4px solid ${form.primaryColor}` }}
                >
                  <div className="flex items-center gap-3">
                    {form.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.logoUrl}
                        alt="Logo Corretora"
                        className="h-9 max-w-[140px] object-contain"
                      />
                    ) : (
                      <span
                        className="text-base font-extrabold tracking-tight"
                        style={{ color: form.primaryColor }}
                      >
                        {form.companyName || partner.nome_fantasia || 'Sua Corretora'}
                      </span>
                    )}

                    {form.companySlogan && (
                      <span className="hidden sm:inline-block text-xs text-gray-500 border-l border-gray-200 pl-3">
                        {form.companySlogan}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-gray-400 block">Atendimento</span>
                    <span className="text-xs font-semibold text-gray-700">
                      {form.companyPhone || partner.phone || '(00) 0000-0000'}
                    </span>
                  </div>
                </div>

                {/* Corpo do Mockup */}
                <div className="p-5 space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white shadow-xs"
                          style={{ backgroundColor: form.accentColor }}
                        >
                          10% OFF EXCLUSIVO
                        </span>
                        <span className="text-xs text-gray-400">• Parceria Oficial DuoLife</span>
                      </div>
                      <h5
                        className="text-base font-bold transition-all"
                        style={{ color: form.primaryColor }}
                      >
                        {form.publicTitle || 'Seguro de Responsabilidade Civil Profissional'}
                      </h5>
                      <p className="text-xs text-gray-600 max-w-xl">
                        {form.publicDescription ||
                          'Contratação simplificada e 100% digital com cobertura completa e emissão expressa.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all whitespace-nowrap self-stretch md:self-auto"
                      style={{ backgroundColor: form.primaryColor }}
                    >
                      Contratar Agora
                    </button>
                  </div>
                </div>

                {/* Rodapé da Prévia */}
                <div className="bg-white/70 border-t border-gray-200 px-5 py-2 text-[11px] text-gray-500 text-center">
                  Simulação de exibição pública da marca na contratação do segurado
                </div>
              </div>
            </div>
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
