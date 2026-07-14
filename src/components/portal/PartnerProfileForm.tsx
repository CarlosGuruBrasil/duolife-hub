'use client';

import { useState } from 'react';

interface PartnerProfileFormProps {
  partner: {
    nome_fantasia: string | null;
    email: string;
    phone: string | null;
    address: {
      city?: string;
      state?: string;
      street?: string;
    } | null;
  };
  canEdit: boolean;
}

interface FormState {
  nomeFantasia: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  street: string;
}

export default function PartnerProfileForm({ partner, canEdit }: PartnerProfileFormProps) {
  const [form, setForm] = useState<FormState>({
    nomeFantasia: partner.nome_fantasia || '',
    email: partner.email,
    phone: partner.phone || '',
    city: partner.address?.city || '',
    state: partner.address?.state || '',
    street: partner.address?.street || '',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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
        setMessage(data.error || 'Não foi possível salvar o perfil.');
        return;
      }

      setStatus('saved');
      setMessage('Perfil atualizado com sucesso.');
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Nome fantasia</span>
          <input
            required
            value={form.nomeFantasia}
            onChange={(event) => updateField('nomeFantasia', event.target.value)}
            className="form-input"
            disabled={!canEdit}
          />
        </label>

        <label className="block">
          <span className="field-label">E-mail financeiro/operacional</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            className="form-input"
            disabled={!canEdit}
          />
        </label>

        <label className="block">
          <span className="field-label">Telefone</span>
          <input
            value={form.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            className="form-input"
            disabled={!canEdit}
          />
        </label>

        <label className="block">
          <span className="field-label">Cidade</span>
          <input
            value={form.city}
            onChange={(event) => updateField('city', event.target.value)}
            className="form-input"
            disabled={!canEdit}
          />
        </label>

        <label className="block">
          <span className="field-label">UF</span>
          <input
            maxLength={2}
            value={form.state}
            onChange={(event) => updateField('state', event.target.value.toUpperCase())}
            className="form-input uppercase"
            disabled={!canEdit}
          />
        </label>

        <label className="block">
          <span className="field-label">Endereço</span>
          <input
            value={form.street}
            onChange={(event) => updateField('street', event.target.value)}
            className="form-input"
            disabled={!canEdit}
          />
        </label>
      </div>

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {message}
        </p>
      )}

      {!canEdit ? (
        <p className="text-sm text-amber-700">
          Apenas o admin da empresa pode alterar os dados cadastrais da corretora.
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={status === 'saving' || !canEdit} className="btn-primary justify-center px-6 py-3">
          {status === 'saving' ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>
    </form>
  );
}
