'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginClient() {
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
      if (!res.ok) {
        setError(data.error || 'Erro ao autenticar');
        return;
      }
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
    <div className="relative min-h-screen overflow-hidden bg-primary-dark px-4 py-10 text-white">
      <Image
        src="/duolife-partners-board.jpg"
        alt=""
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(0,212,224,0.18)_0%,transparent_34%),linear-gradient(135deg,rgba(7,42,51,0.84)_0%,rgba(7,42,51,0.9)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden flex-col justify-center lg:flex">
            <Link href="/" className="inline-flex w-fit flex-col items-start gap-4">
              <Image
                src="/logo-horizontal.png"
                alt="DuoLife Hub de Negócios"
                width={240}
                height={48}
                priority
                className="h-11 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </Link>
            <div className="mt-10 max-w-xl">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-accent backdrop-blur-md">
                Portal do Parceiro
              </span>
              <h1 className="mt-6 max-w-[11ch] text-5xl font-black uppercase leading-[0.98] tracking-[-0.04em] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
                Acesse sua operação com rapidez.
              </h1>
              <p className="mt-6 max-w-lg text-lg font-light leading-relaxed text-white/78">
                Entre para acompanhar cotações, vendas e comissões com o mesmo padrão de clareza e suporte que a DuoLife entrega aos parceiros.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-md rounded-[36px] border border-white/10 bg-white/96 p-8 text-primary shadow-[0_28px_90px_rgba(7,42,51,0.28)] backdrop-blur-xl md:p-10">
              <div className="mb-8 text-center lg:text-left">
                <Link href="/" className="inline-flex flex-col items-center gap-3 lg:hidden">
                  <Image
                    src="/logo-horizontal.png"
                    alt="DuoLife Hub de Negócios"
                    width={220}
                    height={44}
                    priority
                    className="h-10 w-auto object-contain"
                  />
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-secondary">Portal do Parceiro</span>
                </Link>
                <h2 className="mt-6 text-2xl font-black uppercase tracking-tight text-primary lg:mt-0">Entrar na sua conta</h2>
                <p className="mt-2 text-sm font-light text-[#4d686f]">
                  Use seu e-mail e senha para acessar o painel do parceiro.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-primary">E-mail</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-primary placeholder-secondary/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-[0.16em] text-primary">Senha</label>
                    <Link href="/login/esqueci-a-senha" className="text-xs font-semibold text-primary hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 pr-11 text-sm text-primary placeholder-secondary/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full p-1 text-secondary transition-colors hover:text-primary"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm font-medium text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-full bg-accent py-4 text-base font-black text-primary-dark shadow-lg shadow-accent/10 transition-colors hover:bg-[#00b2be] disabled:bg-secondary"
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="mt-6 border-t border-border pt-5 text-center">
                <Link href="/" className="text-sm font-semibold text-primary hover:underline">← Voltar ao site</Link>
              </div>

              <p className="mt-6 text-center text-sm text-[#4d686f]">
                Quer ser parceiro?{' '}
                <Link href="/seja-parceiro" className="font-semibold text-primary hover:underline">
                  Cadastre-se aqui
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
