'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronRight } from 'lucide-react';

const nav = [
  { label: 'Quem Somos', href: '/quem-somos' },
  { label: 'Soluções', href: '/solucoes' },
  { label: 'Unidades', href: '/unidades' },
  { label: 'Contato', href: '/contato' },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
        boxShadow: scrolled ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
      }}>
      <div className="max-w-7xl mx-auto px-6 h-[64px] flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/logo-horizontal.png"
            alt="DuoLife Hub de Negócios"
            width={160}
            height={42}
            className="h-9 w-auto object-contain"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className="text-sm font-medium transition-colors duration-150"
              style={{ color: 'var(--text-secondary)' }}
              onMouseOver={e => (e.currentTarget.style.color = 'var(--primary)')}
              onMouseOut={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
              {n.label}
            </Link>
          ))}
        </nav>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/portal"
            className="text-sm font-medium transition-colors duration-150"
            style={{ color: 'var(--text-secondary)' }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--primary)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
            Área do Parceiro
          </Link>
          <Link href="/seja-parceiro" className="btn-accent text-sm px-5 py-2.5">
            Seja Parceiro <ChevronRight size={13} />
          </Link>
        </div>

        {/* Mobile */}
        <button onClick={() => setOpen(!open)}
          className="md:hidden w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: open ? 'var(--bg-gray)' : 'transparent', color: 'var(--text)' }}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)' }}>
          <div className="px-6 py-5 flex flex-col gap-4 max-w-7xl mx-auto">
            {nav.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className="text-base font-medium py-1" style={{ color: 'var(--text)' }}>
                {n.label}
              </Link>
            ))}
            <hr style={{ borderColor: 'var(--border)' }} />
            <Link href="/portal" onClick={() => setOpen(false)}
              className="text-base font-medium" style={{ color: 'var(--primary)' }}>
              Área do Parceiro
            </Link>
            <Link href="/seja-parceiro" onClick={() => setOpen(false)}
              className="btn-accent justify-center text-sm">
              Seja Parceiro <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
