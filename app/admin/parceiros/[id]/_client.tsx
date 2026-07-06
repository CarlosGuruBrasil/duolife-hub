'use client';

import { useState } from 'react';
import type { WhiteLabelConfig } from '@/lib/white-label';

type ProductRow = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
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
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  whiteLabel: WhiteLabelConfig;
};

interface Props {
  partner: PartnerRow;
  products: ProductRow[];
  links: LinkRow[];
}

const baseState = (whiteLabel: WhiteLabelConfig) => ({
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

export default function PartnerWhiteLabelClient({ partner, products, links }: Props) {
  const [form, setForm] = useState(baseState(partner.whiteLabel));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkProductId, setLinkProductId] = useState(products.find((p) => p.is_active)?.id || '');
  const [linkFlowType, setLinkFlowType] = useState<'external' | 'internal'>('external');
  const [linkExpiresInDays, setLinkExpiresInDays] = useState('30');
  const [generatedLink, setGeneratedLink] = useState('');

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveBranding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const res = await fetch(`/api/admin/parceiros/${partner.id}/branding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || 'Falha ao salvar branding.');
      return;
    }

    setMessage('Branding salvo.');
  }

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const res = await fetch(`/api/admin/parceiros/${partner.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: linkLabel,
        productId: linkProductId || undefined,
        flowType: linkFlowType,
        expiresInDays: Number(linkExpiresInDays) || 30,
      }),
    });
    const data = await res.json();

    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || 'Falha ao gerar link.');
      return;
    }

    setGeneratedLink(data.link?.url || '');
    setMessage('Link público gerado.');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>
          White-label do parceiro
        </h1>
        <p className="text-gray-500 text-sm mt-1">{partner.razao_social}</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">E-mail</div>
          <div className="mt-2 text-sm font-bold" style={{ color: 'var(--primary)' }}>{partner.email}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Telefone</div>
          <div className="mt-2 text-sm font-bold" style={{ color: 'var(--primary)' }}>{partner.phone || '-'}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Slug</div>
          <div className="mt-2 text-sm font-bold" style={{ color: 'var(--primary)' }}>{partner.whiteLabel.slug || '-'}</div>
        </div>
      </div>

      <form onSubmit={saveBranding} className="card space-y-5 mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="field-label">Slug público</span>
            <input className="form-input" value={form.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="parceiro-x" />
          </label>
          <label className="block">
            <span className="field-label">Código Wix</span>
            <input className="form-input" value={form.wixCode} onChange={(e) => setField('wixCode', e.target.value)} placeholder="12345" />
          </label>
          <label className="block">
            <span className="field-label">Website</span>
            <input className="form-input" value={form.companyWebsite} onChange={(e) => setField('companyWebsite', e.target.value)} placeholder="https://..." />
          </label>
          <label className="block">
            <span className="field-label">Nome exibido</span>
            <input className="form-input" value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Slogan</span>
            <input className="form-input" value={form.companySlogan} onChange={(e) => setField('companySlogan', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Logo URL</span>
            <input className="form-input" value={form.logoUrl} onChange={(e) => setField('logoUrl', e.target.value)} placeholder="https://..." />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="field-label">Cor primária</span>
            <input className="form-input" value={form.primaryColor} onChange={(e) => setField('primaryColor', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Cor secundária</span>
            <input className="form-input" value={form.secondaryColor} onChange={(e) => setField('secondaryColor', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Cor accent</span>
            <input className="form-input" value={form.accentColor} onChange={(e) => setField('accentColor', e.target.value)} />
          </label>
          <label className="block md:col-span-3">
            <span className="field-label">Texto institucional</span>
            <textarea className="form-input min-h-24" value={form.institutionText} onChange={(e) => setField('institutionText', e.target.value)} />
          </label>
          <label className="block md:col-span-3">
            <span className="field-label">Rodapé personalizado</span>
            <textarea className="form-input min-h-24" value={form.footerText} onChange={(e) => setField('footerText', e.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="field-label">Contato e-mail</span>
            <input className="form-input" value={form.companyEmail} onChange={(e) => setField('companyEmail', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Contato telefone</span>
            <input className="form-input" value={form.companyPhone} onChange={(e) => setField('companyPhone', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Domínio</span>
            <input className="form-input" value={form.domain} onChange={(e) => setField('domain', e.target.value)} placeholder="exemplo.com.br" />
          </label>
          <label className="block">
            <span className="field-label">Subdomínio</span>
            <input className="form-input" value={form.subdomain} onChange={(e) => setField('subdomain', e.target.value)} placeholder="parceiro" />
          </label>
          <label className="block md:col-span-2">
            <span className="field-label">Título da página pública</span>
            <input className="form-input" value={form.publicTitle} onChange={(e) => setField('publicTitle', e.target.value)} />
          </label>
          <label className="block md:col-span-2">
            <span className="field-label">Descrição pública</span>
            <textarea className="form-input min-h-24" value={form.publicDescription} onChange={(e) => setField('publicDescription', e.target.value)} />
          </label>
        </div>

        {message && <p className="text-sm text-gray-600">{message}</p>}

        <div className="flex justify-end">
          <button disabled={saving} className="btn-primary px-6 py-3">
            {saving ? 'Salvando...' : 'Salvar branding'}
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form onSubmit={createLink} className="card space-y-4">
          <h2 className="text-lg font-black" style={{ color: 'var(--primary)' }}>Gerar link público</h2>
          <label className="block">
            <span className="field-label">Rótulo</span>
            <input className="form-input" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Ex: RC 300k interno" />
          </label>
          <label className="block">
            <span className="field-label">Produto</span>
            <select className="form-input" value={linkProductId} onChange={(e) => setLinkProductId(e.target.value)}>
              <option value="">Produto padrão RC</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Fluxo</span>
            <select className="form-input" value={linkFlowType} onChange={(e) => setLinkFlowType(e.target.value as 'external' | 'internal')}>
              <option value="external">Venda externa</option>
              <option value="internal">Venda interna</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Validade em dias</span>
            <input className="form-input" type="number" min={1} value={linkExpiresInDays} onChange={(e) => setLinkExpiresInDays(e.target.value)} />
          </label>

          <button disabled={saving} className="btn-primary px-6 py-3">
            {saving ? 'Gerando...' : 'Gerar link'}
          </button>

          {generatedLink && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="font-semibold text-emerald-900 mb-2">Link gerado</div>
              <a href={generatedLink} className="break-all text-emerald-700 underline" target="_blank" rel="noreferrer">
                {generatedLink}
              </a>
            </div>
          )}
        </form>

        <div className="card">
          <h2 className="text-lg font-black mb-4" style={{ color: 'var(--primary)' }}>Links existentes</h2>
          <div className="space-y-4">
            {links.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum link gerado ainda.</p>
            ) : (
              links.map((link) => (
                <div key={link.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="font-semibold text-gray-900">{link.label || 'Sem rótulo'}</div>
                  <div className="text-gray-500 text-xs mt-1">{link.flow_type} · {link.status}</div>
                  <div className="text-gray-500 text-xs mt-1">{link.product_name ? `${link.product_name} (${link.product_code})` : 'Produto padrão'}</div>
                  <div className="mt-2 text-xs break-all text-gray-600">/contratar/{link.token}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
