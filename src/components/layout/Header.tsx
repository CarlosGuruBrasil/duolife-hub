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
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // --vw-safe = largura real do conteúdo (sem scrollbar), pra alinhar seções full-bleed
  // com o container centralizado do header. 100vw inclui a scrollbar e desalinha ~7-15px.
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
            className="h-9 w-auto object-contain"
            priority
          />
        </Link>

        <nav className="site-nav" aria-label="Navegação principal">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link href="/portal" className="portal-link">
            Área do Parceiro
          </Link>
          <Link href="/seja-parceiro" className="btn-primary">
            Seja Parceiro <ChevronRight size={15} />
          </Link>
        </div>

        <button
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="mobile-menu-button"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {open ? (
        <div className="mobile-menu">
          <div className="mobile-menu-inner">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link href="/portal" onClick={() => setOpen(false)}>
              Área do Parceiro
            </Link>
            <Link href="/seja-parceiro" className="btn-primary" onClick={() => setOpen(false)}>
              Seja Parceiro <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
