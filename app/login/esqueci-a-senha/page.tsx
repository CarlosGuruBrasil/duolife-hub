'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function EsqueciASenha() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Erro ao solicitar recuperação');
        return;
      }
      
      setStatus('success');
      setMessage('Instruções enviadas! Verifique sua caixa de entrada.');
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  }

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
          <h1 className="text-xl font-black mb-2" style={{ color: 'var(--primary)' }}>Esqueceu sua senha?</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Digite o e-mail cadastrado e enviaremos um link para você redefinir sua senha.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">E-mail</label>
              <input 
                required 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="seu@email.com" 
              />
            </div>

            {message && (
              <p className={`text-sm ${status === 'error' ? 'text-red-500' : 'text-emerald-600 font-medium'}`}>
                {message}
              </p>
            )}

            <button type="submit" disabled={status === 'loading'} className="btn-primary w-full justify-center py-4 text-base mt-2">
              {status === 'loading' ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
          
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link href="/login" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
              ← Voltar para o Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
