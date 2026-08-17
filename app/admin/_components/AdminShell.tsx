'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Package,
  Shield,
  User,
  Users,
  WalletCards,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth';

interface AdminShellProps {
  children: React.ReactNode;
  user?: AuthUser | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Operação',
    items: [
      { href: '/admin', label: 'Visão geral', icon: BarChart3, description: 'Mês, funil e carteira.' },
      { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3, description: 'Financeiro e indicadores.' },
      { href: '/admin/cotacoes', label: 'Cotações', icon: Briefcase, description: 'Propostas e cobrança.' },
      { href: '/admin/vendas', label: 'Vendas', icon: Shield, description: 'Apólices e prêmio total.' },
      { href: '/admin/comissoes', label: 'Comissões', icon: WalletCards, description: 'Pendências e extrato.' },
      { href: '/admin/produtos', label: 'Produtos', icon: Package, description: 'Catálogo e fluxos.' },
    ],
  },
  {
    title: 'Rede',
    items: [
      { href: '/admin/parceiros', label: 'Parceiros', icon: Building2, description: 'Corretoras e estrutura.' },
      { href: '/admin/clientes', label: 'Clientes', icon: Users, description: 'Carteira de segurados.' },
      { href: '/admin/usuarios', label: 'Usuários', icon: Shield, description: 'Acessos internos.' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getRoleLabel(role?: string) {
  switch (role) {
    case 'duolife_admin':
      return 'Administrador';
    case 'duolife_staff':
      return 'Operação';
    case 'partner_director':
      return 'Diretor Parceiro';
    default:
      return 'DuoLife User';
  }
}

export default function AdminShell({ children, user }: AdminShellProps) {
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
    : 'DL';

  const currentPathLabel = pathname === '/admin' 
    ? 'Visão geral' 
    : pathname.replace('/admin/', '').replace('-', ' ');

  return (
    <div className="min-h-screen bg-[#f7faf9]">
      {/* 1. Full-Width Top Header Bar (100% Tela Cheia no topo com Logo DuoLife Oficial) */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-between border-b border-gray-200/80 bg-white/90 px-6 backdrop-blur-md shadow-xs">
        {/* Left Side: Logo + Sidebar Toggle + Breadcrumb */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            aria-label="Abrir menu mobile"
            className="flex items-center justify-center p-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 lg:hidden"
            onClick={() => setOpen((prev) => !prev)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="flex items-center shrink-0" aria-label="DuoLife Hub de Negócios">
            <Image
              src="/logo-horizontal.png"
              alt="DuoLife Hub de Negócios"
              width={160}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>

          <button
            type="button"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          <div className="hidden items-center gap-2.5 text-xs font-semibold text-gray-400 sm:flex pl-2 border-l border-gray-200">
            <span className="flex items-center gap-1.5 text-[#0e4a5a] font-bold">
              <Sparkles className="h-3.5 w-3.5 text-[#00d4e0]" /> Painel Administrativo
            </span>
            <span>/</span>
            <span className="capitalize font-bold text-gray-800">{currentPathLabel}</span>
          </div>
        </div>

        {/* Right Side: User Profile Widget - Top Right (Apple HIG standard) */}
        <div className="relative" ref={dropdownRef}>
          {user ? (
            <button
              type="button"
              onClick={() => setProfileDropdownOpen((prev) => !prev)}
              className="flex items-center gap-3 rounded-full border border-gray-200 bg-gray-50/90 py-1 pl-1.5 pr-3 transition-all hover:bg-gray-100 hover:border-gray-300 focus:outline-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e4a5a] text-xs font-extrabold text-[#00d4e0] shadow-sm">
                {initials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-bold leading-tight text-gray-900">{user.name}</div>
                <div className="text-[10px] font-medium leading-none text-gray-500">{getRoleLabel(user.role)}</div>
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
                  {getRoleLabel(user.role)}
                </span>
              </div>

              <div className="py-1">
                <Link
                  href="/admin/perfil"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <User className="h-4 w-4 text-[#00d4e0]" />
                  <span>Meu Perfil</span>
                </Link>
                <Link
                  href="/admin/usuarios"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <Settings className="h-4 w-4 text-gray-400" />
                  <span>Gerenciar Usuários</span>
                </Link>
              </div>

              <div className="border-t border-gray-100 pt-1">
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span>Sair da operação</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Backdrop para mobile */}
      {open && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}

      {/* 2. Sidebar de Navegação (Posicionada abaixo do cabeçalho de tela cheia) */}
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 flex flex-col shadow-xl transition-all duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-20' : 'w-64'}`}
        style={{ background: 'var(--primary)' }}
      >
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] font-black uppercase tracking-wider text-[#00d4e0]">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all ${
                      active
                        ? 'bg-white/15 text-white font-bold border border-white/20 shadow-xs'
                        : 'text-[#a8c8cc] hover:bg-white/10 hover:text-white font-semibold'
                    }`}
                    title={item.label}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#00d4e0]' : ''}`} />
                    {!collapsed && (
                      <div className="min-w-0">
                        <div className="leading-tight truncate">{item.label}</div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold transition-colors text-red-300 hover:bg-white/10 hover:text-red-200"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sair da operação</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* 3. Conteúdo Principal */}
      <div className={`pt-16 transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
