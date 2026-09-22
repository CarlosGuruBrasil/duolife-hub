'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from '@/components/ui/toast';
import {
  Key,
  LockKeyhole,
  Zap,
  CreditCard,
  FileSignature,
  Globe,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FlaskConical,
  Power,
  LayoutDashboard,
  Mail,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  Info,
  Clock,
  Play,
} from 'lucide-react';

interface DevApiKeysClientProps {
  userEmail: string;
  userName: string;
}

interface ApiSettings {
  ASAAS_API_KEY: string;
  ASAAS_ENVIRONMENT: string;
  ASAAS_WEBHOOK_SECRET: string;

  ZAPSIGN_API_TOKEN: string;
  ZAPSIGN_ENVIRONMENT: string;
  ZAPSIGN_TEMPLATE_OFICIAL: string;
  ZAPSIGN_TEMPLATE_100K: string;
  ZAPSIGN_TEMPLATE_RENOVACAO: string;
  ZAPSIGN_WEBHOOK_SECRET: string;

  WIX_API_KEY: string;
  WIX_SITE_ID: string;
  WIX_INTEGRATION_ENABLED: string;

  NET4LIFE_INFO_API_URL: string;
  NET4LIFE_INFO_API_TOKEN: string;
  NET4LIFE_INFO_SENDER_EMAIL: string;
  NET4LIFE_INFO_SENDER_NAME: string;
  NET4LIFE_INFO_REPLY_TO: string;
  NET4LIFE_INFO_SMTP_USER: string;
  NET4LIFE_INFO_ENABLED: string;

  RENEWAL_WINDOWS: string;
  RENEWAL_ENABLED: string;
  INADIMPLENCIA_ENABLED: string;
  INADIMPLENCIA_A_VENCER_DAYS: string;
  INADIMPLENCIA_VENCIDAS_DAYS: string;
  CRON_SECRET: string;
}

const DEFAULT_SETTINGS: ApiSettings = {
  ASAAS_API_KEY: '',
  ASAAS_ENVIRONMENT: 'sandbox',
  ASAAS_WEBHOOK_SECRET: '',
  ZAPSIGN_API_TOKEN: '',
  ZAPSIGN_ENVIRONMENT: 'sandbox',
  ZAPSIGN_TEMPLATE_OFICIAL: '',
  ZAPSIGN_TEMPLATE_100K: '',
  ZAPSIGN_TEMPLATE_RENOVACAO: '',
  ZAPSIGN_WEBHOOK_SECRET: '',
  WIX_API_KEY: '',
  WIX_SITE_ID: '',
  WIX_INTEGRATION_ENABLED: 'true',
  NET4LIFE_INFO_API_URL: 'https://api.duo24horas.com.br/email_marketing/v1',
  NET4LIFE_INFO_API_TOKEN: '',
  NET4LIFE_INFO_SENDER_EMAIL: 'contato@duolife.com.br',
  NET4LIFE_INFO_SENDER_NAME: 'DuoLife Hub',
  NET4LIFE_INFO_REPLY_TO: '',
  NET4LIFE_INFO_SMTP_USER: '',
  NET4LIFE_INFO_ENABLED: 'true',

  RENEWAL_WINDOWS: '60,30,15,0',
  RENEWAL_ENABLED: 'true',
  INADIMPLENCIA_ENABLED: 'true',
  INADIMPLENCIA_A_VENCER_DAYS: '3,1',
  INADIMPLENCIA_VENCIDAS_DAYS: '1,3,7,15',
  CRON_SECRET: '',
};

type TabType = 'visao-geral' | 'asaas' | 'zapsign' | 'wix' | 'email-marketing' | 'lifecycle';

export default function DevApiKeysClient({ userEmail }: DevApiKeysClientProps) {
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingNet4Life, setTestingNet4Life] = useState(false);
  const [net4LifeTestResult, setNet4LifeTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [testingZapSign, setTestingZapSign] = useState(false);
  const [zapSignTestResult, setZapSignTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    environment?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('visao-geral');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleTestZapSign() {
    setTestingZapSign(true);
    setZapSignTestResult(null);
    try {
      const res = await fetch('/api/admin/chaves-api/test-zapsign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken: settings.ZAPSIGN_API_TOKEN,
          environment: settings.ZAPSIGN_ENVIRONMENT,
        }),
      });
      const data = await res.json();
      setZapSignTestResult({
        success: data.ok,
        message: data.message || (data.ok ? 'Conexão realizada com sucesso!' : 'Falha na conexão.'),
        latencyMs: data.latencyMs,
        environment: data.environment,
      });
    } catch (err: any) {
      setZapSignTestResult({
        success: false,
        message: err?.message || 'Erro de rede ao testar conexão com a ZapSign.',
      });
    } finally {
      setTestingZapSign(false);
    }
  }

  async function handleTestNet4Life() {
    setTestingNet4Life(true);
    setNet4LifeTestResult(null);
    try {
      const res = await fetch('/api/admin/chaves-api/test-net4life', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: settings.NET4LIFE_INFO_API_URL,
          apiToken: settings.NET4LIFE_INFO_API_TOKEN,
          senderEmail: settings.NET4LIFE_INFO_SENDER_EMAIL,
          senderName: settings.NET4LIFE_INFO_SENDER_NAME,
          replyTo: settings.NET4LIFE_INFO_REPLY_TO,
          smtpUser: settings.NET4LIFE_INFO_SMTP_USER,
        }),
      });
      const data = await res.json();
      setNet4LifeTestResult({
        success: data.ok,
        message: data.message || (data.ok ? 'Conexão realizada com sucesso!' : 'Falha na conexão.'),
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setNet4LifeTestResult({
        success: false,
        message: err?.message || 'Erro de rede ao testar conexão com o Net4Life Info.',
      });
    } finally {
      setTestingNet4Life(false);
    }
  }

  const [runningCron, setRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState<any>(null);

  async function handleRunCron(dryRun: boolean) {
    setRunningCron(true);
    setCronResult(null);
    try {
      const res = await fetch(`/api/cron/lifecycle?dryRun=${dryRun ? 'true' : 'false'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setCronResult(data);
      if (data.ok) {
        toast.success(`Varredura de lifecycle concluída (${dryRun ? 'Modo Simulação' : 'Disparos Efetuados'})!`);
      } else {
        toast.error(`Varredura concluída com avisos: ${data.errors?.join('; ') || 'Consulte os detalhes'}`);
      }
    } catch (err: any) {
      toast.error(`Erro ao acionar varredura: ${err?.message || err}`);
    } finally {
      setRunningCron(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/chaves-api');
      const data = await res.json();
      if (res.ok && data.settings) {
        setSettings((prev) => ({ ...prev, ...data.settings }));
      } else {
        toast.error(data.error || 'Falha ao carregar configurações de API');
      }
    } catch {
      toast.error('Erro de conexão ao carregar configurações de API');
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (key: keyof ApiSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (text: string, keyName: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      toast.success(`Chave ${keyName} copiada para a área de transferência!`);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/chaves-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('As configurações de API e credenciais foram salvas com sucesso!');
      } else {
        toast.error(data.error || 'Falha ao salvar as configurações.');
      }
    } catch {
      toast.error('Erro de comunicação com o servidor ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const isAsaasSandbox = settings.ASAAS_ENVIRONMENT === 'sandbox';
  const isZapSignSandbox = settings.ZAPSIGN_ENVIRONMENT === 'sandbox';
  const isWixEnabled = settings.WIX_INTEGRATION_ENABLED !== 'false';
  const isNet4LifeInfoEnabled = settings.NET4LIFE_INFO_ENABLED !== 'false';

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: string;
    badgeColor?: string;
  }> = [
    {
      id: 'visao-geral',
      label: 'Visão Geral',
      icon: LayoutDashboard,
      badge: '4 Sistemas',
      badgeColor: 'bg-cyan-50 text-[#0e4a5a] border border-cyan-200',
    },
    {
      id: 'asaas',
      label: 'Asaas (Pagamentos)',
      icon: CreditCard,
      badge: isAsaasSandbox ? 'Sandbox' : 'Produção',
      badgeColor: isAsaasSandbox
        ? 'bg-amber-50 text-amber-800 border border-amber-200'
        : 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    },
    {
      id: 'zapsign',
      label: 'ZapSign (Contratos)',
      icon: FileSignature,
      badge: isZapSignSandbox ? 'Sandbox' : 'Produção',
      badgeColor: isZapSignSandbox
        ? 'bg-amber-50 text-amber-800 border border-amber-200'
        : 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    },
    {
      id: 'wix',
      label: 'Wix Data (CMS)',
      icon: Globe,
      badge: isWixEnabled ? 'Ligada' : 'Desligada',
      badgeColor: isWixEnabled
        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        : 'bg-gray-100 text-gray-600 border border-gray-200',
    },
    {
      id: 'email-marketing',
      label: 'E-mail Marketing (Net4Life)',
      icon: Mail,
      badge: isNet4LifeInfoEnabled
        ? settings.NET4LIFE_INFO_API_TOKEN
          ? 'Ativo'
          : 'Pendente'
        : 'Desligado',
      badgeColor:
        isNet4LifeInfoEnabled && settings.NET4LIFE_INFO_API_TOKEN
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : isNet4LifeInfoEnabled
          ? 'bg-amber-50 text-amber-800 border border-amber-200'
          : 'bg-gray-100 text-gray-600 border border-gray-200',
    },
    {
      id: 'lifecycle',
      label: 'Régua & Lifecycle',
      icon: Clock,
      badge: settings.RENEWAL_ENABLED !== 'false' ? 'Ativo' : 'Pausado',
      badgeColor:
        settings.RENEWAL_ENABLED !== 'false'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-amber-50 text-amber-800 border border-amber-200',
    },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <RefreshCw className="h-8 w-8 text-[#00d4e0] animate-spin mx-auto" />
        <p className="text-xs font-bold text-gray-500">Carregando chaves de API e ambientes de teste...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header no Container Oficial admin-hero-card (Apple HIG Large Title: 30px / 1.875rem) */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">INTEGRAÇÕES & PARÂMETROS DEV</span>
          <h1 className="admin-page-title">Configurações</h1>
          <p className="admin-page-copy">
            Gerenciamento centralizado de integrações, chaves secretas e ambientes de teste.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving}
          className="btn-primary text-xs font-black px-5 py-2.5 rounded-xl uppercase tracking-wider shrink-0 gap-2 cursor-pointer"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-[#00d4e0]" />}
          <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
        </button>
      </section>

      {/* 2. Banner Informativo de Acesso Restrito a Desenvolvedores (Apple HIG Callout: 14px / Subheadline: 13px) */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-800">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
              Painel de Credenciais & Ambientes — Exclusivo para Desenvolvedores DuoLife
            </h3>
            <p className="text-xs text-amber-800 font-medium mt-0.5">
              Esta seção parametriza os tokens secretos e endpoints das integrações ativas (Asaas, ZapSign e Wix). Usuários comuns e parceiros não possuem acesso.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-200/90 border border-amber-300 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-950">
          Gestão Restrita Dev
        </span>
      </div>

      {/* 3. Barra de Navegação em Abas (Apple HIG Segmented Tab Bar) */}
      <div className="border border-gray-200 bg-white rounded-2xl p-2 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#0e4a5a] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-transparent'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#00d4e0]' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-black rounded-full transition-colors ${
                      isActive ? 'bg-white/20 text-white border border-white/30' : tab.badgeColor
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Formulário e Conteúdo Dinâmico por Aba */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* ABA 1: VISÃO GERAL */}
        {activeTab === 'visao-geral' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Cards de Status Rápido dos 4 Sistemas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Asaas */}
              <div className="card no-hover p-5 flex flex-col justify-between space-y-4 border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-[#0e4a5a] shrink-0">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Asaas (Pagamentos)</h3>
                      <p className="text-xs text-gray-500">Cobranças, Boletos Híbridos com PIX e Cartão.</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 ${
                      isAsaasSandbox
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isAsaasSandbox ? 'Sandbox (Testes)' : 'Produção Real'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <span className="text-gray-500 block font-medium">Chave de API:</span>
                    <span className="font-bold text-gray-800">
                      {settings.ASAAS_API_KEY ? 'Configurada' : 'Pendente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Webhook:</span>
                    <span className="font-bold text-gray-800">
                      {settings.ASAAS_WEBHOOK_SECRET ? 'Configurado' : 'Opcional'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() =>
                      handleChange('ASAAS_ENVIRONMENT', isAsaasSandbox ? 'production' : 'sandbox')
                    }
                    className="text-xs font-bold text-[#0e4a5a] hover:text-[#072a33] flex items-center gap-1 cursor-pointer"
                  >
                    <FlaskConical className="h-3.5 w-3.5 text-[#00d4e0]" />
                    <span>Alternar para {isAsaasSandbox ? 'Produção' : 'Sandbox'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('asaas')}
                    className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Configurar Asaas</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* ZapSign */}
              <div className="card no-hover p-5 flex flex-col justify-between space-y-4 border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-[#0e4a5a] shrink-0">
                      <FileSignature className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">ZapSign (Contratos)</h3>
                      <p className="text-xs text-gray-500">Minutas contratuais e assinaturas eletrônicas.</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 ${
                      isZapSignSandbox
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isZapSignSandbox ? 'Sandbox (Testes)' : 'Produção Real'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <span className="text-gray-500 block font-medium">Token da API:</span>
                    <span className="font-bold text-gray-800">
                      {settings.ZAPSIGN_API_TOKEN ? 'Configurado' : 'Pendente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Templates Minutas:</span>
                    <span className="font-bold text-gray-800">
                      {[
                        settings.ZAPSIGN_TEMPLATE_OFICIAL,
                        settings.ZAPSIGN_TEMPLATE_100K,
                        settings.ZAPSIGN_TEMPLATE_RENOVACAO,
                      ].filter(Boolean).length}{' '}
                      de 3 ativos
                    </span>
                  </div>
                </div>

                {zapSignTestResult && (
                  <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 border ${zapSignTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {zapSignTestResult.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    <span className="truncate">{zapSignTestResult.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleChange('ZAPSIGN_ENVIRONMENT', isZapSignSandbox ? 'production' : 'sandbox')
                      }
                      className="text-xs font-bold text-[#0e4a5a] hover:text-[#072a33] flex items-center gap-1 cursor-pointer"
                    >
                      <FlaskConical className="h-3.5 w-3.5 text-[#00d4e0]" />
                      <span>{isZapSignSandbox ? 'Ir p/ Produção' : 'Ir p/ Sandbox'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestZapSign}
                      disabled={testingZapSign}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
                      title="Testar autenticação ZapSign"
                    >
                      <RefreshCw className={`h-3 w-3 text-[#0e4a5a] ${testingZapSign ? 'animate-spin' : ''}`} />
                      <span>{testingZapSign ? 'Testando...' : 'Testar'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('zapsign')}
                    className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Configurar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Wix Data */}
              <div className="card no-hover p-5 flex flex-col justify-between space-y-4 border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-[#0e4a5a] shrink-0">
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Wix Data (CMS)</h3>
                      <p className="text-xs text-gray-500">Sincronização de leads e coleção Import1.</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 ${
                      isWixEnabled
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {isWixEnabled ? 'Ativo' : 'Desligado'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <span className="text-gray-500 block font-medium">Chave de API:</span>
                    <span className="font-bold text-gray-800">
                      {settings.WIX_API_KEY ? 'Configurada' : 'Pendente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Site ID:</span>
                    <span className="font-bold text-gray-800 truncate block">
                      {settings.WIX_SITE_ID ? `${settings.WIX_SITE_ID.slice(0, 10)}...` : 'Pendente'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <Link
                      href="/admin/comparativo-wix"
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline"
                    >
                      Comparativo Wix
                    </Link>
                    <span className="text-gray-300">&bull;</span>
                    <Link
                      href="/admin/importar-csv"
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline"
                    >
                      Importar CSV
                    </Link>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('wix')}
                    className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Configurar Wix</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Net4Life Info (E-mail Marketing) */}
              <div className="card no-hover p-5 flex flex-col justify-between space-y-4 border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-[#0e4a5a] shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Net4Life Info (E-mail Marketing)</h3>
                      <p className="text-xs text-gray-500">API de alta entregabilidade, templates e gestão SMTP.</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 ${
                      isNet4LifeInfoEnabled
                        ? settings.NET4LIFE_INFO_API_TOKEN
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {isNet4LifeInfoEnabled ? (settings.NET4LIFE_INFO_API_TOKEN ? 'Ativo' : 'Pendente Token') : 'Desligado'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <span className="text-gray-500 block font-medium">App Token:</span>
                    <span className="font-bold text-gray-800">
                      {settings.NET4LIFE_INFO_API_TOKEN ? 'Configurado (em_...)' : 'Pendente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Remetente:</span>
                    <span className="font-bold text-gray-800 truncate block">
                      {settings.NET4LIFE_INFO_SENDER_EMAIL || 'Pendente'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <a
                    href="https://net4lifeinfo.com.br/doc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline flex items-center gap-1"
                  >
                    <span>Doc da API</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => setActiveTab('email-marketing')}
                    className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Configurar Net4Life</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Ações Rápidas de Modo Teste */}
            <div className="card no-hover p-6 border-gray-200 space-y-4">
              <div className="admin-section-header">
                <div>
                  <h2 className="admin-section-title flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-[var(--primary)]" /> Alternador Geral de Ambientes de Teste
                  </h2>
                  <p className="admin-section-copy">
                    Alterne com segurança e rapidez o comportamento dos gateways financeiros e contratuais.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50/60">
                  <div>
                    <div className="text-xs font-bold text-gray-900">Asaas (Gateway de Pagamento)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {isAsaasSandbox ? 'Ambiente: Sandbox API v3' : 'Ambiente: Produção Real'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleChange('ASAAS_ENVIRONMENT', isAsaasSandbox ? 'production' : 'sandbox')
                    }
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 ${
                      isAsaasSandbox
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    <span>{isAsaasSandbox ? 'SANDBOX' : 'PRODUÇÃO'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50/60">
                  <div>
                    <div className="text-xs font-bold text-gray-900">ZapSign (Contratos & Assinaturas)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {isZapSignSandbox ? 'Ambiente: Sandbox API v1' : 'Ambiente: Produção Real'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleChange('ZAPSIGN_ENVIRONMENT', isZapSignSandbox ? 'production' : 'sandbox')
                    }
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 ${
                      isZapSignSandbox
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    <span>{isZapSignSandbox ? 'SANDBOX' : 'PRODUÇÃO'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: ASAAS */}
        {activeTab === 'asaas' && (
          <div className="card no-hover space-y-6 border-gray-200 p-6 animate-in fade-in duration-150">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-[var(--primary)]" /> Asaas (Cobrança, Boletos Híbridos & PIX)
                </h2>
                <p className="admin-section-copy">
                  Credenciais de integração com a conta Asaas da DuoLife para geração de cobranças e conciliação automática.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleChange('ASAAS_ENVIRONMENT', isAsaasSandbox ? 'production' : 'sandbox')
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  isAsaasSandbox
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{isAsaasSandbox ? 'MODO TESTE (SANDBOX)' : 'PRODUÇÃO REAL'}</span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="field-label">Chave de API Asaas (ASAAS_API_KEY)</span>
                <div className="relative">
                  <input
                    type={showSecrets['ASAAS_API_KEY'] ? 'text' : 'password'}
                    value={settings.ASAAS_API_KEY}
                    onChange={(e) => handleChange('ASAAS_API_KEY', e.target.value)}
                    placeholder="$aact_YTU5YTE0M2..."
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('ASAAS_API_KEY')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['ASAAS_API_KEY'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Obtida no painel do Asaas em Minha Conta &gt; Integrações &gt; API.</p>
              </div>

              <div>
                <span className="field-label">Segredo do Webhook Asaas (ASAAS_WEBHOOK_SECRET)</span>
                <div className="relative">
                  <input
                    type={showSecrets['ASAAS_WEBHOOK_SECRET'] ? 'text' : 'password'}
                    value={settings.ASAAS_WEBHOOK_SECRET}
                    onChange={(e) => handleChange('ASAAS_WEBHOOK_SECRET', e.target.value)}
                    placeholder="Segredo para validação de webhooks"
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('ASAAS_WEBHOOK_SECRET')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['ASAAS_WEBHOOK_SECRET'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Token de segurança enviado no header `asaas-access-token`.</p>
              </div>
            </div>

            {/* Box de Webhook Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> URL do Webhook DuoLife para Cadastrar no Asaas
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('https://duolife.com.br/api/webhook/asaas', 'webhook-asaas')}
                  className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'webhook-asaas' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar URL</span>
                    </>
                  )}
                </button>
              </div>
              <code className="block bg-white p-2 rounded-lg border border-gray-200 text-xs font-mono text-gray-800 break-all">
                https://duolife.com.br/api/webhook/asaas
              </code>
              <p className="text-[11px] text-gray-500">
                Eventos processados: <code>PAYMENT_RECEIVED</code>, <code>PAYMENT_CONFIRMED</code>, <code>PAYMENT_OVERDUE</code>.
              </p>
            </div>
          </div>
        )}

        {/* ABA 3: ZAPSIGN */}
        {activeTab === 'zapsign' && (
          <div className="card no-hover space-y-6 border-gray-200 p-6 animate-in fade-in duration-150">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-[var(--primary)]" /> ZapSign (Assinatura Eletrônica de Contratos)
                </h2>
                <p className="admin-section-copy">
                  Token de autenticação e identificadores dos modelos de contrato de Responsabilidade Civil Profissional.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestZapSign}
                  disabled={testingZapSign}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 disabled:opacity-50"
                  title="Testa a autenticação do token informado na API da ZapSign"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-[#0e4a5a] ${testingZapSign ? 'animate-spin' : ''}`} />
                  <span>{testingZapSign ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleChange('ZAPSIGN_ENVIRONMENT', isZapSignSandbox ? 'production' : 'sandbox')
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                    isZapSignSandbox
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>{isZapSignSandbox ? 'MODO TESTE (SANDBOX)' : 'PRODUÇÃO REAL'}</span>
                </button>
              </div>
            </div>

            {/* Banner de Resultado do Teste */}
            {zapSignTestResult && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                  zapSignTestResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {zapSignTestResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <span>{zapSignTestResult.success ? 'Conexão ZapSign Homologada' : 'Atenção na Conexão ZapSign'}</span>
                    {zapSignTestResult.latencyMs !== undefined && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-gray-200 font-mono">
                        {zapSignTestResult.latencyMs}ms
                      </span>
                    )}
                    {zapSignTestResult.environment && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-gray-200 uppercase font-black">
                        {zapSignTestResult.environment}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 leading-relaxed">{zapSignTestResult.message}</p>
                </div>
              </div>
            )}

            {/* Dica de Ambientes ZapSign */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-950 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Importante sobre Contas e Ambientes:</strong> A ZapSign possui sistemas distintos para <em>Produção</em> (<code>app.zapsign.com.br</code>) e <em>Sandbox</em> (<code>sandbox.app.zapsign.com.br</code>). O Token gerado em uma plataforma não é aceito na outra. Se a conta contratada pela empresa é a oficial, mantenha o modo <strong>PRODUÇÃO REAL</strong> selecionado.
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="field-label">Token da API ZapSign (ZAPSIGN_API_TOKEN)</span>
                <div className="relative">
                  <input
                    type={showSecrets['ZAPSIGN_API_TOKEN'] ? 'text' : 'password'}
                    value={settings.ZAPSIGN_API_TOKEN}
                    onChange={(e) => handleChange('ZAPSIGN_API_TOKEN', e.target.value)}
                    placeholder="Token de acesso ZapSign"
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('ZAPSIGN_API_TOKEN')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['ZAPSIGN_API_TOKEN'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Gerado no painel da ZapSign em Configurações &gt; Integrações &gt; Token de API.</p>
              </div>

              <div>
                <span className="field-label">Segredo do Webhook ZapSign (ZAPSIGN_WEBHOOK_SECRET)</span>
                <div className="relative">
                  <input
                    type={showSecrets['ZAPSIGN_WEBHOOK_SECRET'] ? 'text' : 'password'}
                    value={settings.ZAPSIGN_WEBHOOK_SECRET}
                    onChange={(e) => handleChange('ZAPSIGN_WEBHOOK_SECRET', e.target.value)}
                    placeholder="Segredo de validação do webhook"
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('ZAPSIGN_WEBHOOK_SECRET')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['ZAPSIGN_WEBHOOK_SECRET'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Validador de assinatura enviado pela ZapSign nas notificações.</p>
              </div>
            </div>

            {/* Modelos de Minutas */}
            <div className="border-t border-gray-200 pt-5 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-700">
                Modelos de Minuta Cadastrados no ZapSign (Template IDs)
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <span className="field-label">Template Oficial (Padrão)</span>
                  <input
                    type="text"
                    value={settings.ZAPSIGN_TEMPLATE_OFICIAL}
                    onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_OFICIAL', e.target.value)}
                    placeholder="ID do modelo padrão"
                    className="form-input"
                  />
                </div>

                <div>
                  <span className="field-label">Template Plano 100k</span>
                  <input
                    type="text"
                    value={settings.ZAPSIGN_TEMPLATE_100K}
                    onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_100K', e.target.value)}
                    placeholder="ID do modelo 100k"
                    className="form-input"
                  />
                </div>

                <div>
                  <span className="field-label">Template Renovação</span>
                  <input
                    type="text"
                    value={settings.ZAPSIGN_TEMPLATE_RENOVACAO}
                    onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_RENOVACAO', e.target.value)}
                    placeholder="ID do modelo de renovação"
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Box de Webhook Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> URL do Webhook DuoLife para Cadastrar na ZapSign
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('https://duolife.com.br/api/webhook/zapsign', 'webhook-zapsign')}
                  className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'webhook-zapsign' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar URL</span>
                    </>
                  )}
                </button>
              </div>
              <code className="block bg-white p-2 rounded-lg border border-gray-200 text-xs font-mono text-gray-800 break-all">
                https://duolife.com.br/api/webhook/zapsign
              </code>
              <p className="text-[11px] text-gray-500">
                Gatilho automático: assim que o proponente assina, o status da cotação muda para <code>assinado</code> e gera a fatura Asaas.
              </p>
            </div>
          </div>
        )}

        {/* ABA 4: WIX DATA */}
        {activeTab === 'wix' && (
          <div className="card no-hover space-y-6 border-gray-200 p-6 animate-in fade-in duration-150">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title flex items-center gap-2">
                  <Globe className="h-5 w-5 text-[var(--primary)]" /> Wix Data (CMS & Espelho da Coleção Import1)
                </h2>
                <p className="admin-section-copy">
                  Chave de API e identificador do site Wix para sincronização contínua de clientes e propostas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleChange('WIX_INTEGRATION_ENABLED', isWixEnabled ? 'false' : 'true')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  isWixEnabled
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-red-100 text-red-900 border border-red-300 hover:bg-red-200'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{isWixEnabled ? 'Integração Ligada' : 'Integração Desligada'}</span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="field-label">Chave de API Wix (WIX_API_KEY)</span>
                <div className="relative">
                  <input
                    type={showSecrets['WIX_API_KEY'] ? 'text' : 'password'}
                    value={settings.WIX_API_KEY}
                    onChange={(e) => handleChange('WIX_API_KEY', e.target.value)}
                    placeholder="Chave de API do Wix"
                    className="form-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('WIX_API_KEY')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['WIX_API_KEY'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="field-label">ID do Site Wix (WIX_SITE_ID)</span>
                <input
                  type="text"
                  value={settings.WIX_SITE_ID}
                  onChange={(e) => handleChange('WIX_SITE_ID', e.target.value)}
                  placeholder="ID do MetaSite Wix (ex: 36a9dd1d-...)"
                  className="form-input"
                />
              </div>
            </div>

            {/* Ações e Atalhos Wix */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-gray-800 block">Ferramentas de Migração e Auditoria Wix</span>
                <p className="text-[11px] text-gray-500">
                  Compare divergências entre o banco local e a base do Wix ou importe lotes históricos via CSV.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/admin/comparativo-wix"
                  className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-[#0e4a5a] hover:bg-gray-100 transition-all"
                >
                  Comparativo Wix
                </Link>
                <Link
                  href="/admin/importar-csv"
                  className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-[#0e4a5a] hover:bg-gray-100 transition-all"
                >
                  Importador CSV
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ABA 5: NET4LIFE INFO (E-MAIL MARKETING) */}
        {activeTab === 'email-marketing' && (
          <div className="card no-hover space-y-6 border-gray-200 p-6 animate-in fade-in duration-150">
            <div className="admin-section-header">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="admin-section-title flex items-center gap-2">
                    <Mail className="h-5 w-5 text-[var(--primary)]" /> Net4Life Info (E-mail Marketing)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-50 text-[#0e4a5a] border border-cyan-200">
                    API v1
                  </span>
                </div>
                <p className="admin-section-copy">
                  Integração oficial com a API de alta entregabilidade Net4Life Info (<code className="text-xs">net4lifeinfo.com.br</code>) para disparos transacionais, templates e contas SMTP.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleChange('NET4LIFE_INFO_ENABLED', isNet4LifeInfoEnabled ? 'false' : 'true')
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  isNet4LifeInfoEnabled
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-red-100 text-red-900 border border-red-300 hover:bg-red-200'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{isNet4LifeInfoEnabled ? 'Integração Ligada' : 'Integração Desligada'}</span>
              </button>
            </div>

            {/* Banner Informativo Net4Life Info */}
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 flex items-start gap-3">
              <div className="p-2 bg-cyan-100/80 rounded-lg text-[#0e4a5a] shrink-0 mt-0.5">
                <Info className="h-4 w-4" />
              </div>
              <div className="text-xs leading-relaxed text-gray-700">
                <p className="font-bold text-[#0e4a5a] mb-0.5">Autenticação e Documentação Oficial:</p>
                As requisições para a API utilizam cabeçalho <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono text-[11px]">Authorization: Bearer em_...</code>. 
                Conforme a documentação oficial, o token da aplicação deve começar com o prefixo <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono text-[11px]">em_</code>.
                Consulte a documentação interativa em{' '}
                <a
                  href="https://net4lifeinfo.com.br/doc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#0e4a5a] underline hover:text-[#072a33] inline-flex items-center gap-1"
                >
                  net4lifeinfo.com.br/doc <ExternalLink className="h-3 w-3" />
                </a>.
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* URL Base da API */}
              <div className="md:col-span-2">
                <span className="field-label">URL Base da API (Endpoint)</span>
                <input
                  type="text"
                  value={settings.NET4LIFE_INFO_API_URL}
                  onChange={(e) => handleChange('NET4LIFE_INFO_API_URL', e.target.value)}
                  placeholder="https://api.duo24horas.com.br/email_marketing/v1"
                  className="form-input font-mono text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Prefixo do backend da API (padrão: <code>https://api.duo24horas.com.br/email_marketing/v1</code>). Se você inserir <code>net4lifeinfo.com.br</code>, o sistema normalizará automaticamente para o servidor oficial.
                </p>
              </div>

              {/* Token da Aplicação (em_...) */}
              <div className="md:col-span-2">
                <span className="field-label">Token da Aplicação (App Token — deve iniciar com &quot;em_&quot;)</span>
                <div className="relative">
                  <input
                    type={showSecrets['NET4LIFE_INFO_API_TOKEN'] ? 'text' : 'password'}
                    value={settings.NET4LIFE_INFO_API_TOKEN}
                    onChange={(e) => handleChange('NET4LIFE_INFO_API_TOKEN', e.target.value)}
                    placeholder="em_id_segredo"
                    className="form-input pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('NET4LIFE_INFO_API_TOKEN')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showSecrets['NET4LIFE_INFO_API_TOKEN'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Chave Bearer gerada no cadastro do aplicativo. Templates, SMTP e envios ficam isolados nesta aplicação.
                </p>
              </div>

              {/* Remetente E-mail */}
              <div>
                <span className="field-label">E-mail do Remetente Padrão (remetente_email)</span>
                <input
                  type="email"
                  value={settings.NET4LIFE_INFO_SENDER_EMAIL}
                  onChange={(e) => handleChange('NET4LIFE_INFO_SENDER_EMAIL', e.target.value)}
                  placeholder="ex: contato@duolife.com.br"
                  className="form-input"
                />
                <p className="text-[11px] text-gray-500 mt-1">Se omitido nos disparos, utiliza o usuário da conta SMTP vinculada.</p>
              </div>

              {/* Remetente Nome */}
              <div>
                <span className="field-label">Nome do Remetente Padrão (remetente_nome)</span>
                <input
                  type="text"
                  value={settings.NET4LIFE_INFO_SENDER_NAME}
                  onChange={(e) => handleChange('NET4LIFE_INFO_SENDER_NAME', e.target.value)}
                  placeholder="ex: DuoLife Hub"
                  className="form-input"
                />
                <p className="text-[11px] text-gray-500 mt-1">Nome de exibição que aparecerá na caixa de entrada dos segurados.</p>
              </div>

              {/* Reply To */}
              <div>
                <span className="field-label">Endereço de Resposta (reply_to — Opcional)</span>
                <input
                  type="email"
                  value={settings.NET4LIFE_INFO_REPLY_TO}
                  onChange={(e) => handleChange('NET4LIFE_INFO_REPLY_TO', e.target.value)}
                  placeholder="ex: atendimento@duolife.com.br"
                  className="form-input"
                />
                <p className="text-[11px] text-gray-500 mt-1">Caixa de entrada para onde respostas diretas serão encaminhadas.</p>
              </div>

              {/* SMTP User / ID Específico */}
              <div>
                <span className="field-label">Conta SMTP Específica (smtp_user / smtp_id — Opcional)</span>
                <input
                  type="text"
                  value={settings.NET4LIFE_INFO_SMTP_USER}
                  onChange={(e) => handleChange('NET4LIFE_INFO_SMTP_USER', e.target.value)}
                  placeholder="ex: disparos@duolife.com.br ou ID da conta"
                  className="form-input"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Se informado, força o uso de uma conta SMTP específica cadastrada em <code>/appsmtp</code>.
                </p>
              </div>
            </div>

            {/* Teste de Conexão com Net4Life Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div>
                <span className="text-xs font-bold text-gray-800 block">Diagnóstico e Teste de Conexão</span>
                <span className="text-[11px] text-gray-500">Verifica em tempo real se o Token Bearer é aceito pela API Net4Life Info.</span>
              </div>
              <button
                type="button"
                onClick={handleTestNet4Life}
                disabled={testingNet4Life || !settings.NET4LIFE_INFO_API_TOKEN}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-primary text-primary bg-white hover:bg-primary/5 transition disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {testingNet4Life ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Testar Conexão</span>
                  </>
                )}
              </button>
            </div>

            {net4LifeTestResult && (
              <div
                className={`rounded-xl border p-4 text-xs flex items-start gap-2.5 ${
                  net4LifeTestResult.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {net4LifeTestResult.success ? (
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="font-bold block">{net4LifeTestResult.message}</span>
                  {net4LifeTestResult.latencyMs !== undefined && (
                    <span className="text-[11px] opacity-80">Latência: {net4LifeTestResult.latencyMs}ms</span>
                  )}
                </div>
              </div>
            )}

            {/* Guia Rápido de Endpoints da API Net4Life Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Endpoints Disponíveis na API Net4Life Info
                </span>
                <a
                  href="https://net4lifeinfo.com.br/doc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#0e4a5a] hover:underline flex items-center gap-1"
                >
                  <span>Abrir Documentação Completa</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="font-mono font-bold text-emerald-700">POST /enviaremail</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">Disparo transacional e em lote via template ou HTML direto.</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="font-mono font-bold text-[#0e4a5a]">GET/POST /templates</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">Consulta, criação e atualização de modelos com variáveis.</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="font-mono font-bold text-cyan-700">GET/POST /appsmtp</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">Configuração do servidor SMTP e caixa de bounces da app.</p>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 pt-1">
                Variáveis reservadas injetadas automaticamente pelo sistema em todos os envios:{' '}
                <code className="bg-white px-1 rounded border text-gray-800">{"{{view_in_browser}}"}</code> (versão web do e-mail com HMAC) e{' '}
                <code className="bg-white px-1 rounded border text-gray-800">{"{{unsubscribe_link}}"}</code> (descadastro LGPD).
              </p>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* ABA: RÉGUA AUTOMATIZADA & RETENÇÃO (LIFECYCLE)                    */}
        {/* ================================================================= */}
        {activeTab === 'lifecycle' && (
          <div className="space-y-6">
            {/* Header / Visão Geral da Régua */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Régua Automatizada de Renovação e Retenção</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Serviço agendado (cronjob) para antecipação de vencimentos de apólices e alertas de inadimplência Asaas.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                      settings.RENEWAL_ENABLED !== 'false'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {settings.RENEWAL_ENABLED !== 'false' ? '● Renovação Ativa' : '○ Renovação Desativada'}
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                      settings.INADIMPLENCIA_ENABLED !== 'false'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {settings.INADIMPLENCIA_ENABLED !== 'false' ? '● Inadimplência Ativa' : '○ Inadimplência Desativada'}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 grid sm:grid-cols-3 gap-3 text-xs text-gray-600">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200/80">
                  <span className="font-bold text-gray-900 block mb-1">1. Janelas de Renovação</span>
                  Notifica o corretor responsável em D-60, D-30, D-15 e D-0 com link de 1 clique para iniciar cotação de renovação pré-preenchida.
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200/80">
                  <span className="font-bold text-gray-900 block mb-1">2. Alertas de Inadimplência</span>
                  Avisa o corretor sobre parcelas a vencer e faturas vencidas do Asaas, fornecendo link de PIX/Boleto para reenvio ao segurado.
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200/80">
                  <span className="font-bold text-gray-900 block mb-1">3. Idempotência Blindada</span>
                  Controle estrito por apólice e parcela em banco de dados, prevenindo qualquer disparo repetido na mesma janela ou dia.
                </div>
              </div>
            </div>

            {/* Configuração da Régua de Renovação */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-[#0e4a5a]" />
                    Parâmetros da Régua de Renovação
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Define o status operacional e os dias de antecedência para disparo de e-mails ao corretor.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.RENEWAL_ENABLED !== 'false'}
                    onChange={(e) => handleChange('RENEWAL_ENABLED', e.target.checked ? 'true' : 'false')}
                    className="rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a] h-4 w-4"
                  />
                  Habilitar Régua de Renovação
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Janelas de Antecedência em Dias (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    value={settings.RENEWAL_WINDOWS}
                    onChange={(e) => handleChange('RENEWAL_WINDOWS', e.target.value)}
                    placeholder="60,30,15,0"
                    className="form-input text-xs font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Padrão recomendado: <code>60,30,15,0</code> (D-60 dois meses antes, D-30 um mês, D-15 quinze dias e D-0 no dia do vencimento).
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <ShieldCheck className="h-4 w-4" /> Link de Renovação com 1 Clique
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    O e-mail direciona o corretor para <code>/portal/cotacoes/nova?cpf=...&renovacao=true</code>, abrindo a proposta com coberturas e histórico anterior já selecionados.
                  </p>
                </div>
              </div>
            </div>

            {/* Configuração de Alertas de Inadimplência */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Alertas de Inadimplência Asaas (Retenção Financeira)
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Mitigação de cancelamentos de apólices por falta de pagamento das parcelas do seguro.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.INADIMPLENCIA_ENABLED !== 'false'}
                    onChange={(e) => handleChange('INADIMPLENCIA_ENABLED', e.target.checked ? 'true' : 'false')}
                    className="rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a] h-4 w-4"
                  />
                  Habilitar Alertas de Inadimplência
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Dias de Alerta Preventivo — A Vencer (dias antes do vencimento)
                  </label>
                  <input
                    type="text"
                    value={settings.INADIMPLENCIA_A_VENCER_DAYS}
                    onChange={(e) => handleChange('INADIMPLENCIA_A_VENCER_DAYS', e.target.value)}
                    placeholder="3,1"
                    className="form-input text-xs font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Padrão: <code>3,1</code> (3 dias antes e 1 dia antes do vencimento da parcela).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Dias de Alerta Crítico — Faturas Vencidas (dias de atraso)
                  </label>
                  <input
                    type="text"
                    value={settings.INADIMPLENCIA_VENCIDAS_DAYS}
                    onChange={(e) => handleChange('INADIMPLENCIA_VENCIDAS_DAYS', e.target.value)}
                    placeholder="1,3,7,15"
                    className="form-input text-xs font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Padrão: <code>1,3,7,15</code> (D+1, D+3, D+7 e D+15 após o vencimento não liquidado).
                  </p>
                </div>
              </div>
            </div>

            {/* Segurança & Endpoint Agendado (Cronjob) */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-[#0e4a5a]" />
                Autenticação do Cronjob & Endpoint de Agendamento
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Token Secreto do Cron (CRON_SECRET)
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets['CRON_SECRET'] ? 'text' : 'password'}
                      value={settings.CRON_SECRET}
                      onChange={(e) => handleChange('CRON_SECRET', e.target.value)}
                      placeholder="Ex: d41d8cd98f00b204e9800998ecf8427e"
                      className="form-input text-xs font-mono pr-20"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                      <button
                        type="button"
                        onClick={() => toggleShowSecret('CRON_SECRET')}
                        className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showSecrets['CRON_SECRET'] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.CRON_SECRET, 'CRON_SECRET')}
                        className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {copiedKey === 'CRON_SECRET' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Utilizado para validar chamadas de agendadores externos via <code>Authorization: Bearer &lt;token&gt;</code>.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-700 space-y-1.5">
                  <div className="font-bold text-gray-900">Como Agendar (Coolify / Crontab / Scheduler):</div>
                  <div className="font-mono text-[11px] bg-white p-2 rounded border border-gray-200 overflow-x-auto text-gray-800">
                    curl -X POST https://duolife.com.br/api/cron/lifecycle \<br />
                    &nbsp;&nbsp;-H "Authorization: Bearer {settings.CRON_SECRET || 'SEU_TOKEN'}"
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Frequência recomendada: 1 vez ao dia às 08:00 BRT (ex: <code>0 11 * * *</code> em UTC).
                  </p>
                </div>
              </div>
            </div>

            {/* Painel de Disparo Manual & Teste */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                    <Play className="h-4 w-4 text-emerald-700 fill-emerald-700" />
                    Execução Imediata da Régua (Disparo sob Demanda)
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Execute a varredura agora para verificar apólices e faturas elegíveis na data de hoje.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRunCron(true)}
                    disabled={runningCron}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {runningCron ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 text-emerald-600" />}
                    <span>Simular Varredura (Dry Run)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunCron(false)}
                    disabled={runningCron}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#0e4a5a] text-white hover:bg-[#072a33] transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {runningCron ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-[#00d4e0] fill-[#00d4e0]" />}
                    <span>Executar Varredura Real</span>
                  </button>
                </div>
              </div>

              {/* Resultado do Teste */}
              {cronResult && (
                <div className="bg-white border border-emerald-200 rounded-xl p-4 text-xs space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="font-bold text-gray-900 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Resultado da Execução ({cronResult.dryRun ? 'Modo Simulação' : 'Modo Produção'}):
                    </span>
                    <span className="text-gray-500 font-mono text-[11px]">
                      Duração: {(cronResult.durationMs / 1000).toFixed(2)}s &bull; Data: {cronResult.targetDate}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="font-bold text-[#0e4a5a] mb-1">Régua de Renovação</div>
                      <div className="text-gray-700">
                        Varredas: <strong>{cronResult.renewals?.scanned || 0}</strong> &bull; Notificadas:{' '}
                        <strong className="text-emerald-700">{cronResult.renewals?.notified || 0}</strong> &bull; Ignoradas:{' '}
                        {cronResult.renewals?.skipped || 0}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="font-bold text-amber-800 mb-1">Alertas de Inadimplência</div>
                      <div className="text-gray-700">
                        Varredas: <strong>{cronResult.delinquency?.scanned || 0}</strong> &bull; Notificadas:{' '}
                        <strong className="text-amber-700">{cronResult.delinquency?.notified || 0}</strong> &bull; Ignoradas:{' '}
                        {cronResult.delinquency?.skipped || 0}
                      </div>
                    </div>
                  </div>

                  {cronResult.errors && cronResult.errors.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-rose-800 text-[11px]">
                      <span className="font-bold block mb-1">Avisos / Erros:</span>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {cronResult.errors.map((e: string, idx: number) => (
                          <li key={idx}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Botão de Salvar Alterações Unificado no Rodapé */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200/80">
          <div className="text-xs text-gray-500">
            {activeTab === 'visao-geral' ? (
              <span>Modificações feitas em qualquer aba são persistidas conjuntamente ao salvar.</span>
            ) : (
              <span>
                Configurações da aba <strong>{tabs.find((t) => t.id === activeTab)?.label}</strong> prontas para serem salvas.
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs font-black px-8 py-3 rounded-xl uppercase tracking-wider gap-2 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-[#00d4e0]" />}
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
