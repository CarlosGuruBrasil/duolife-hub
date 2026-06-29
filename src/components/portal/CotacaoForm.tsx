'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FormState {
  clientName: string;
  clientCpfCnpj: string;
  clientEmail: string;
  clientPhone: string;
  importanciaSegurada: string;
  occupation: string;
  notes: string;
}

const initialForm: FormState = {
  clientName: '',
  clientCpfCnpj: '',
  clientEmail: '',
  clientPhone: '',
  importanciaSegurada: '',
  occupation: '',
  notes: '',
};

export default function CotacaoForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/cotacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: form.clientName,
          clientCpfCnpj: form.clientCpfCnpj,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone,
          importanciaSegurada: form.importanciaSegurada || undefined,
          notes: form.notes,
          clientData: { occupation: form.occupation },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível criar a cotação.');
        return;
      }
      router.push('/portal/cotacoes');
      router.refresh();
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Nome do cliente</span>
          <input
            required
            value={form.clientName}
            onChange={(event) => updateField('clientName', event.target.value)}
            className="form-input"
            placeholder="Nome completo ou razão social"
          />
        </label>

        <label className="block">
          <span className="field-label">CPF/CNPJ</span>
          <input
            required
            value={form.clientCpfCnpj}
            onChange={(event) => updateField('clientCpfCnpj', event.target.value)}
            className="form-input"
            placeholder="Somente números ou formatado"
          />
        </label>

        <label className="block">
          <span className="field-label">E-mail</span>
          <input
            type="email"
            value={form.clientEmail}
            onChange={(event) => updateField('clientEmail', event.target.value)}
            className="form-input"
            placeholder="cliente@email.com"
          />
        </label>

        <label className="block">
          <span className="field-label">Telefone</span>
          <input
            value={form.clientPhone}
            onChange={(event) => updateField('clientPhone', event.target.value)}
            className="form-input"
            placeholder="(00) 00000-0000"
          />
        </label>

        <label className="block">
          <span className="field-label">Importância segurada</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.importanciaSegurada}
            onChange={(event) => updateField('importanciaSegurada', event.target.value)}
            className="form-input"
            placeholder="Ex: 100000"
          />
        </label>

        <label className="block">
          <span className="field-label">Profissão/atividade</span>
          <input
            value={form.occupation}
            onChange={(event) => updateField('occupation', event.target.value)}
            className="form-input"
            placeholder="Ex: médico, engenheiro, consultor"
          />
        </label>
      </div>

      <label className="block">
        <span className="field-label">Observações</span>
        <textarea
          value={form.notes}
          onChange={(event) => updateField('notes', event.target.value)}
          className="form-input min-h-28"
          placeholder="Detalhes relevantes para análise da DuoLife"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="submit" disabled={loading} className="btn-primary justify-center px-6 py-3">
          {loading ? 'Salvando...' : 'Salvar rascunho'}
        </button>
      </div>
    </form>
  );
}
