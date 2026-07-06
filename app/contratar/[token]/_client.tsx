'use client';

import { useEffect, useState } from 'react';

type WhiteLabel = {
  companyName: string;
  companySlogan: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  publicTitle: string;
  publicDescription: string;
};

type ContractLink = {
  token: string;
  label: string | null;
  partner: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    email: string;
    phone: string | null;
    whiteLabel: WhiteLabel;
  };
  product: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
};

interface Props {
  token: string;
}

export default function ContractPageClient({ token }: Props) {
  const [link, setLink] = useState<ContractLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    clientName: '',
    clientCpfCnpj: '',
    clientEmail: '',
    clientPhone: '',
    importanciaSegurada: '',
    notes: '',
  });

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/public/contratacao/${token}`);
      const data = await res.json();
      setLink(data.link || null);
      setLoading(false);
    })();
  }, [token]);

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const res = await fetch(`/api/public/contratacao/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        importanciaSegurada: form.importanciaSegurada ? Number(form.importanciaSegurada) : undefined,
      }),
    });
    const data = await res.json();

    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || 'Não foi possível concluir a contratação.');
      return;
    }

    setMessage('Contratação recebida. O número da cotação foi gerado com sucesso.');
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Carregando contratação...</div>;
  }

  if (!link) {
    return <div className="p-8 text-center text-red-600">Link inválido ou expirado.</div>;
  }

  const wl = link.partner.whiteLabel;
  const primary = wl.primaryColor || '#0e4a5a';
  const accent = wl.accentColor || '#00d4e0';

  return (
    <div style={{ ['--primary' as string]: primary, ['--accent' as string]: accent }} className="min-h-screen bg-[#f5f7f7]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            {wl.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wl.logoUrl} alt={wl.companyName || link.partner.razaoSocial} className="h-14 w-auto object-contain" />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-[var(--primary)]" />
            )}
            <div>
              <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>
                {wl.publicTitle || wl.companyName || link.partner.razaoSocial}
              </h1>
              <p className="text-sm text-gray-600">{wl.publicDescription || wl.companySlogan || link.partner.whiteLabel.companySlogan}</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-3xl bg-white p-8 shadow-sm border border-gray-100">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome do cliente</span>
              <input className="form-input" value={form.clientName} onChange={(e) => setField('clientName', e.target.value)} required />
            </label>
            <label className="block">
              <span className="field-label">CPF/CNPJ</span>
              <input className="form-input" value={form.clientCpfCnpj} onChange={(e) => setField('clientCpfCnpj', e.target.value)} required />
            </label>
            <label className="block">
              <span className="field-label">E-mail</span>
              <input className="form-input" type="email" value={form.clientEmail} onChange={(e) => setField('clientEmail', e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Telefone</span>
              <input className="form-input" value={form.clientPhone} onChange={(e) => setField('clientPhone', e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Importância segurada</span>
              <input className="form-input" inputMode="decimal" value={form.importanciaSegurada} onChange={(e) => setField('importanciaSegurada', e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Produto</span>
              <input className="form-input" value={link.product ? `${link.product.name} (${link.product.code})` : 'RC padrão'} disabled />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Observações</span>
            <textarea className="form-input min-h-28" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </label>

          {message && <p className="text-sm text-gray-700">{message}</p>}

          <button disabled={saving} className="btn-primary px-6 py-3">
            {saving ? 'Processando...' : 'Concluir contratação'}
          </button>
        </form>
      </div>
    </div>
  );
}
