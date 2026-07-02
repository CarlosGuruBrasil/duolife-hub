import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, DollarSign, FileText, Mail, MessageCircle, Plus, WalletCards } from 'lucide-react';

export default async function PortalDashboard() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  await ensureSchema();

  // KPIs do parceiro
  const [cotacoesCount] = await sql`
    SELECT COUNT(*) as total FROM cotacoes WHERE partner_id = ${user.partnerId!}
  `;
  const [vendasCount] = await sql`
    SELECT COUNT(*) as total, COALESCE(SUM(premio_total), 0) as volume
    FROM sales WHERE partner_id = ${user.partnerId!} AND status = 'ativa'
  `;
  const [comissoesCount] = await sql`
    SELECT COALESCE(SUM(amount), 0) as pendente
    FROM commissions WHERE partner_id = ${user.partnerId!} AND status = 'pendente'
  `;
  const [leadsCount] = await sql`
    SELECT COUNT(*) as total FROM leads WHERE partner_id = ${user.partnerId!}
  `;

  const kpis = [
    { label: 'Cotações realizadas', value: cotacoesCount.total, icon: ClipboardList, href: '/portal/cotacoes' },
    { label: 'Apólices ativas', value: vendasCount.total, icon: FileText, href: '/portal/vendas' },
    { label: 'Volume em prêmios', value: `R$ ${Number(vendasCount.volume).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, href: '/portal/vendas' },
    { label: 'Comissões pendentes', value: `R$ ${Number(comissoesCount.pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: WalletCards, href: '/portal/comissoes' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>Bom dia, {user.name.split(' ')[0]}.</h1>
          <p className="text-gray-500 text-sm mt-1">Aqui está um resumo da sua conta.</p>
        </div>
        <Link href="/portal/cotacoes/nova" className="btn-primary">
          <Plus size={16} /> Nova Cotação
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpis.map(k => {
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

      {/* Ações rápidas */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="font-bold mb-4" style={{ color: 'var(--primary)' }}>Ações rápidas</h3>
          <div className="space-y-3">
            <Link href="/portal/cotacoes/nova"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              style={{ color: 'var(--primary)' }}>
              <ClipboardList size={17} /> Nova cotação — Seguro RC
            </Link>
            <Link href="/portal/vendas"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              style={{ color: 'var(--primary)' }}>
              <FileText size={17} /> Ver minhas vendas
            </Link>
            <Link href="/portal/comissoes"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              style={{ color: 'var(--primary)' }}>
              <WalletCards size={17} /> Extrato de comissões
            </Link>
          </div>
        </div>

        <div className="card md:col-span-2">
          <h3 className="font-bold mb-4" style={{ color: 'var(--primary)' }}>Suporte DuoLife</h3>
          <p className="text-sm text-gray-500 mb-4">
            Nossa equipe está disponível para ajudar você em qualquer etapa da jornada de vendas.
          </p>
          <div className="flex gap-3 flex-wrap">
            <a href="https://wa.me/554799648081" target="_blank" rel="noopener"
              className="btn-accent text-sm py-2">
              <MessageCircle size={16} /> WhatsApp Comercial
            </a>
            <a href="mailto:operacional@duolife.net.br"
              className="btn-outline text-sm py-2">
              <Mail size={16} /> E-mail Operacional
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
