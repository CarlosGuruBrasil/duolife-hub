import Link from 'next/link';
import Image from 'next/image';
import { BarChart3, Building2, FileText, LogOut, RefreshCw, Users, WalletCards } from 'lucide-react';

const nav = [
  { href: '/admin', label: 'Dashboard', icon: BarChart3 },
  { href: '/admin/parceiros', label: 'Parceiros', icon: Building2 },
  { href: '/admin/vendas', label: 'Vendas', icon: FileText },
  { href: '/admin/comissoes', label: 'Comissões', icon: WalletCards },
  { href: '/admin/sync', label: 'Sync', icon: RefreshCw },
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--accent-soft)' }}>
      <aside className="w-64 flex flex-col shadow-lg" style={{ background: 'var(--primary-dark)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <Link href="/" className="brand-plate is-sidebar">
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
          <div className="mt-3 text-xs font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--secondary)' }}>
            Painel Admin
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                style={{ color: '#d7e6e8' }}
              >
                <Icon size={17} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors"
              style={{ color: 'var(--secondary)' }}
            >
              <LogOut size={17} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>

  );
}
