'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao autenticar'); return; }
      if (data.user?.role?.startsWith('duolife_')) {
        router.push('/admin');
      } else {
        router.push('/portal');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
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
          <p className="mt-4 text-sm" style={{ color: '#d7e6e8' }}>Portal do Parceiro</p>
        </div>

        <div className="card no-hover">
          <h1 className="text-xl font-black mb-6" style={{ color: 'var(--primary)' }}>Entrar na sua conta</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">E-mail</label>
              <input required type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="form-input"
                placeholder="seu@email.com" autoComplete="email" />
            </div>
            <div>
              <label className="field-label">Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-light)', padding: '2px', display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-4 text-base">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link href="/" className="text-sm" style={{ color: 'var(--primary)' }}>← Voltar ao site</Link>
          </div>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--secondary)' }}>
          Quer ser parceiro?{' '}
          <Link href="/seja-parceiro" className="text-white font-semibold hover:underline">
            Cadastre-se aqui
          </Link>
        </p>
      </div>
    </div>
  );
}
