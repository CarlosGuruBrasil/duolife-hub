import Link from 'next/link';
import { redirect } from 'next/navigation';
import CotacaoFormRC from '@/components/portal/CotacaoFormRC';
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
        <h1 className="page-title mt-3">Nova Proposta / Venda RC ADV</h1>
        <p className="muted mt-1 text-sm">
          Preencha as etapas abaixo para emitir a proposta e assinar digitalmente o Seguro de Responsabilidade Civil.
        </p>
      </div>

      <CotacaoFormRC />
    </div>
  );
}

