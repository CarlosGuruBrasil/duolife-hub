import { redirect } from 'next/navigation';
import { verifyAuth, isInternalUser } from '@/lib/auth';
import { compareClientsWithWix } from '@/lib/wix-compare';
import WixComparisonClient from './_client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Comparativo Wix Import1 · DuoLife Admin',
  description: 'Auditoria e comparativo de clientes entre o banco de dados e a coleção Import1 do Wix.',
};

export default async function AdminComparativoWixPage() {
  const user = await verifyAuth();
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  const comparisonData = await compareClientsWithWix();

  return <WixComparisonClient initialData={comparisonData} />;
}
