'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, User, KeyRound, ShieldCheck, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/format';

interface PerfilClientProps {
  initialUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt?: string;
  };
}

export default function PerfilClient({ initialUser }: PerfilClientProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initialUser.name,
    email: initialUser.email,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    if (form.newPassword) {
      if (!form.currentPassword) {
        setErrorMsg('Informe sua senha atual para alterar a senha.');
        return;
      }
      if (form.newPassword.length < 6) {
        setErrorMsg('A nova senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        setErrorMsg('A confirmação da senha não coincide com a nova senha.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.newPassword
            ? {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
              }
            : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao atualizar o perfil');
      } else {
        setSuccessMsg(data.message || 'Dados atualizados com sucesso!');
        setForm((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));
        router.refresh();
      }
    } catch {
      setErrorMsg('Erro de conexão ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeLabel = (role: string) => {
    switch (role) {
      case 'duolife_dev':
        return 'Desenvolvedor';
      case 'duolife_admin':
        return 'Administrador DuoLife';
      case 'duolife_staff':
        return 'Operação DuoLife';
      case 'partner_director':
        return 'Diretor Parceiro';
      case 'partner_manager':
        return 'Gerente Comercial';
      case 'partner_broker':
        return 'Corretor / Consultor';
      default:
        return role;
    }
  };

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          <AlertCircle size={18} className="shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Card 1: Dados Pessoais e Cadastrais */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2 font-bold text-gray-900" style={{ color: 'var(--primary)' }}>
            <User size={18} /> Dados Pessoais e Cadastrais
          </div>
          <p className="mb-4 text-xs text-gray-500">Atualize seu nome de exibição e e-mail de acesso na plataforma.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome Completo</span>
              <input
                type="text"
                required
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="field-label">E-mail de Acesso</span>
              <input
                type="email"
                required
                className="form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
        </div>

        {/* Card 2: Seguranca / Alterar Senha */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2 font-bold text-gray-900" style={{ color: 'var(--primary)' }}>
            <KeyRound size={18} /> Segurança / Alterar Senha
          </div>
          <p className="mb-4 text-xs text-gray-500">Preencha os campos abaixo apenas se desejar alterar sua senha de acesso.</p>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="field-label">Senha Atual</span>
              <input
                type="password"
                placeholder="••••••••"
                className="form-input"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="field-label">Nova Senha</span>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                className="form-input"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="field-label">Confirmar Nova Senha</span>
              <input
                type="password"
                placeholder="Repita a nova senha"
                className="form-input"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
            </label>
          </div>
        </div>

        {/* Card 3: Informacoes do Acesso */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2 font-bold text-gray-900" style={{ color: 'var(--primary)' }}>
            <ShieldCheck size={18} /> Permissões e Nível de Acesso
          </div>

          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <span className="block text-xs font-semibold text-gray-500">Perfil de Acesso</span>
              <span className="mt-1 inline-block font-bold text-gray-900">{getRoleBadgeLabel(initialUser.role)}</span>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <span className="block text-xs font-semibold text-gray-500">Status do Cadastro</span>
              <span className="mt-1 inline-flex items-center gap-1.5 font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Ativo
              </span>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <span className="block text-xs font-semibold text-gray-500">Membro Desde</span>
              <span className="mt-1 inline-block font-medium text-gray-700">
                {initialUser.createdAt
                  ? formatDate(initialUser.createdAt)
                  : 'Registrado'}
              </span>
            </div>
          </div>
        </div>

        {/* Acoes */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary px-8 py-3"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin inline-block" />}
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
