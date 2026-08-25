'use client';

import { useState, useEffect } from 'react';
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
};

export default function DevApiKeysClient({ userEmail }: DevApiKeysClientProps) {
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/chaves-api');
      const data = await res.json();
      if (res.ok && data.settings) {
        setSettings(data.settings);
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao carregar configurações de API',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de conexão ao carregar configurações de API',
      });
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

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/chaves-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          message: 'As configurações de API e Modo Teste foram salvas com sucesso!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao salvar as configurações.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação com o servidor ao salvar.',
      });
    } finally {
      setSaving(false);
    }
  }

  const isAsaasSandbox = settings.ASAAS_ENVIRONMENT === 'sandbox';
  const isZapSignSandbox = settings.ZAPSIGN_ENVIRONMENT === 'sandbox';
  const isWixEnabled = settings.WIX_INTEGRATION_ENABLED !== 'false';

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

      {/* Alertas de Feedback (Apple HIG Status Toast) */}
      {feedback && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl border text-xs font-bold animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          )}
          <span className="text-sm font-semibold">{feedback.message}</span>
        </div>
      )}

      {/* 3. Métricas Rápidas dos Serviços (Apple HIG Metric Scale: 13px Label, 30px Value, 14px Hint) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="admin-metric-card">
          <div className="admin-metric-label">Asaas (Pagamentos)</div>
          <div className="admin-metric-value">
            {isAsaasSandbox ? 'Sandbox' : 'Produção'}
          </div>
          <div className="admin-metric-hint">
            {isAsaasSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://www.asaas.com/api/v3'}
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">ZapSign (Contratos)</div>
          <div className="admin-metric-value">
            {isZapSignSandbox ? 'Sandbox' : 'Produção'}
          </div>
          <div className="admin-metric-hint">
            {isZapSignSandbox ? 'sandbox.api.zapsign.com.br' : 'api.zapsign.com.br'}
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Wix Data</div>
          <div className="admin-metric-value">
            {!isWixEnabled ? 'Desligado' : settings.WIX_API_KEY ? 'Ativo' : 'Pendente'}
          </div>
          <div className="admin-metric-hint">
            {settings.WIX_SITE_ID ? `Site ID: ${settings.WIX_SITE_ID.slice(0, 12)}...` : 'Sem Site ID'}
          </div>
        </div>
      </section>

      {/* 4. Controle Rápido de Modo de Teste (Apple HIG Title 2: 18px / Subheadline: 13px) */}
      <div className="card no-hover space-y-4">
        <div className="admin-section-header">
          <div>
            <h2 className="admin-section-title flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-[var(--primary)]" /> Modos de Teste (Sandbox)
            </h2>
            <p className="admin-section-copy">
              Alterne instantaneamente cada provedor entre o ambiente de testes (Sandbox) e a produção real.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Asaas Switch */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 bg-gray-50/60">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-[#0e4a5a]" />
              <div>
                <div className="text-sm font-bold text-gray-900">Asaas (Pagamentos)</div>
                <div className="text-xs text-gray-500 font-medium mt-0.5">
                  {isAsaasSandbox ? 'Ambiente ativo: Sandbox (Teste)' : 'Ambiente ativo: Produção Real'}
                </div>
              </div>
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

          {/* ZapSign Switch */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 bg-gray-50/60">
            <div className="flex items-center gap-3">
              <FileSignature className="h-5 w-5 text-[#0e4a5a]" />
              <div>
                <div className="text-sm font-bold text-gray-900">ZapSign (Contratos)</div>
                <div className="text-xs text-gray-500 font-medium mt-0.5">
                  {isZapSignSandbox ? 'Ambiente ativo: Sandbox (Teste)' : 'Ambiente ativo: Produção Real'}
                </div>
              </div>
            </div>

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
      </div>

      {/* 5. Formulários de Chaves de API (Apple HIG Forms: Field Labels 14px / Inputs 15px) */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Bloco Asaas */}
        <div className="card no-hover space-y-4">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[var(--primary)]" /> Asaas (Cobrança e Boleto Híbrido/PIX)
              </h2>
              <p className="admin-section-copy">Chaves de integração com o gateway financeiro da Asaas.</p>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                isAsaasSandbox
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isAsaasSandbox ? 'Sandbox API v3' : 'Produção API v3'}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <span className="field-label">Chave da API Asaas (ASAAS_API_KEY)</span>
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
            </div>
          </div>
        </div>

        {/* Bloco ZapSign */}
        <div className="card no-hover space-y-4">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-[var(--primary)]" /> ZapSign (Assinatura Eletrônica)
              </h2>
              <p className="admin-section-copy">Token de API e IDs dos modelos de minutas de contrato.</p>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                isZapSignSandbox
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isZapSignSandbox ? 'Sandbox API v1' : 'Produção API v1'}
            </span>
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
            </div>

            <div>
              <span className="field-label">Segredo do Webhook ZapSign (ZAPSIGN_WEBHOOK_SECRET)</span>
              <div className="relative">
                <input
                  type={showSecrets['ZAPSIGN_WEBHOOK_SECRET'] ? 'text' : 'password'}
                  value={settings.ZAPSIGN_WEBHOOK_SECRET}
                  onChange={(e) => handleChange('ZAPSIGN_WEBHOOK_SECRET', e.target.value)}
                  placeholder="Segredo de validação do webhook ZapSign"
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
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
            <div>
              <span className="field-label">Template Oficial (ID)</span>
              <input
                type="text"
                value={settings.ZAPSIGN_TEMPLATE_OFICIAL}
                onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_OFICIAL', e.target.value)}
                placeholder="ex: ID da minuta padrão"
                className="form-input"
              />
            </div>

            <div>
              <span className="field-label">Template Plano 100k (ID)</span>
              <input
                type="text"
                value={settings.ZAPSIGN_TEMPLATE_100K}
                onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_100K', e.target.value)}
                placeholder="ex: ID da minuta 100k"
                className="form-input"
              />
            </div>

            <div>
              <span className="field-label">Template Renovação (ID)</span>
              <input
                type="text"
                value={settings.ZAPSIGN_TEMPLATE_RENOVACAO}
                onChange={(e) => handleChange('ZAPSIGN_TEMPLATE_RENOVACAO', e.target.value)}
                placeholder="ex: ID da minuta renovação"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Bloco Wix */}
        <div className="card no-hover space-y-4">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title flex items-center gap-2">
                <Globe className="h-5 w-5 text-[var(--primary)]" /> Wix Data (CMS & Espelho de Coleções)
              </h2>
              <p className="admin-section-copy">Chave de API, identificador do site e controle da importação de clientes.</p>
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
              <span>{isWixEnabled ? 'Integração ligada' : 'Integração desligada'}</span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <span className="field-label">Chave da API Wix (WIX_API_KEY)</span>
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
                placeholder="ID único do site Wix"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Botão de Salvar Alterações no Rodapé */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs font-black px-8 py-3 rounded-xl uppercase tracking-wider gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-[#00d4e0]" />}
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
