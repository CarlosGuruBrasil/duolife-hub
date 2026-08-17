import PortalShell from './_components/PortalShell';
import { verifyAuth } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyAuth();
  return <PortalShell user={user}>{children}</PortalShell>;
}
