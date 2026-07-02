import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { Building2, FileText, Users, WalletCards } from 'lucide-react';

export default async function AdminDashboard() {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const [parceiros] = await sql`SELECT COUNT(*) as total FROM partners`;
  const [pendentes] = await sql`SELECT COUNT(*) as total FROM partners WHERE status = 'pending'`;
  const [vendas] = await sql`
    SELECT COUNT(*) as total, COALESCE(SUM(premio_total), 0) as volume
    FROM sales WHERE status = 'ativa'
  `;
  const [comissoes] = await sql`
    SELECT COALESCE(SUM(amount), 0) as pendente FROM commissions WHERE status = 'pendente'
  `;

  const kpis = [
    { label: 'Parceiros ativos', value: parceiros.total, icon: Building2, href: '/admin/parceiros' },
    { label: 'Aguardando aprovação', value: pendentes.total, icon: Users, href: '/admin/parceiros?status=pending' },
    { label: 'Volume total em prêmios', value: `R$ ${Number(vendas.volume).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: FileText, href: '/admin/vendas' },
    { label: 'Comissões a pagar', value: `R$ ${Number(comissoes.pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: WalletCards, href: '/admin/comissoes' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>
          Olá, {user.name.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral da plataforma DuoLife.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} href={k.href} className="card hover:shadow-md transition-shadow">
              <div className="icon-box mb-3"><Icon size={22} /></div>
              <div className="text-2xl font-black mb-1" style={{ color: 'var(--primary)' }}>{k.value}</div>
              <div className="text-xs text-gray-500">{k.label}</div>
            </Link>
          );
        })}
      </div>

      <div className="card">
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--primary)' }}>Ações rápidas</h2>
        <div className="flex gap-3 flex-wrap">
          <Link href="/admin/parceiros" className="btn-primary">Ver parceiros</Link>
          <Link href="/admin/parceiros?status=pending" className="btn-outline">Aprovar pendentes</Link>
        </div>
      </div>
    </div>
  );
}
