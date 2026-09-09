import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { ShieldAlert } from 'lucide-react';
import { compareClientsWithWix } from '@/lib/wix-compare';
import WixComparisonClient from './_client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Comparativo Wix Import1 · DuoLife Admin',
  description: 'Auditoria e comparativo de clientes entre o banco de dados e a coleção Import1 do Wix.',
};

export default async function AdminComparativoWixPage() {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  if (!roleIsDev(user.role)) {
    return (
      <div className="space-y-6">
        <section className="admin-hero-card">
          <div>
            <span className="admin-eyebrow text-red-500 font-bold">ACESSO RESTRITO</span>
            <h1 className="admin-page-title text-gray-900">Acesso Restrito a Desenvolvedores</h1>
            <p className="admin-page-copy">
              Esta área contém ferramentas de auditoria e desenvolvimento da plataforma DuoLife.
            </p>
          </div>
        </section>

        <div className="bg-red-50/80 border border-red-200 rounded-2xl p-8 text-center max-w-2xl mx-auto shadow-xs">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-100 rounded-full text-red-600">
              <ShieldAlert className="w-10 h-10" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-red-900 mb-2">Permissão Insuficiente</h2>
          <p className="text-sm text-red-700 leading-relaxed mb-6">
            Apenas usuários com o papel de <strong>Desenvolvedor (`duolife_dev`)</strong> possuem autorização para visualizar ou sincronizar dados no comparativo com o Wix.
          </p>
          <a
            href="/admin"
            className="inline-flex items-center px-6 py-2.5 rounded-xl bg-[#0e4a5a] text-white font-bold text-sm shadow-md hover:bg-[#072a33] transition-all"
          >
            Voltar para o Painel Principal
          </a>
        </div>
      </div>
    );
  }

  const comparisonData = await compareClientsWithWix();

  return <WixComparisonClient initialData={comparisonData} />;
}
