import { redirect } from 'next/navigation';
import { canManageTeam, verifyPartnerAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import EquipeClient from './_client';

export const metadata = {
  title: 'Minha Equipe de Vendedores | DuoLife Hub',
  description: 'Gerencie os corretores, parceiros e vendedores da sua corretora.',
};

export default async function EquipePage() {
  const user = await verifyPartnerAuth();
  if (!user) {
    redirect('/login');
  }

  if (!canManageTeam(user)) {
    redirect('/portal');
  }

  await ensureSchema();

  return <EquipeClient user={user} />;
}
