'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Palette,
  Package,
  Users,
  Link2,
  ArrowLeft,
  CheckCircle,
  Clock,
  XCircle,
  Save,
  Loader2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { formatDateTime } from '@/lib/format';
import { maskCpfCnpj, maskPhone, maskCep, cleanDigits, BRAZILIAN_UFS } from '@/components/modals/masks';

type ProductRow = {
  id: string;
  name: string;
  code: string;
  category: string | null;
  is_active: boolean;
  enabled: boolean;
};

type LinkRow = {
  id: string;
  token: string;
  label: string | null;
  flow_type: string;
  status: string;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
  product_name: string | null;
  product_code: string | null;
};

type PartnerRow = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  person_type: 'pj' | 'pf';
  email: string;
  phone: string | null;
  address: Record<string, any>;
  status: string;
  corretora_id: string | null;
  corretora_nome: string | null;
  created_at: string;
  updated_at?: string;
  whiteLabel: WhiteLabelConfig;
};

type PartnerUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'manager' | 'broker' | 'partner';
  manager_user_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

interface CorretoraOption {
  id: string;
  razao_social: string;
  nome_fantasia: string;
}

interface Props {
  partner: PartnerRow;
  corretoras: CorretoraOption[];
  products: ProductRow[];
  links: LinkRow[];
  partnerUsers: PartnerUserRow[];
  canManageConfig: boolean;
}

type TabType = 'cadastro' | 'branding' | 'produtos' | 'equipe' | 'links';

const baseBrandingState = (whiteLabel: WhiteLabelConfig) => ({
  slug: whiteLabel.slug || '',
  companyName: whiteLabel.companyName || '',
  companySlogan: whiteLabel.companySlogan || '',
  companyPhone: whiteLabel.companyPhone || '',
  companyEmail: whiteLabel.companyEmail || '',
  companyWebsite: whiteLabel.companyWebsite || '',
  logoUrl: whiteLabel.logoUrl || '',
  primaryColor: whiteLabel.primaryColor || '#0e4a5a',
  secondaryColor: whiteLabel.secondaryColor || '#7fa8b2',
  accentColor: whiteLabel.accentColor || '#00d4e0',
  domain: whiteLabel.domain || '',
  subdomain: whiteLabel.subdomain || '',
  institutionText: whiteLabel.institutionText || '',
  footerText: whiteLabel.footerText || '',
  publicTitle: whiteLabel.publicTitle || '',
  publicDescription: whiteLabel.publicDescription || '',
  wixCode: whiteLabel.wixCode || '',
});

const ROLE_LABEL: Record<PartnerUserRow['role'], string> = {
  director: 'Diretor',
  manager: 'Gestor',
  broker: 'Corretor',
  partner: 'Parceiro',
};

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: typeof CheckCircle }> = {
  active: {
    label: 'Ativo',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
  pending: {
    label: 'Pendente',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock,
  },
  suspended: {
    label: 'Suspenso',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
};

export default function PartnerWhiteLabelClient({
  partner,
  corretoras,
  products,
  links,
  partnerUsers,
  canManageConfig,
}: Props) {
  // Aba selecionada
  const [activeTab, setActiveTab] = useState<TabType>('cadastro');

  // Estado dos Dados Cadastrais
  const [partnerState, setPartnerState] = useState(partner);
  const [cadastroForm, setCadastroForm] = useState({
    person_type: partner.person_type || 'pj',
    razao_social: partner.razao_social || '',
    nome_fantasia: partner.nome_fantasia || '',
    documento: maskCpfCnpj(partner.person_type === 'pf' ? partner.cpf : partner.cnpj),
    email: partner.email || '',
    phone: maskPhone(partner.phone),
    status: partner.status || 'active',
    corretora_id: partner.corretora_id || 'corretora_net4life_001',
    cep: maskCep(partner.address?.cep || partner.address?.zip || ''),
    logradouro: partner.address?.logradouro || partner.address?.street || '',
    numero: partner.address?.numero || partner.address?.number || '',
    complemento: partner.address?.complemento || partner.address?.complement || '',
    bairro: partner.address?.bairro || partner.address?.neighborhood || '',
    city: partner.address?.city || partner.address?.cidade || '',
    state: (partner.address?.state || partner.address?.uf || '').toUpperCase(),
  });
  const [savingCadastro, setSavingCadastro] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [cadastroFeedback, setCadastroFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Estado White-Label
  const [brandingForm, setBrandingForm] = useState(baseBrandingState(partner.whiteLabel));
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Estado Links
  const [linksList, setLinksList] = useState(links);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkProductId, setLinkProductId] = useState(products.find((p) => p.is_active)?.id || '');
  const [linkFlowType, setLinkFlowType] = useState<'external' | 'internal'>('external');
  const [linkExpiresInDays, setLinkExpiresInDays] = useState('30');
  const [generatedLink, setGeneratedLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Estado Usuários da Equipe
  const [usersList, setUsersList] = useState(partnerUsers);
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    email: '',
    password: '',
    role: 'broker' as PartnerUserRow['role'],
    managerUserId: '',
  });
  const [savingUser, setSavingUser] = useState(false);
  const [userMessage, setUserMessage] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Estado Produtos
  const [productIds, setProductIds] = useState<string[]>(() => products.filter((p) => p.enabled).map((p) => p.id));
  const [savingProducts, setSavingProducts] = useState(false);
  const [productMessage, setProductMessage] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const availableManagers = usersList.filter(
    (user) => user.is_active && (user.role === 'director' || user.role === 'manager')
  );
  const sellableProducts = products.filter((product) => product.is_active);

  // Manipuladores de Cadastro
  function setCadastroField<K extends keyof typeof cadastroForm>(field: K, value: (typeof cadastroForm)[K]) {
    setCadastroForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCepLookup(rawVal: string) {
    const formatted = maskCep(rawVal);
    setCadastroField('cep', formatted);
    const digits = cleanDigits(rawVal);
    if (digits.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (res.ok) {
          const data = await res.json();
          if (!data.erro) {
            setCadastroForm((prev) => ({
              ...prev,
              logradouro: data.logradouro || prev.logradouro,
              bairro: data.bairro || prev.bairro,
              city: data.localidade || prev.city,
              state: (data.uf || prev.state).toUpperCase(),
            }));
          }
        }
      } catch {
        // Ignora erro de rede silenciosamente
      } finally {
        setLoadingCep(false);
      }
    }
  }

  async function saveCadastro(e: React.FormEvent) {
    e.preventDefault();
    setSavingCadastro(true);
    setCadastroFeedback(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_type: cadastroForm.person_type,
          razao_social: cadastroForm.razao_social,
          nome_fantasia: cadastroForm.nome_fantasia || null,
          documento: cleanDigits(cadastroForm.documento) || null,
          email: cadastroForm.email,
          phone: cadastroForm.phone || null,
          status: cadastroForm.status,
          corretora_id: cadastroForm.corretora_id || null,
          address: {
            cep: cleanDigits(cadastroForm.cep),
            logradouro: cadastroForm.logradouro,
            numero: cadastroForm.numero,
            complemento: cadastroForm.complemento,
            bairro: cadastroForm.bairro,
            city: cadastroForm.city,
            state: cadastroForm.state,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCadastroFeedback({
          tipo: 'erro',
          texto: data.error || (Array.isArray(data.issues) ? data.issues.join(' · ') : 'Falha ao salvar dados cadastrais.'),
        });
        return;
      }

      setPartnerState((prev) => ({
        ...prev,
        razao_social: data.partner.razao_social,
        nome_fantasia: data.partner.nome_fantasia,
        person_type: data.partner.person_type,
        cnpj: data.partner.cnpj,
        cpf: data.partner.cpf,
        email: data.partner.email,
        phone: data.partner.phone,
        status: data.partner.status,
        corretora_id: data.partner.corretora_id,
        address: data.partner.address,
      }));

      setCadastroFeedback({ tipo: 'ok', texto: 'Informações cadastrais salvas com sucesso!' });
    } catch {
      setCadastroFeedback({ tipo: 'erro', texto: 'Erro de comunicação ao salvar parceiro.' });
    } finally {
      setSavingCadastro(false);
    }
  }

  // Manipuladores de White-Label
  function setBrandingField(field: keyof typeof brandingForm, value: string) {
    setBrandingForm((current) => ({ ...current, [field]: value }));
  }

  async function saveBranding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBranding(true);
    setBrandingMessage(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingForm),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBrandingMessage({ tipo: 'erro', texto: data.error || 'Falha ao salvar white-label.' });
        return;
      }

      setBrandingMessage({ tipo: 'ok', texto: 'Configurações de marca e white-label salvas com sucesso!' });
    } catch {
      setBrandingMessage({ tipo: 'erro', texto: 'Erro ao salvar white-label.' });
    } finally {
      setSavingBranding(false);
    }
  }

  // Manipuladores de Produtos
  function toggleProduct(productId: string) {
    setProductMessage(null);
    setProductIds((atual) =>
      atual.includes(productId) ? atual.filter((id) => id !== productId) : [...atual, productId]
    );
  }

  async function saveProducts() {
    setSavingProducts(true);
    setProductMessage(null);
    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/produtos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProductMessage({
          tipo: 'ok',
          texto: `Salvo: ${data.habilitados} produto(s) habilitado(s), ${data.desabilitados} desabilitado(s).`,
        });
      } else {
        setProductMessage({ tipo: 'erro', texto: data.error || 'Não foi possível salvar os produtos.' });
      }
    } catch {
      setProductMessage({ tipo: 'erro', texto: 'Erro de comunicação ao salvar produtos.' });
    } finally {
      setSavingProducts(false);
    }
  }

  // Manipuladores de Usuários
  function resetUserForm() {
    setUserForm({
      id: '',
      name: '',
      email: '',
      password: '',
      role: 'broker',
      managerUserId: '',
    });
  }

  function startEditUser(user: PartnerUserRow) {
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      managerUserId: user.manager_user_id || '',
    });
  }

  function setUserField(field: keyof typeof userForm, value: string) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  async function savePartnerUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingUser(true);
    setUserMessage(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userForm.id || undefined,
          name: userForm.name,
          email: userForm.email,
          password: userForm.password || undefined,
          role: userForm.role,
          managerUserId: userForm.managerUserId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setUserMessage({ tipo: 'erro', texto: data.error || 'Falha ao salvar usuário.' });
        return;
      }

      if (userForm.id) {
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === userForm.id
              ? {
                  ...u,
                  name: userForm.name,
                  email: userForm.email,
                  role: userForm.role,
                  manager_user_id: userForm.managerUserId || null,
                }
              : u
          )
        );
        setUserMessage({ tipo: 'ok', texto: 'Usuário atualizado com sucesso!' });
      } else if (data.user) {
        setUsersList((prev) => [...prev, data.user]);
        setUserMessage({ tipo: 'ok', texto: 'Novo usuário cadastrado com sucesso!' });
      } else {
        setUserMessage({ tipo: 'ok', texto: 'Usuário salvo com sucesso!' });
      }
      resetUserForm();
    } catch {
      setUserMessage({ tipo: 'erro', texto: 'Erro de comunicação ao salvar usuário.' });
    } finally {
      setSavingUser(false);
    }
  }

  async function togglePartnerUser(userId: string, isActive: boolean) {
    setSavingUser(true);
    setUserMessage(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/usuarios`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          isActive: !isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: !isActive } : u))
        );
        setUserMessage({ tipo: 'ok', texto: `Status do usuário alterado para ${!isActive ? 'Ativo' : 'Inativo'}.` });
      } else {
        setUserMessage({ tipo: 'erro', texto: data.error || 'Falha ao atualizar status do usuário.' });
      }
    } catch {
      setUserMessage({ tipo: 'erro', texto: 'Erro de conexão ao alterar status.' });
    } finally {
      setSavingUser(false);
    }
  }

  async function sendUserInvite(userId: string) {
    setSavingUser(true);
    setUserMessage(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/usuarios/convite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setUserMessage({ tipo: 'ok', texto: 'Convite de acesso reenviado por e-mail com sucesso!' });
      } else {
        setUserMessage({ tipo: 'erro', texto: data.error || 'Falha ao enviar convite por e-mail.' });
      }
    } catch {
      setUserMessage({ tipo: 'erro', texto: 'Erro de conexão ao enviar convite.' });
    } finally {
      setSavingUser(false);
    }
  }

  // Manipuladores de Links
  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingLink(true);
    setLinkMessage(null);

    try {
      const res = await fetch(`/api/admin/parceiros/${partner.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: linkLabel || undefined,
          productId: linkProductId || undefined,
          flowType: linkFlowType,
          expiresInDays: Number(linkExpiresInDays) || 30,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLinkMessage({ tipo: 'erro', texto: data.error || 'Falha ao gerar link público.' });
        return;
      }

      setGeneratedLink(data.link?.url || '');
      setLinkMessage({ tipo: 'ok', texto: 'Link público gerado com sucesso!' });
      setLinkLabel('');

      if (data.link) {
        setLinksList((prev) => [
          {
            id: data.link.id,
            token: data.link.token,
            label: data.link.label,
            flow_type: data.link.flow_type || linkFlowType,
            status: 'active',
            expires_at: data.link.expires_at,
            used_at: null,
            created_at: new Date().toISOString(),
            product_name: products.find((p) => p.id === linkProductId)?.name || null,
            product_code: products.find((p) => p.id === linkProductId)?.code || null,
          },
          ...prev,
        ]);
      }
    } catch {
      setLinkMessage({ tipo: 'erro', texto: 'Erro ao gerar link público.' });
    } finally {
      setSavingLink(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const activeStatusCfg = STATUS_CONFIG[partnerState.status] || STATUS_CONFIG.pending;
  const StatusIcon = activeStatusCfg.icon;

  const currentCorretora = corretoras.find((c) => c.id === partnerState.corretora_id);

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb e Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
            <Link href="/admin/parceiros" className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Parceiros
            </Link>
            <span>/</span>
            <span className="text-gray-900 truncate max-w-xs">{partnerState.razao_social}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {partnerState.nome_fantasia || partnerState.razao_social}
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${activeStatusCfg.badgeClass}`}
            >
              <StatusIcon className="w-3 h-3" />
              {activeStatusCfg.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {partnerState.person_type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'} · Documento:{' '}
            <span className="font-medium text-gray-700">
              {maskCpfCnpj(partnerState.person_type === 'pf' ? partnerState.cpf : partnerState.cnpj) || 'Não informado'}
            </span>
            {currentCorretora ? (
              <>
                {' '}
                · Corretora:{' '}
                <span className="font-medium text-gray-700">{currentCorretora.nome_fantasia}</span>
              </>
            ) : null}
          </p>
        </div>

        {/* Resumo Rápido em Pill Cards */}
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm">
            <span className="text-gray-500 block text-[10px] font-semibold uppercase">E-mail</span>
            <span className="font-bold text-gray-900 truncate max-w-[180px] block">{partnerState.email}</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm">
            <span className="text-gray-500 block text-[10px] font-semibold uppercase">Telefone</span>
            <span className="font-bold text-gray-900 block">{maskPhone(partnerState.phone) || '-'}</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm">
            <span className="text-gray-500 block text-[10px] font-semibold uppercase">Slug White-Label</span>
            <span className="font-bold text-primary block">{brandingForm.slug || '-'}</span>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('cadastro')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'cadastro'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Dados Cadastrais
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'branding'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Palette className="w-4 h-4" />
          White-Label & Marca
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('produtos')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'produtos'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Package className="w-4 h-4" />
          Produtos Habilitados
          <span className="ml-1 rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-bold">
            {productIds.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('equipe')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'equipe'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Equipe & Acessos
          <span className="ml-1 rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-bold">
            {usersList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('links')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'links'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Link2 className="w-4 h-4" />
          Links de Venda
          <span className="ml-1 rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-bold">
            {linksList.length}
          </span>
        </button>
      </div>

      {/* Conteúdo da Aba 1: Dados Cadastrais */}
      {activeTab === 'cadastro' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Informações Cadastrais do Parceiro</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Altere os dados fiscais, operacionais, contato e endereço comercial do parceiro.
              </p>
            </div>
            {!canManageConfig && (
              <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">
                Somente leitura para seu perfil
              </span>
            )}
          </div>

          <form onSubmit={saveCadastro} className="space-y-6">
            {/* Bloco 1: Identificação e Documentos */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">1. Identificação Principal</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="field-label">Tipo de Pessoa</span>
                  <select
                    className="form-input"
                    value={cadastroForm.person_type}
                    disabled={!canManageConfig}
                    onChange={(e) => {
                      const val = e.target.value as 'pj' | 'pf';
                      setCadastroField('person_type', val);
                    }}
                  >
                    <option value="pj">Pessoa Jurídica (PJ)</option>
                    <option value="pf">Pessoa Física (PF / Corretor Autônomo)</option>
                  </select>
                </label>

                <label className="block md:col-span-2">
                  <span className="field-label">
                    {cadastroForm.person_type === 'pf' ? 'Nome Completo do Corretor' : 'Razão Social'} *
                  </span>
                  <input
                    className="form-input"
                    value={cadastroForm.razao_social}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('razao_social', e.target.value)}
                    required
                  />
                </label>

                <label className="block">
                  <span className="field-label">Nome Fantasia</span>
                  <input
                    className="form-input"
                    value={cadastroForm.nome_fantasia}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('nome_fantasia', e.target.value)}
                    placeholder="Ex: Prime Corretora"
                  />
                </label>

                <label className="block">
                  <span className="field-label">
                    {cadastroForm.person_type === 'pf' ? 'CPF' : 'CNPJ'} *
                  </span>
                  <input
                    className="form-input"
                    value={cadastroForm.documento}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('documento', maskCpfCnpj(e.target.value))}
                    placeholder={cadastroForm.person_type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                    required
                  />
                </label>

                <label className="block">
                  <span className="field-label">Status Operacional</span>
                  <select
                    className="form-input"
                    value={cadastroForm.status}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('status', e.target.value)}
                  >
                    <option value="active">Ativo (Habilitado para cotações e acessos)</option>
                    <option value="pending">Pendente (Aguardando aprovação)</option>
                    <option value="suspended">Suspenso (Bloqueado temporariamente)</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Bloco 2: Contato & Corretora Mãe */}
            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">2. Contato & Vínculo</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="field-label">E-mail Operacional *</span>
                  <input
                    type="email"
                    className="form-input"
                    value={cadastroForm.email}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('email', e.target.value)}
                    required
                  />
                </label>

                <label className="block">
                  <span className="field-label">Telefone / WhatsApp</span>
                  <input
                    className="form-input"
                    value={cadastroForm.phone}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('phone', maskPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Corretora Mãe Vinculada</span>
                  <select
                    className="form-input"
                    value={cadastroForm.corretora_id}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('corretora_id', e.target.value)}
                  >
                    {corretoras.map((corretora) => (
                      <option key={corretora.id} value={corretora.id}>
                        {corretora.nome_fantasia || corretora.razao_social}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Bloco 3: Endereço Comercial */}
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">3. Endereço Comercial</h3>
                {loadingCep && (
                  <span className="text-xs font-semibold text-primary flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Consultando CEP...
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <label className="block">
                  <span className="field-label">CEP</span>
                  <input
                    className="form-input"
                    value={cadastroForm.cep}
                    disabled={!canManageConfig}
                    onChange={(e) => handleCepLookup(e.target.value)}
                    placeholder="00000-000"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="field-label">Logradouro / Rua</span>
                  <input
                    className="form-input"
                    value={cadastroForm.logradouro}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('logradouro', e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="field-label">Número</span>
                  <input
                    className="form-input"
                    value={cadastroForm.numero}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('numero', e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="field-label">Complemento</span>
                  <input
                    className="form-input"
                    value={cadastroForm.complemento}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('complemento', e.target.value)}
                    placeholder="Sala, Andar, etc."
                  />
                </label>

                <label className="block">
                  <span className="field-label">Bairro</span>
                  <input
                    className="form-input"
                    value={cadastroForm.bairro}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('bairro', e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="field-label">Cidade</span>
                  <input
                    className="form-input"
                    value={cadastroForm.city}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('city', e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="field-label">Estado (UF)</span>
                  <select
                    className="form-input"
                    value={cadastroForm.state}
                    disabled={!canManageConfig}
                    onChange={(e) => setCadastroField('state', e.target.value.toUpperCase())}
                  >
                    <option value="">Selecione o Estado</option>
                    {BRAZILIAN_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Feedback & Botão Salvar */}
            {cadastroFeedback && (
              <div
                className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
                  cadastroFeedback.tipo === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {cadastroFeedback.tipo === 'ok' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{cadastroFeedback.texto}</span>
              </div>
            )}

            {canManageConfig && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={savingCadastro}
                  className="btn-primary px-6 py-2.5 flex items-center gap-2"
                >
                  {savingCadastro ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando alterações...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Dados Cadastrais
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Conteúdo da Aba 2: White-Label & Marca */}
      {activeTab === 'branding' && (
        <>
          {canManageConfig ? (
            <form onSubmit={saveBranding} className="card space-y-6">
              <div>
                <h2 className="text-lg font-black text-gray-900">White-Label & Identidade Visual</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Personalize a interface, cores, domínios e textos institucionais exibidos para os clientes deste parceiro.
                </p>
              </div>

              {/* Domínios e Códigos */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Identificadores & Domínios</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="field-label">Slug Público (URL)</span>
                    <input
                      className="form-input"
                      value={brandingForm.slug}
                      onChange={(e) => setBrandingField('slug', e.target.value)}
                      placeholder="parceiro-x"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Código Wix</span>
                    <input
                      className="form-input"
                      value={brandingForm.wixCode}
                      onChange={(e) => setBrandingField('wixCode', e.target.value)}
                      placeholder="12345"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Website Oficial</span>
                    <input
                      className="form-input"
                      value={brandingForm.companyWebsite}
                      onChange={(e) => setBrandingField('companyWebsite', e.target.value)}
                      placeholder="https://suaempresa.com.br"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Domínio Customizado</span>
                    <input
                      className="form-input"
                      value={brandingForm.domain}
                      onChange={(e) => setBrandingField('domain', e.target.value)}
                      placeholder="seguros.corretora.com.br"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Subdomínio</span>
                    <input
                      className="form-input"
                      value={brandingForm.subdomain}
                      onChange={(e) => setBrandingField('subdomain', e.target.value)}
                      placeholder="parceiro"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">URL do Logotipo</span>
                    <input
                      className="form-input"
                      value={brandingForm.logoUrl}
                      onChange={(e) => setBrandingField('logoUrl', e.target.value)}
                      placeholder="https://.../logo.png"
                    />
                  </label>
                </div>
              </div>

              {/* Identidade Visual / Cores */}
              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Identidade Visual & Cores</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="field-label">Cor Primária</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={brandingForm.primaryColor}
                        onChange={(e) => setBrandingField('primaryColor', e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <input
                        className="form-input flex-1 font-mono text-sm"
                        value={brandingForm.primaryColor}
                        onChange={(e) => setBrandingField('primaryColor', e.target.value)}
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="field-label">Cor Secundária</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={brandingForm.secondaryColor}
                        onChange={(e) => setBrandingField('secondaryColor', e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <input
                        className="form-input flex-1 font-mono text-sm"
                        value={brandingForm.secondaryColor}
                        onChange={(e) => setBrandingField('secondaryColor', e.target.value)}
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="field-label">Cor de Destaque (Accent)</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={brandingForm.accentColor}
                        onChange={(e) => setBrandingField('accentColor', e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <input
                        className="form-input flex-1 font-mono text-sm"
                        value={brandingForm.accentColor}
                        onChange={(e) => setBrandingField('accentColor', e.target.value)}
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Textos Institucionais */}
              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Textos & Conteúdo</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Nome Exibido na Marca</span>
                    <input
                      className="form-input"
                      value={brandingForm.companyName}
                      onChange={(e) => setBrandingField('companyName', e.target.value)}
                      placeholder="Nome amigável da empresa"
                    />
                  </label>

                  <label className="block">
                    <span className="field-label">Slogan</span>
                    <input
                      className="form-input"
                      value={brandingForm.companySlogan}
                      onChange={(e) => setBrandingField('companySlogan', e.target.value)}
                      placeholder="Ex: Protegendo suas conquistas"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="field-label">Título da Página Pública</span>
                    <input
                      className="form-input"
                      value={brandingForm.publicTitle}
                      onChange={(e) => setBrandingField('publicTitle', e.target.value)}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="field-label">Descrição Pública</span>
                    <textarea
                      className="form-input min-h-20"
                      value={brandingForm.publicDescription}
                      onChange={(e) => setBrandingField('publicDescription', e.target.value)}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="field-label">Texto Institucional</span>
                    <textarea
                      className="form-input min-h-24"
                      value={brandingForm.institutionText}
                      onChange={(e) => setBrandingField('institutionText', e.target.value)}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="field-label">Rodapé Personalizado</span>
                    <textarea
                      className="form-input min-h-24"
                      value={brandingForm.footerText}
                      onChange={(e) => setBrandingField('footerText', e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {/* Feedback e Botão */}
              {brandingMessage && (
                <div
                  className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
                    brandingMessage.tipo === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {brandingMessage.tipo === 'ok' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{brandingMessage.texto}</span>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={savingBranding}
                  className="btn-primary px-6 py-2.5 flex items-center gap-2"
                >
                  {savingBranding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando White-Label...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Configurações de White-Label
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="card text-center py-12">
              <Palette className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h2 className="text-lg font-black text-gray-900">Restrito a Administradores</h2>
              <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                As configurações de white-label, domínio e personalização visual ficam restritas a administradores da DuoLife.
              </p>
            </div>
          )}
        </>
      )}

      {/* Conteúdo da Aba 3: Produtos Habilitados */}
      {activeTab === 'produtos' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Produtos Habilitados</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Selecione os produtos que esta operação tem permissão para vender e cotar. Produtos desmarcados não aparecem
                na tela de nova cotação dos corretores.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
              {productIds.length} de {sellableProducts.length} liberados
            </span>
          </div>

          {sellableProducts.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Nenhum produto ativo no catálogo para habilitar.</p>
          ) : (
            <>
              {canManageConfig && (
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setProductMessage(null);
                      setProductIds(sellableProducts.map((p) => p.id));
                    }}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductMessage(null);
                      setProductIds([]);
                    }}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    Desmarcar todos
                  </button>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                {sellableProducts.map((product) => {
                  const marcado = productIds.includes(product.id);
                  return (
                    <label
                      key={product.id}
                      className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                        marcado
                          ? 'border-[#00d4e0] bg-[#f0fdff] shadow-sm'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!canManageConfig}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={marcado}
                        onChange={() => toggleProduct(product.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-gray-900">{product.name}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          Código: <span className="font-mono">{product.code}</span>
                          {product.category ? ` · Categoria: ${product.category}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {productMessage && (
                <div
                  className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
                    productMessage.tipo === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {productMessage.tipo === 'ok' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{productMessage.texto}</span>
                </div>
              )}

              {canManageConfig && (
                <div className="flex justify-end pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={saveProducts}
                    disabled={savingProducts}
                    className="btn-primary px-6 py-2.5 flex items-center gap-2"
                  >
                    {savingProducts ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Salvar Produtos Habilitados
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Conteúdo da Aba 4: Equipe & Níveis de Acesso */}
      {activeTab === 'equipe' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-lg font-black text-gray-900">Equipe e Níveis de Acesso</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Diretores visualizam toda a produção do parceiro. Gestores acompanham sua carteira e os corretores vinculados.
              Corretores e Parceiros acessam apenas suas próprias cotações.
            </p>
          </div>

          {/* Formulário de Criação/Edição de Usuário */}
          <form onSubmit={savePartnerUser} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {userForm.id ? 'Editar Usuário da Equipe' : 'Cadastrar Novo Usuário'}
              </h3>
              {userForm.id && (
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="field-label">Nome Completo *</span>
                <input
                  className="form-input bg-white"
                  value={userForm.name}
                  onChange={(e) => setUserField('name', e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="field-label">E-mail de Acesso *</span>
                <input
                  type="email"
                  className="form-input bg-white"
                  value={userForm.email}
                  onChange={(e) => setUserField('email', e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="field-label">Senha {userForm.id ? '(opcional na edição)' : '*'}</span>
                <input
                  type="password"
                  minLength={userForm.id ? 0 : 8}
                  className="form-input bg-white"
                  value={userForm.password}
                  onChange={(e) => setUserField('password', e.target.value)}
                  placeholder={userForm.id ? 'Deixe vazio para manter' : 'Mínimo 8 caracteres'}
                  required={!userForm.id}
                />
              </label>

              <label className="block">
                <span className="field-label">Papel / Função</span>
                <select
                  className="form-input bg-white"
                  value={userForm.role}
                  onChange={(e) => setUserField('role', e.target.value as PartnerUserRow['role'])}
                >
                  <option value="director">Diretor (Acesso Total à Operação)</option>
                  <option value="manager">Gestor (Acesso a Equipe de Corretores)</option>
                  <option value="broker">Corretor (Vendas & Cotações)</option>
                  <option value="partner">Parceiro (Visualizador)</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="field-label">Gestor Responsável</span>
                <select
                  className="form-input bg-white"
                  value={userForm.managerUserId}
                  onChange={(e) => setUserField('managerUserId', e.target.value)}
                  disabled={userForm.role === 'director'}
                >
                  <option value="">Sem vínculo hierárquico (Direto à diretoria)</option>
                  {availableManagers
                    .filter((u) => u.id !== userForm.id)
                    .map((mgr) => (
                      <option key={mgr.id} value={mgr.id}>
                        {mgr.name} · {ROLE_LABEL[mgr.role]} ({mgr.email})
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {userMessage && (
              <div
                className={`p-3 rounded-xl border text-sm flex items-center gap-2 ${
                  userMessage.tipo === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {userMessage.tipo === 'ok' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{userMessage.texto}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={savingUser}
                className="btn-primary px-6 py-2.5 flex items-center gap-2"
              >
                {savingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando usuário...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {userForm.id ? 'Salvar Alterações' : 'Adicionar Usuário'}
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Tabela de Membros da Equipe */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Nome & E-mail</th>
                  <th className="px-5 py-3">Papel</th>
                  <th className="px-5 py-3">Gestor</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Último Acesso</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                      Nenhum usuário cadastrado para este parceiro.
                    </td>
                  </tr>
                ) : (
                  usersList.map((teamUser) => {
                    const manager = usersList.find((item) => item.id === teamUser.manager_user_id);
                    return (
                      <tr key={teamUser.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-gray-900">{teamUser.name}</div>
                          <div className="text-xs text-gray-500">{teamUser.email}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">
                            {ROLE_LABEL[teamUser.role]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-600">{manager ? manager.name : '-'}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              teamUser.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {teamUser.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-500">
                          {teamUser.last_login_at ? formatDateTime(teamUser.last_login_at) : 'Nunca acessou'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditUser(teamUser)}
                              className="btn-outline text-xs px-2.5 py-1 min-h-0"
                            >
                              Editar
                            </button>
                            {teamUser.is_active && (
                              <button
                                type="button"
                                onClick={() => sendUserInvite(teamUser.id)}
                                className="btn-outline text-xs px-2.5 py-1 min-h-0"
                              >
                                Convite
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => togglePartnerUser(teamUser.id, teamUser.is_active)}
                              className="btn-outline text-xs px-2.5 py-1 min-h-0"
                            >
                              {teamUser.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 5: Links de Venda */}
      {activeTab === 'links' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Formulário de Geração */}
          <form onSubmit={createLink} className="card space-y-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Gerar Link de Venda Pública</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Crie links compartilháveis para clientes contratarem diretamente ou para vendas internas.
              </p>
            </div>

            <label className="block">
              <span className="field-label">Rótulo Identificador (Opcional)</span>
              <input
                className="form-input"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Ex: Campanha WhatsApp OAB Março"
              />
            </label>

            <label className="block">
              <span className="field-label">Produto Vinculado</span>
              <select
                className="form-input"
                value={linkProductId}
                onChange={(e) => setLinkProductId(e.target.value)}
              >
                <option value="">Produto padrão de Responsabilidade Civil</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.code})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Fluxo de Venda</span>
                <select
                  className="form-input"
                  value={linkFlowType}
                  onChange={(e) => setLinkFlowType(e.target.value as 'external' | 'internal')}
                >
                  <option value="external">Venda externa (Autoatendimento do cliente)</option>
                  <option value="internal">Venda interna (Corretor assistido)</option>
                </select>
              </label>

              <label className="block">
                <span className="field-label">Validade (em dias)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="form-input"
                  value={linkExpiresInDays}
                  onChange={(e) => setLinkExpiresInDays(e.target.value)}
                />
              </label>
            </div>

            {linkMessage && (
              <div
                className={`p-3 rounded-xl border text-sm flex items-center gap-2 ${
                  linkMessage.tipo === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {linkMessage.tipo === 'ok' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{linkMessage.texto}</span>
              </div>
            )}

            {generatedLink && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    Link Ativo Gerado
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedLink)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-200 rounded-lg px-2.5 py-1"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copiado!' : 'Copiar URL'}
                  </button>
                </div>
                <a
                  href={generatedLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono text-emerald-800 break-all underline hover:text-emerald-950"
                >
                  {generatedLink}
                </a>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingLink}
                className="btn-primary px-6 py-2.5 flex items-center gap-2"
              >
                {savingLink ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando link...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Gerar Novo Link
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Histórico de Links */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Links Existentes</h2>
              <p className="text-xs text-gray-500 mt-0.5">Histórico de tokens gerados para este parceiro.</p>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {linksList.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum link gerado ainda.</p>
              ) : (
                linksList.map((link) => (
                  <div key={link.id} className="rounded-xl border border-gray-200 p-3.5 text-sm bg-white space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-gray-900 leading-tight">{link.label || 'Link sem rótulo'}</div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                        {link.flow_type === 'external' ? 'Externa' : 'Interna'}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500">
                      {link.product_name ? `${link.product_name} (${link.product_code})` : 'Produto Padrão'}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 text-gray-600 font-mono">
                      <span>/contratar/{link.token}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(`${window.location.origin}/contratar/${link.token}`)}
                        className="text-primary hover:underline flex items-center gap-1 font-sans text-xs font-semibold"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
