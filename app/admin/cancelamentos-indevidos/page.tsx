import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { CanceladosIndevidosView } from './_client';

export const metadata = {
  title: 'Cancelamentos Indevidos — Desenvolvimento | DuoLife Hub',
  description: 'Levantamento de segurados com faturas canceladas indevidamente e ferramenta de reativação de cobranças residuais.',
};

export default async function CancelamentosIndevidosPage() {
  const user = await verifyAdminAuth();
  if (!user) {
    redirect('/login');
  }

  return <CanceladosIndevidosView user={user} />;
}
