'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  FileText,
  LogOut,
  UserRound,
  Users,
  WalletCards,
  ChevronDown,
  Sparkles,
  Menu,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth';

interface PortalShellProps {
  children: React.ReactNode;
  user?: AuthUser | null;
}

const nav = [
  { href: '/portal', label: 'Dashboard', icon: BarChart3 },
  { href: '/portal/cotacoes', label: 'Cotações', icon: ClipboardList },
  { href: '/portal/clientes', label: 'Clientes', icon: Users },
  { href: '/portal/vendas', label: 'Vendas', icon: FileText },
  { href: '/portal/comissoes', label: 'Comissões', icon: WalletCards },
  { href: '/portal/perfil', label: 'Perfil', icon: UserRound },
];

export default function PortalShell({ children, user }: PortalShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'P';

  return (
    <div className="min-h-screen flex bg-[#f7faf9]">
      {open && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col shadow-lg transition-all duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-20' : 'w-64'}`}
        style={{ background: 'var(--primary)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {!collapsed && (
            <div>
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo-horizontal.png"
                  alt="DuoLife Hub de Negócios"
                  width={140}
                  height={28}
                  className="h-6 w-auto object-contain"
                  style={{ filter: 'brightness(0) invert(1)' }}
                  priority
                />
              </Link>
              <div className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#00d4e0]">
                Portal do Parceiro
              </div>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d4e0]/20 text-[#00d4e0] font-black text-xs">
              DL
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.href || (n.href !== '/portal' && pathname.startsWith(`${n.href}/`));
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-white/15 text-white shadow-sm font-bold border border-white/20'
                    : 'text-[#a8c8cc] hover:bg-white/10 hover:text-white'
                }`}
                title={n.label}
              >
                <Icon size={18} className={active ? 'text-[#00d4e0]' : ''} />
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold transition-colors text-red-300 hover:bg-white/10 hover:text-red-200"
            >
              <LogOut size={16} />
              {!collapsed && <span>Sair da conta</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* Main Container + Apple HIG Top Navigation Bar */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Top Header Bar (Apple HIG Standard) */}
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#e0eceb] bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="lg:hidden flex items-center justify-center p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
            >
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 text-xs font-semibold text-gray-500 sm:flex">
              <span className="flex items-center gap-1.5 text-[#0e4a5a] font-bold">
                <Sparkles className="h-3.5 w-3.5 text-[#00d4e0]" /> Portal DuoLife
              </span>
              <span>/</span>
              <span className="capitalize text-gray-700">
                {pathname === '/portal' ? 'Dashboard' : pathname.replace('/portal/', '').replace('-', ' ')}
              </span>
            </div>
          </div>

          {/* User Profile Widget - Top Right (Apple HIG standard) */}
          <div className="relative" ref={dropdownRef}>
            {user ? (
              <button
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-3 rounded-full border border-gray-200 bg-gray-50/80 py-1 pl-1.5 pr-3 transition-all hover:bg-gray-100 hover:border-gray-300 focus:outline-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e4a5a] text-xs font-extrabold text-[#00d4e0] shadow-sm">
                  {initials}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-bold leading-tight text-gray-900">{user.name}</div>
                  <div className="text-[10px] font-medium leading-none text-gray-500">Parceiro DuoLife</div>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <Link href="/login" className="btn-primary text-xs px-4 py-2">
                Entrar
              </Link>
            )}

            {/* Profile Dropdown Menu */}
            {profileDropdownOpen && user && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 z-50">
                <div className="border-b border-gray-100 p-3">
                  <p className="text-xs font-bold text-gray-900 truncate">{user.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-[#0e4a5a] border border-cyan-200">
                    Parceiro DuoLife
                  </span>
                </div>

                <div className="py-1">
                  <Link
                    href="/portal/perfil"
                    onClick={() => setProfileDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    <UserRound className="h-4 w-4 text-[#00d4e0]" />
                    <span>Meu Perfil</span>
                  </Link>
                  <Link
                    href="/portal/cotacoes/nova"
                    onClick={() => setProfileDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    <ClipboardList className="h-4 w-4 text-gray-400" />
                    <span>Nova Operação</span>
                  </Link>
                </div>

                <div className="border-t border-gray-100 pt-1">
                  <form action="/api/auth/logout" method="POST">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                      <span>Sair da conta</span>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
