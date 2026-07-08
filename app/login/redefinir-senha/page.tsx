'use client';
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-500 mb-4">Token de recuperação não encontrado ou inválido.</p>
        <Link href="/login/esqueci-a-senha" className="btn-primary inline-flex justify-center">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (form.newPassword !== form.confirmPassword) {
      setStatus('error');
      setMessage('As senhas não coincidem.');
      return;
    }

    if (form.newPassword.length < 6) {
      setStatus('error');
      setMessage('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: form.newPassword }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Erro ao redefinir a senha');
        return;
      }
      
      setStatus('success');
      setMessage('Senha alterada com sucesso! Redirecionando para o login...');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mb-4">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-emerald-700 font-medium mb-6">{message}</p>
        <Link href="/login" className="btn-primary inline-flex justify-center px-8">
          Ir para Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="field-label">Nova Senha</label>
        <input 
          required 
          type="password" 
          value={form.newPassword}
          onChange={e => setForm({...form, newPassword: e.target.value})}
          className="form-input"
          placeholder="••••••••" 
          minLength={6}
        />
      </div>
      <div>
        <label className="field-label">Confirmar Nova Senha</label>
        <input 
          required 
          type="password" 
          value={form.confirmPassword}
          onChange={e => setForm({...form, confirmPassword: e.target.value})}
          className="form-input"
          placeholder="••••••••" 
          minLength={6}
        />
      </div>

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </p>
      )}

      <button type="submit" disabled={status === 'loading'} className="btn-primary w-full justify-center py-4 text-base mt-2">
        {status === 'loading' ? 'Redefinindo...' : 'Salvar Nova Senha'}
      </button>
    </form>
  );
}

export default function RedefinirSenha() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-2">
            <div className="brand-plate">
              <Image
                src="/logo-horizontal.png"
                alt="DuoLife Hub de Negócios"
                width={220}
                height={44}
                priority
                className="h-10 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>
          </Link>
          <p className="mt-4 text-sm" style={{ color: '#d7e6e8' }}>Recuperação de Acesso</p>
        </div>

        <div className="card no-hover">
          <h1 className="text-xl font-black mb-2" style={{ color: 'var(--primary)' }}>Criar Nova Senha</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Digite a sua nova senha abaixo para redefinir o acesso à sua conta.
          </p>

          <Suspense fallback={<div className="text-center text-sm text-gray-500 py-4">Carregando...</div>}>
            <RedefinirSenhaForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
