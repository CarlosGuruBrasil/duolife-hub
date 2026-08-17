'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
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
      { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3, description: 'Financeiro e indicadores detalhados.' },
      { href: '/admin/cotacoes', label: 'Cotações', icon: Briefcase, description: 'Propostas, assinatura e cobrança.' },
      { href: '/admin/vendas', label: 'Vendas', icon: Shield, description: 'Apólices emitidas e prêmio total.' },
      { href: '/admin/comissoes', label: 'Comissões', icon: WalletCards, description: 'Pendências, pagamentos e extrato.' },
      { href: '/admin/produtos', label: 'Produtos', icon: Package, description: 'Catálogo, fluxos e disponibilidade.' },
    ],
  },
  {
    title: 'Rede',
    items: [
      { href: '/admin/parceiros', label: 'Parceiros', icon: Building2, description: 'Corretoras, status e estrutura.' },
      { href: '/admin/clientes', label: 'Clientes', icon: Users, description: 'Carteira consolidada de segurados.' },
      { href: '/admin/usuarios', label: 'Usuários', icon: Shield, description: 'Acessos internos da operação.' },
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

  // Fechar dropdown ao clicar fora
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

  return (
    <div className="admin-shell min-h-screen bg-[#f7faf9]">
      {open && (
        <button
          aria-label="Fechar menu"
          className="admin-shell-backdrop lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}

      {/* Sidebar de Navegação */}
      <aside className={`admin-sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="admin-brand-row">
          <div>
            <div className="admin-brand-mark">DuoLife Hub</div>
            <p className="admin-brand-copy">Operação, produção e rede comercial em um só painel.</p>
          </div>
          <button
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-pressed={collapsed}
            className="admin-sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            type="button"
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        <nav className="admin-nav">
          {navSections.map((section) => (
            <div key={section.title} className="admin-nav-section">
              <div className="admin-nav-title">{section.title}</div>
              <div className="admin-nav-list">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`admin-nav-item ${active ? 'is-active' : ''}`}
                      onClick={() => setOpen(false)}
                    >
                      <div className="admin-nav-icon">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="admin-nav-label">{item.label}</div>
                        <div className="admin-nav-description">{item.description}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="admin-logout-button w-full">
              <LogOut className="h-4 w-4" />
              <span>Sair da operação</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Conteudo Principal + Top Navigation Bar (Apple HIG Standard) */}
      <div className={`admin-main ${collapsed ? 'is-sidebar-collapsed' : ''}`}>
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#e0eceb] bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menu"
              className="admin-mobile-menu-button lg:hidden"
              onClick={() => setOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-2 text-xs font-semibold text-gray-500 sm:flex">
              <span className="flex items-center gap-1.5 text-[#0e4a5a] font-bold">
                <Sparkles className="h-3.5 w-3.5 text-[#00d4e0]" /> DuoLife Hub
              </span>
              <span>/</span>
              <span className="capitalize text-gray-700">
                {pathname === '/admin' ? 'Visão geral' : pathname.replace('/admin/', '').replace('-', ' ')}
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

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
