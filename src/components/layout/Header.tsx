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

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}${transparent ? ' header-transparent' : ''}`}>
      <div className="site-header-inner">
        <Link href="/" className="flex items-center shrink-0" aria-label="DuoLife Hub de Negócios">
          <Image
            src="/logo-horizontal.png"
            alt="DuoLife Hub de Negócios"
            width={170}
            height={45}
            className="h-8 w-auto object-contain transition-all"
            priority
          />
        </Link>

        <nav className="site-nav hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider" aria-label="Navegação principal">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions hidden md:flex items-center gap-3">
          <Link href="/portal" className="portal-link font-bold text-xs">
            Área do Parceiro
          </Link>
          <Link href="/seja-parceiro" className="inline-flex items-center gap-1.5 rounded-xl bg-[#00d4e0] px-4 py-2 text-xs font-extrabold text-[#072a33] shadow-sm transition-all hover:bg-[#00b2be] hover:scale-[1.02]">
            Seja Parceiro <ChevronRight size={14} />
          </Link>
        </div>

        <button
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="mobile-menu-button md:hidden"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {open ? (
        <div className="mobile-menu md:hidden">
          <div className="mobile-menu-inner p-6 flex flex-col gap-4 text-sm font-bold text-gray-800">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <hr className="border-gray-100 my-1" />
            <Link href="/portal" onClick={() => setOpen(false)}>
              Área do Parceiro
            </Link>
            <Link
              href="/seja-parceiro"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4e0] py-3 text-sm font-extrabold text-[#072a33]"
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
