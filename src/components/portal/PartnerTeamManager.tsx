'use client';

import { useState } from 'react';

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'manager' | 'broker' | 'partner';
  manager_user_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

interface Props {
  users: TeamUser[];
}

const ROLE_LABEL: Record<TeamUser['role'], string> = {
  director: 'Admin da empresa',
  manager: 'Gestor',
  broker: 'Corretor',
  partner: 'Parceiro',
};

export default function PartnerTeamManager({ users }: Props) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    email: '',
    password: '',
    role: 'broker' as 'manager' | 'broker' | 'partner',
    managerUserId: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const managers = users.filter((user) => user.is_active && (user.role === 'director' || user.role === 'manager'));

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm({
      id: '',
      name: '',
      email: '',
      password: '',
      role: 'broker',
      managerUserId: '',
    });
  }

  function editUser(user: TeamUser) {
    if (user.role === 'director') return;
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      managerUserId: user.manager_user_id || '',
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/parceiros/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          role: form.role,
          managerUserId: form.managerUserId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || 'Não foi possível salvar o colaborador.');
        setSaving(false);
        return;
      }

      setMessage('Colaborador salvo. Atualize a página para refletir a estrutura atual.');
      setSaving(false);
      resetForm();
    } catch {
      setMessage('Erro de conexão ao salvar colaborador.');
      setSaving(false);
    }
  }

  async function toggle(userId: string, isActive: boolean) {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/parceiros/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !isActive }),
      });
      const data = await response.json();
      setSaving(false);
      setMessage(response.ok ? 'Status atualizado. Atualize a página para refletir a mudança.' : (data.error || 'Não foi possível atualizar o status.'));
    } catch {
      setSaving(false);
      setMessage('Erro de conexão ao atualizar o status.');
    }
  }

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>Equipe da empresa</h2>
        <p className="mt-1 text-sm text-gray-500">
          Você administra apenas os colaboradores da sua própria empresa. Configurações sensíveis da plataforma continuam restritas ao time dev da DuoLife.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="field-label">Nome</span>
          <input className="form-input" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
        </label>
        <label className="block">
          <span className="field-label">E-mail</span>
          <input className="form-input" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
        </label>
        <label className="block">
          <span className="field-label">Senha {form.id ? '(opcional na edição)' : ''}</span>
          <input className="form-input" type="password" minLength={form.id ? 0 : 8} value={form.password} onChange={(e) => setField('password', e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Papel</span>
          <select className="form-input" value={form.role} onChange={(e) => setField('role', e.target.value)}>
            <option value="manager">Gestor</option>
            <option value="broker">Corretor</option>
            <option value="partner">Parceiro</option>
          </select>
        </label>
        <label className="block">
          <span className="field-label">Gestor responsável</span>
          <select className="form-input" value={form.managerUserId} onChange={(e) => setField('managerUserId', e.target.value)}>
            <option value="">Sem vínculo</option>
            {managers
              .filter((user) => user.id !== form.id)
              .map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name} • {ROLE_LABEL[manager.role]}
                </option>
              ))}
          </select>
        </label>
        <div className="flex items-end justify-end gap-3 md:col-span-3">
          {form.id ? (
            <button type="button" className="btn-outline px-6 py-3" onClick={resetForm}>
              Cancelar edição
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="btn-primary px-6 py-3">
            {saving ? 'Salvando...' : form.id ? 'Salvar colaborador' : 'Adicionar colaborador'}
          </button>
        </div>
      </form>

      {message ? <p className="text-sm text-gray-600">{message}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="w-full min-w-[820px] text-left text-sm">
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
            {users.map((user) => {
              const manager = users.find((item) => item.id === user.manager_user_id);
              return (
                <tr key={user.id} className="table-row">
                  <td className="px-5 py-4">
                    <div className="font-semibold" style={{ color: 'var(--primary)' }}>{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{ROLE_LABEL[user.role]}</td>
                  <td className="px-5 py-4 text-gray-600">{manager ? manager.name : '-'}</td>
                  <td className="px-5 py-4">
                    <span className="status-pill">{user.is_active ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{user.last_login_at ? new Date(user.last_login_at).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {user.role !== 'director' ? (
                        <>
                          <button type="button" className="btn-outline text-xs px-3 py-1.5 min-h-0" onClick={() => editUser(user)}>
                            Editar
                          </button>
                          <button type="button" className="btn-outline text-xs px-3 py-1.5 min-h-0" onClick={() => toggle(user.id, user.is_active)}>
                            {user.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-gray-400">Admin principal</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
