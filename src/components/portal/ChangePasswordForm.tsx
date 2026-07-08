'use client';

import { useState } from 'react';

export default function ChangePasswordForm() {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    if (form.newPassword !== form.confirmPassword) {
      setStatus('error');
      setMessage('A nova senha e a confirmação não coincidem.');
      return;
    }

    if (form.newPassword.length < 6) {
      setStatus('error');
      setMessage('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      const res = await fetch('/api/parceiros/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Não foi possível alterar a senha.');
        return;
      }

      setStatus('saved');
      setMessage('Senha alterada com sucesso.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); // Limpa o formulário
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--primary-dark)' }}>Segurança</h2>
        <p className="text-sm text-gray-500">Altere sua senha de acesso ao portal.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="block">
          <span className="field-label">Senha atual</span>
          <input
            required
            type="password"
            value={form.currentPassword}
            onChange={(event) => updateField('currentPassword', event.target.value)}
            className="form-input"
            placeholder="••••••••"
          />
        </label>

        <label className="block">
          <span className="field-label">Nova senha</span>
          <input
            required
            type="password"
            value={form.newPassword}
            onChange={(event) => updateField('newPassword', event.target.value)}
            className="form-input"
            placeholder="••••••••"
            minLength={6}
          />
        </label>

        <label className="block">
          <span className="field-label">Confirmar nova senha</span>
          <input
            required
            type="password"
            value={form.confirmPassword}
            onChange={(event) => updateField('confirmPassword', event.target.value)}
            className="form-input"
            placeholder="••••••••"
            minLength={6}
          />
        </label>
      </div>

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {message}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={status === 'saving'} className="btn-primary justify-center px-6 py-3">
          {status === 'saving' ? 'Alterando...' : 'Alterar senha'}
        </button>
      </div>
    </form>
  );
}
