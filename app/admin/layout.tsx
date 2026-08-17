import AdminShell from './_components/AdminShell';
import { verifyAdminAuth } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyAdminAuth();
  return (
    <AdminShell user={user}>{children}</AdminShell>
  );
}
