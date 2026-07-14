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

interface Props {
  partner: PartnerRow;
  products: ProductRow[];
  links: LinkRow[];
  partnerUsers: PartnerUserRow[];
  canManageConfig: boolean;
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

const ROLE_LABEL: Record<PartnerUserRow['role'], string> = {
  director: 'Diretor',
  manager: 'Gestor',
  broker: 'Corretor',
  partner: 'Parceiro',
};

export default function PartnerWhiteLabelClient({ partner, products, links, partnerUsers, canManageConfig }: Props) {
  const [form, setForm] = useState(baseState(partner.whiteLabel));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkProductId, setLinkProductId] = useState(products.find((p) => p.is_active)?.id || '');
  const [linkFlowType, setLinkFlowType] = useState<'external' | 'internal'>('external');
  const [linkExpiresInDays, setLinkExpiresInDays] = useState('30');
  const [generatedLink, setGeneratedLink] = useState('');
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    email: '',
    password: '',
    role: 'broker' as PartnerUserRow['role'],
    managerUserId: '',
  });

  const availableManagers = partnerUsers.filter((user) => user.is_active && (user.role === 'director' || user.role === 'manager'));

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

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setUserField(field: keyof typeof userForm, value: string) {
    setUserForm((current) => ({ ...current, [field]: value }));
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
        label: linkLabel || undefined,
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

  async function savePartnerUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

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
    const data = await res.json();

    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || 'Falha ao salvar usuário.');
      return;
    }

    setMessage('Usuário salvo. Atualize a página para ver a hierarquia atualizada.');
    resetUserForm();
  }

  async function togglePartnerUser(userId: string, isActive: boolean) {
    setSaving(true);
    setMessage('');

    const res = await fetch(`/api/admin/parceiros/${partner.id}/usuarios`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        isActive: !isActive,
      }),
    });
    const data = await res.json();

    setSaving(false);
    setMessage(res.ok ? 'Status atualizado. Atualize a página para refletir a mudança.' : (data.error || 'Falha ao atualizar status.'));
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

      {canManageConfig ? (
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
      ) : (
        <div className="card mb-6">
          <h2 className="text-lg font-black" style={{ color: 'var(--primary)' }}>Configurações de plataforma</h2>
          <p className="mt-2 text-sm text-gray-500">
            White-label, links públicos e ajustes estruturais desta operação ficam restritos ao perfil dev interno da DuoLife.
          </p>
        </div>
      )}

      <div className="card mb-6 space-y-5">
        <div>
          <h2 className="text-lg font-black" style={{ color: 'var(--primary)' }}>Equipe e níveis de acesso</h2>
          <p className="mt-1 text-sm text-gray-500">
            Diretor vê toda a operação do parceiro. Gestor vê sua carteira e a dos corretores vinculados. Corretor e Parceiro veem apenas a própria produção.
          </p>
        </div>

        <form onSubmit={savePartnerUser} className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="field-label">Nome</span>
            <input className="form-input" value={userForm.name} onChange={(e) => setUserField('name', e.target.value)} required />
          </label>
          <label className="block">
            <span className="field-label">E-mail</span>
            <input className="form-input" type="email" value={userForm.email} onChange={(e) => setUserField('email', e.target.value)} required />
          </label>
          <label className="block">
            <span className="field-label">Senha {userForm.id ? '(opcional na edição)' : ''}</span>
            <input className="form-input" type="password" minLength={userForm.id ? 0 : 8} value={userForm.password} onChange={(e) => setUserField('password', e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Papel</span>
            <select className="form-input" value={userForm.role} onChange={(e) => setUserField('role', e.target.value)}>
              <option value="director">Diretor</option>
              <option value="manager">Gestor</option>
              <option value="broker">Corretor</option>
              <option value="partner">Parceiro</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Gestor responsável</span>
            <select className="form-input" value={userForm.managerUserId} onChange={(e) => setUserField('managerUserId', e.target.value)} disabled={userForm.role === 'director'}>
              <option value="">Sem vínculo</option>
              {availableManagers
                .filter((user) => user.id !== userForm.id)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} • {ROLE_LABEL[manager.role]}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex items-end justify-end gap-3 md:col-span-3">
            {userForm.id ? (
              <button type="button" className="btn-outline px-6 py-3" onClick={resetUserForm}>
                Cancelar edição
              </button>
            ) : null}
            <button disabled={saving} className="btn-primary px-6 py-3">
              {saving ? 'Salvando...' : userForm.id ? 'Salvar usuário' : 'Criar usuário'}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">Papel</th>
                <th className="px-5 py-3 font-semibold">Gestor</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Último acesso</th>
                <th className="px-5 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partnerUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                    Nenhum usuário cadastrado para este parceiro.
                  </td>
                </tr>
              ) : partnerUsers.map((teamUser) => {
                const manager = partnerUsers.find((item) => item.id === teamUser.manager_user_id);
                return (
                  <tr key={teamUser.id} className="table-row">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900">{teamUser.name}</div>
                      <div className="text-xs text-gray-500">{teamUser.email}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{ROLE_LABEL[teamUser.role]}</td>
                    <td className="px-5 py-4 text-gray-600">{manager ? manager.name : '-'}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">{teamUser.is_active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {teamUser.last_login_at ? new Date(teamUser.last_login_at).toLocaleString('pt-BR') : 'Nunca acessou'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-outline text-xs px-3 py-1.5 min-h-0" onClick={() => startEditUser(teamUser)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-xs px-3 py-1.5 min-h-0"
                          onClick={() => togglePartnerUser(teamUser.id, teamUser.is_active)}
                        >
                          {teamUser.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canManageConfig ? (
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
      ) : null}
    </div>
  );
}
