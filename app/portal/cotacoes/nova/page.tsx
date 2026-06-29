import Link from 'next/link';
import { redirect } from 'next/navigation';
import CotacaoForm from '@/components/portal/CotacaoForm';
import { verifyPartnerAuth } from '@/lib/auth';

export default async function NovaCotacaoPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');

  return (
    <div>
      <div className="mb-8">
        <Link href="/portal/cotacoes" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
          ← Voltar para cotações
        </Link>
        <h1 className="page-title mt-3">Nova Cotação</h1>
        <p className="muted mt-1 text-sm">
          Cadastre os dados iniciais do segurado para iniciar uma cotação de Seguro RC.
        </p>
      </div>

      <CotacaoForm />
    </div>
  );
}
