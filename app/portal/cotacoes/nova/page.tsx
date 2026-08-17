import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import CotacaoFormRC from '@/components/portal/CotacaoFormRC';
import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';

type Product = { id: string; name: string; description: string | null; product_type: 'insurance' | 'service'; flow_key: string; is_quoteable: boolean };

export default async function NovaCotacaoPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const user = await verifyPartnerAuth();
  if (!user?.partnerId) redirect('/login');
  const { product: productId } = await searchParams;
  const products = await sql<Product[]>`
    SELECT p.id, p.name, p.description, p.product_type, p.flow_key, p.is_quoteable
    FROM products p JOIN partner_product_availability ppa ON ppa.product_id = p.id
    WHERE ppa.partner_id = ${user.partnerId} AND ppa.is_active = true AND p.is_active = true
    ORDER BY p.name
  `;

  if (!productId) return (
    <div>
      <div className="mb-8"><Link href="/portal/cotacoes" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>← Voltar para operações</Link><h1 className="page-title mt-3">Nova operação</h1><p className="muted mt-1 text-sm">Escolha o produto ou serviço que deseja iniciar.</p></div>
      {products.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center"><ClipboardList className="mx-auto mb-3 text-gray-400" size={28} /><h2 className="font-semibold text-gray-900">Nenhuma oferta disponível</h2><p className="mt-1 text-sm text-gray-500">Fale com a DuoLife para habilitar produtos para sua operação.</p></div> : <div className="grid gap-4 md:grid-cols-2">{products.map((product) => {
        const ready = product.is_quoteable && product.flow_key === 'rc_professional_v1';
        return <div key={product.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><ShieldCheck size={22} style={{ color: 'var(--primary)' }} /><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{product.product_type === 'insurance' ? 'Seguro' : 'Serviço'}</span></div><h2 className="font-semibold text-gray-900">{product.name}</h2><p className="mt-2 min-h-10 text-sm text-gray-500">{product.description || 'Oferta disponível para sua operação.'}</p>{ready ? <Link href={`/portal/cotacoes/nova?product=${encodeURIComponent(product.id)}`} className="mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--primary)' }}>Continuar</Link> : <span className="mt-5 inline-flex rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">Em breve</span>}</div>;
      })}</div>}
    </div>
  );

  const product = products.find((item) => item.id === productId);
  if (!product) redirect('/portal/cotacoes/nova');
  if (!product.is_quoteable || product.flow_key !== 'rc_professional_v1') return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h1 className="font-semibold text-amber-900">Este fluxo ainda não está disponível</h1><p className="mt-1 text-sm text-amber-800">A oferta foi habilitada, mas a jornada digital ainda está em preparação.</p><Link href="/portal/cotacoes/nova" className="mt-4 inline-block text-sm font-semibold text-amber-900 underline">Voltar ao catálogo</Link></div>;

  return <div><div className="mb-8"><Link href="/portal/cotacoes/nova" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>← Trocar produto</Link><h1 className="page-title mt-3">{product.name}</h1><p className="muted mt-1 text-sm">Preencha as etapas para iniciar sua proposta.</p></div><CotacaoFormRC productId={product.id} /></div>;
}
