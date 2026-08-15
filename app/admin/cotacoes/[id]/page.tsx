import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { verifyAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { PagamentosPanel } from './_pagamentos-client';

export default async function AdminCotacaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth();
  if (!user || (user.role !== 'duolife_admin' && user.role !== 'duolife_staff')) {
    redirect('/login');
  }

  const { id } = await params;

  const [cotacao] = await sql`
    SELECT
      c.id, c.client_name, c.client_cpf_cnpj, c.client_email, c.client_phone,
      c.status, c.premio_final, c.created_at,
      p.name AS product_name,
      part.nome_fantasia AS partner_name
    FROM cotacoes c
    JOIN products p ON p.id = c.product_id
    JOIN partners part ON part.id = c.partner_id
    WHERE c.id = ${id}
  `;

  if (!cotacao) notFound();

  return (
    <div className="bg-[#F9FAFB] min-h-screen -m-6 p-6 sm:p-10 font-sans">
      <div className="max-w-[900px] mx-auto">
        <Link href="/admin/cotacoes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Voltar
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{cotacao.client_name}</h1>
          <p className="text-sm text-gray-500 mt-1">{cotacao.client_cpf_cnpj} · {cotacao.client_email || 'sem e-mail'} · {cotacao.client_phone || 'sem telefone'}</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-gray-500 text-xs uppercase">Status</div><div className="font-semibold">{cotacao.status}</div></div>
            <div><div className="text-gray-500 text-xs uppercase">Produto</div><div className="font-semibold">{cotacao.product_name}</div></div>
            <div><div className="text-gray-500 text-xs uppercase">Parceiro</div><div className="font-semibold">{cotacao.partner_name}</div></div>
            <div><div className="text-gray-500 text-xs uppercase">Criada em</div><div className="font-semibold">{new Date(cotacao.created_at).toLocaleDateString('pt-BR')}</div></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Pagamentos</h2>
          <PagamentosPanel cotacaoId={cotacao.id} />
        </div>
      </div>
    </div>
  );
}
