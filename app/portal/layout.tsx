'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardList, FileText, LogOut, UserRound, Users, WalletCards } from 'lucide-react';

const nav = [
  { href: '/portal', label: 'Dashboard', icon: BarChart3 },
  { href: '/portal/cotacoes', label: 'Cotações', icon: ClipboardList },
  { href: '/portal/clientes', label: 'Clientes', icon: Users },
  { href: '/portal/vendas', label: 'Vendas', icon: FileText },
  { href: '/portal/comissoes', label: 'Comissões', icon: WalletCards },
  { href: '/portal/perfil', label: 'Perfil', icon: UserRound },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--accent-soft)' }}>
      {/* Sidebar */}
      <aside className="w-64 h-screen flex flex-col shadow-lg fixed left-0 top-0 z-50" style={{ background: 'var(--primary)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-horizontal.png"
              alt="DuoLife Hub de Negócios"
              width={150}
              height={31}
              className="h-7 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
              priority
            />
          </Link>
          <div className="mt-3 text-xs font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Portal do Parceiro
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.href;
            return (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: active ? '#ffffff' : '#a8c8cc',
                background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
                fontWeight: active ? 700 : 500,
              }}>
              <Icon size={17} />
              {n.label}
            </Link>
          );
          })}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <form action="/api/auth/logout" method="POST">
            <button type="submit"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors"
              style={{ color: 'var(--secondary)' }}>
              <LogOut size={17} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
