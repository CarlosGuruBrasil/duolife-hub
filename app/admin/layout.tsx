import { redirect } from 'next/navigation';
import AdminShell from './_components/AdminShell';
import { verifyAdminAuth } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyAdminAuth();
  if (!user) {
    redirect('/login');
  }

  return (
    <AdminShell user={user}>{children}</AdminShell>
  );
}
