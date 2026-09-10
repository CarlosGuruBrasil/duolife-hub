import { redirect } from 'next/navigation';
import PortalShell from './_components/PortalShell';
import { verifyPartnerAuth } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyPartnerAuth();
  if (!user) {
    redirect('/login');
  }

  return <PortalShell user={user}>{children}</PortalShell>;
}
