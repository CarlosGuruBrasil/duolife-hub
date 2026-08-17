'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const nav = [
  { label: 'Quem Somos', href: '/quem-somos' },
  { label: 'Soluções', href: '/solucoes' },
  { label: 'Unidades', href: '/unidades' },
  { label: 'Contato', href: '/contato' },
];

interface HeaderProps {
  transparent?: boolean;
}

export default function Header({ transparent = false }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const setVw = () => document.documentElement.style.setProperty('--vw-safe', `${document.documentElement.clientWidth}px`);
    setVw();
    window.addEventListener('resize', setVw);
    return () => window.removeEventListener('resize', setVw);
  }, []);

  const isTransparentTheme = transparent && !scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isTransparentTheme
          ? 'bg-gradient-to-b from-slate-900/80 to-slate-900/40 border-b border-white/10 backdrop-blur-md'
          : 'bg-white/90 border-b border-gray-200/80 backdrop-blur-md shadow-xs'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center shrink-0" aria-label="DuoLife Hub de Negócios">
          <Image
            src="/logo-horizontal.png"
            alt="DuoLife Hub de Negócios"
            width={170}
            height={45}
            className={`h-8 w-auto object-contain transition-all ${isTransparentTheme ? 'brightness-0 invert' : ''}`}
            priority
          />
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider" aria-label="Navegação principal">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors ${
                isTransparentTheme
                  ? 'text-white/90 hover:text-[#00d4e0]'
                  : 'text-gray-700 hover:text-[#0e4a5a]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Header Action Buttons (Apple HIG Standard) */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/portal"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              isTransparentTheme
                ? 'text-white hover:bg-white/10'
                : 'text-[#0e4a5a] hover:bg-gray-100'
            }`}
          >
            Área do Parceiro
          </Link>
          <Link
            href="/seja-parceiro"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#00d4e0] px-4 py-2 text-xs font-extrabold text-[#072a33] shadow-sm transition-all hover:bg-[#00b2be] hover:scale-[1.02] active:scale-[0.98]"
          >
            Seja Parceiro <ChevronRight size={14} />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className={`md:hidden flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
            isTransparentTheme
              ? 'border-white/20 text-white hover:bg-white/10'
              : 'border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open ? (
        <div className="md:hidden border-b border-gray-200 bg-white/98 p-6 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col gap-4 text-sm font-bold text-gray-800">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-1.5 hover:text-[#0e4a5a]">
                {item.label}
              </Link>
            ))}
            <hr className="border-gray-100 my-1" />
            <Link href="/portal" onClick={() => setOpen(false)} className="py-1.5 text-[#0e4a5a]">
              Área do Parceiro
            </Link>
            <Link
              href="/seja-parceiro"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4e0] py-3 text-sm font-extrabold text-[#072a33] shadow-sm"
              onClick={() => setOpen(false)}
            >
              Seja Parceiro <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
