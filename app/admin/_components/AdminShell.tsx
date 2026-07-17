'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Building2,
  FileSpreadsheet,
  LogOut,
  Menu,
  RefreshCw,
  Shield,
  Users,
  WalletCards,
  X,
} from 'lucide-react';

interface AdminShellProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Operacao',
    items: [
      { href: '/admin', label: 'Dashboard', icon: BarChart3, description: 'Visao geral do mes, funil e carteira.' },
      { href: '/admin/relatorios', label: 'Relatorios', icon: FileSpreadsheet, description: 'Geral detalhado, financeiro e sincronizacoes.' },
      { href: '/admin/cotacoes', label: 'Cotacoes', icon: Briefcase, description: 'Producao comercial, assinatura e cobranca.' },
      { href: '/admin/vendas', label: 'Vendas', icon: Shield, description: 'Apolices emitidas e premio total.' },
      { href: '/admin/comissoes', label: 'Comissoes', icon: WalletCards, description: 'Pendencias, pagamentos e extrato.' },
    ],
  },
  {
    title: 'Rede',
    items: [
      { href: '/admin/parceiros', label: 'Parceiros', icon: Building2, description: 'Corretoras, status e estrutura comercial.' },
      { href: '/admin/clientes', label: 'Clientes', icon: Users, description: 'Carteira consolidada de segurados.' },
      { href: '/admin/usuarios', label: 'Usuarios', icon: Shield, description: 'Acessos internos da operacao.' },
      { href: '/admin/sync', label: 'Sync Wix', icon: RefreshCw, description: 'Espelhamento e saude de integracao.' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-shell min-h-screen">
      {open && (
        <button
          aria-label="Fechar menu"
          className="admin-shell-backdrop lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      )}

      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-brand-row">
          <div>
            <div className="admin-brand-mark">DuoLife RC</div>
            <p className="admin-brand-copy">Operacao, producao, cobranca e rede comercial em um so painel.</p>
          </div>
          <button
            aria-label="Fechar menu"
            className="admin-icon-button lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="h-5 w-5" />
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
            <button type="submit" className="admin-logout-button">
              <LogOut className="h-4 w-4" />
              Sair da operacao
            </button>
          </form>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            aria-label="Abrir menu"
            className="admin-icon-button lg:hidden"
            onClick={() => setOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <div className="admin-topbar-title">Central administrativa DuoLife</div>
            <div className="admin-topbar-copy">Mesmo teor operacional da Net4Life, adaptado para RC e rede DuoLife.</div>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
